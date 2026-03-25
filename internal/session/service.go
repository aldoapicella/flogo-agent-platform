package session

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/aldoapicella/flogo-agent-platform/internal/agents"
	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
	"github.com/aldoapicella/flogo-agent-platform/internal/knowledge"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
	"github.com/aldoapicella/flogo-agent-platform/internal/tools"
)

type Service struct {
	retriever *agents.Retriever
	repairer  *agents.Repairer
	verifier  *agents.Verifier
	store     *knowledge.Store
	repoRoot  string
	stateDir  string
	options   Options

	mu      sync.Mutex
	pending *contracts.SessionRequest
}

type Options struct {
	Sandbox sandbox.Config
	Model   model.Client
}

func NewService(ctx context.Context, repoRoot string, stateDir string, manifestPath string) (*Service, error) {
	return NewServiceWithOptions(ctx, repoRoot, stateDir, manifestPath, Options{})
}

func NewServiceWithOptions(ctx context.Context, repoRoot string, stateDir string, manifestPath string, options Options) (*Service, error) {
	if stateDir == "" {
		stateDir = filepath.Join(repoRoot, ".flogo-agent")
	}
	if options.Sandbox.Profile == "" {
		options.Sandbox = sandbox.DefaultConfig()
	}

	knowledgePath := filepath.Join(stateDir, "knowledge.db")
	store, err := knowledge.Open(ctx, knowledgePath)
	if err != nil {
		return nil, err
	}

	manifestPath, err = knowledge.ResolveManifestPath(stateDir, repoRoot, manifestPath)
	if err != nil {
		return nil, err
	}
	if err := knowledge.IngestManifest(ctx, repoRoot, store, manifestPath); err != nil {
		return nil, err
	}

	artifactRoot := filepath.Join(stateDir, "artifacts")
	runner := sandbox.NewRunner(artifactRoot, options.Sandbox)
	flogoClient := tools.NewFlogoClient(runner)
	modelClient := options.Model
	if modelClient == nil {
		var err error
		modelClient, err = model.NewFromEnv()
		if err != nil {
			return nil, err
		}
	}

	return &Service{
		retriever: agents.NewRetriever(store),
		repairer:  agents.NewRepairer(modelClient),
		verifier:  agents.NewVerifier(flogoClient),
		store:     store,
		repoRoot:  repoRoot,
		stateDir:  stateDir,
		options:   options,
	}, nil
}

func (s *Service) Close() error {
	if s.store == nil {
		return nil
	}
	return s.store.Close()
}

func (s *Service) Run(ctx context.Context, req contracts.SessionRequest) (*contracts.RunReport, error) {
	maxIterations := 3
	report := &contracts.RunReport{}
	if req.StateDir == "" {
		req.StateDir = s.stateDir
	}
	for iteration := 1; iteration <= maxIterations; iteration++ {
		doc, err := flogo.LoadDocument(req.RepoPath)
		if err != nil {
			return nil, err
		}

		validation, err := s.verifier.Validate(doc)
		if err != nil {
			return nil, err
		}
		attachCitations(ctx, s.retriever, &validation)

		report.Evidence.ValidationResult = validation
		report.Evidence.Iteration = iteration

		if !validation.Passed {
			citations := collectCitations(validation)
			patchPlan, notes, err := s.repairer.BuildPatchPlan(ctx, doc, validation, citations)
			if err != nil {
				return nil, err
			}
			report.PatchPlan = patchPlan
			report.Citations = citations
			report.Messages = append(report.Messages, notes...)

			if patchPlan == nil {
				report.Outcome = contracts.RunOutcomeBlocked
				report.NextAction = "no safe automated repair was available"
				s.clearPending()
				return report, nil
			}

			if req.Mode == contracts.ModeReview || req.ApprovalPolicy.RequireWriteApproval || !patchPlan.Safe {
				report.Outcome = contracts.RunOutcomeReady
				if patchPlan.Safe {
					report.NextAction = "review the proposed patch before applying"
				} else {
					report.NextAction = "review the model-generated patch before applying"
				}
				s.setPending(req)
				return report, nil
			}

			if err := flogo.ApplyPatchPlan(doc); err != nil {
				return nil, err
			}
			report.ChangedFiles = []string{doc.Path}
			continue
		}

		buildResult, testResults, err := s.verifier.BuildAndTest(ctx, req.RepoPath, s.workspaceRoot(req.RepoPath, req.StateDir))
		if err != nil {
			return nil, err
		}
		report.Evidence.BuildResult = buildResult
		report.Evidence.TestResults = testResults

		if buildResult == nil || buildResult.ExitCode != 0 {
			report.Outcome = contracts.RunOutcomeBlocked
			report.NextAction = "install the flogo CLI or inspect the build artifacts"
			s.clearPending()
			return report, nil
		}
		if !testsPassed(testResults) {
			report.Outcome = contracts.RunOutcomeBlocked
			report.NextAction = "inspect the generated test artifacts and repair the failing flow or unit tests"
			s.clearPending()
			return report, nil
		}
		report.Outcome = contracts.RunOutcomeApplied
		report.NextAction = "validation, build, and available tests completed"
		s.clearPending()
		return report, nil
	}

	report.Outcome = contracts.RunOutcomeFailed
	report.NextAction = "exceeded maximum repair iterations"
	s.clearPending()
	return report, nil
}

func (s *Service) Analyze(ctx context.Context, req contracts.SessionRequest) (*contracts.RunReport, error) {
	report := &contracts.RunReport{}
	if req.StateDir == "" {
		req.StateDir = s.stateDir
	}

	doc, err := flogo.LoadDocument(req.RepoPath)
	if err != nil {
		return nil, err
	}

	validation, err := s.verifier.Validate(doc)
	if err != nil {
		return nil, err
	}
	attachCitations(ctx, s.retriever, &validation)

	report.Evidence.ValidationResult = validation
	report.Evidence.Iteration = 1

	if validation.Passed {
		report.Outcome = contracts.RunOutcomeApplied
		report.NextAction = "validation passed; build or test when ready"
		return report, nil
	}

	citations := collectCitations(validation)
	patchPlan, notes, err := s.repairer.BuildPatchPlan(ctx, doc, validation, citations)
	if err != nil {
		return nil, err
	}
	report.PatchPlan = patchPlan
	report.Citations = citations
	report.Messages = append(report.Messages, notes...)
	if patchPlan != nil {
		report.Outcome = contracts.RunOutcomeReady
		if patchPlan.Safe {
			report.NextAction = "review the proposed patch before applying"
		} else {
			report.NextAction = "review the model-generated patch before applying"
		}
		return report, nil
	}

	report.Outcome = contracts.RunOutcomeBlocked
	report.NextAction = "no safe automated repair was available"
	return report, nil
}

func (s *Service) ApplyPending(ctx context.Context) (*contracts.RunReport, error) {
	s.mu.Lock()
	if s.pending == nil {
		s.mu.Unlock()
		return nil, errors.New("no pending review to apply")
	}
	req := *s.pending
	s.mu.Unlock()

	req.Mode = contracts.ModeApply
	req.ApprovalPolicy.RequireWriteApproval = false
	return s.Run(ctx, req)
}

func (s *Service) HasPendingReview() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pending != nil
}

func attachCitations(ctx context.Context, retriever *agents.Retriever, validation *contracts.ValidationResult) {
	for idx := range validation.SchemaIssues {
		validation.SchemaIssues[idx].Citations = retriever.FindCitations(ctx, validation.SchemaIssues[idx], 3)
	}
	for idx := range validation.SemanticIssues {
		validation.SemanticIssues[idx].Citations = retriever.FindCitations(ctx, validation.SemanticIssues[idx], 3)
	}
}

func collectCitations(validation contracts.ValidationResult) []contracts.SourceCitation {
	unique := map[string]contracts.SourceCitation{}
	for _, issue := range append(validation.SchemaIssues, validation.SemanticIssues...) {
		for _, citation := range issue.Citations {
			key := citation.SourceID + "::" + citation.Locator
			unique[key] = citation
		}
	}
	out := make([]contracts.SourceCitation, 0, len(unique))
	for _, item := range unique {
		out = append(out, item)
	}
	return out
}

func EnsureRepoPath(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", path)
	}
	return nil
}

func (s *Service) setPending(req contracts.SessionRequest) {
	s.mu.Lock()
	defer s.mu.Unlock()
	copied := req
	s.pending = &copied
}

func (s *Service) clearPending() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pending = nil
}

func (s *Service) workspaceRoot(repoPath string, stateDir string) string {
	base := sanitizeName(filepath.Base(repoPath))
	return filepath.Join(stateDir, "workspaces", base)
}

func sanitizeName(value string) string {
	if value == "" {
		return "workspace"
	}
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
			continue
		}
		builder.WriteByte('-')
	}
	return strings.Trim(builder.String(), "-")
}

func testsPassed(results []contracts.TestResult) bool {
	for _, result := range results {
		if result.Skipped {
			continue
		}
		if !result.Passed {
			return false
		}
	}
	return true
}
