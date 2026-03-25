package evals

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
)

type FixtureResult struct {
	Name             string               `json:"name"`
	RepoPath         string               `json:"repoPath"`
	Outcome          contracts.RunOutcome `json:"outcome"`
	SchemaIssues     int                  `json:"schemaIssues"`
	SemanticIssues   int                  `json:"semanticIssues"`
	ValidationPassed bool                 `json:"validationPassed"`
	NextAction       string               `json:"nextAction,omitempty"`
}

type Summary struct {
	Root     string                `json:"root"`
	Mode     contracts.SessionMode `json:"mode"`
	Total    int                   `json:"total"`
	Outcomes map[string]int        `json:"outcomes"`
	Fixtures []FixtureResult       `json:"fixtures"`
}

func RunBenchmarks(ctx context.Context, repoRoot string, stateDir string, sources string, benchRoot string, mode contracts.SessionMode) (*Summary, error) {
	service, err := session.NewService(ctx, repoRoot, stateDir, sources)
	if err != nil {
		return nil, err
	}
	defer service.Close()

	fixtures, err := discoverFixtures(benchRoot)
	if err != nil {
		return nil, err
	}

	summary := &Summary{
		Root:     benchRoot,
		Mode:     mode,
		Outcomes: map[string]int{},
		Fixtures: make([]FixtureResult, 0, len(fixtures)),
	}

	for _, repoPath := range fixtures {
		report, err := service.Run(ctx, contracts.SessionRequest{
			RepoPath: repoPath,
			Goal:     "benchmark validation and repair",
			Mode:     mode,
			ApprovalPolicy: contracts.ApprovalPolicy{
				RequireWriteApproval: mode == contracts.ModeReview,
			},
			StateDir: filepath.Join(stateDir, "benchmarks", filepath.Base(repoPath)),
		})
		if err != nil {
			return nil, fmt.Errorf("run benchmark %s: %w", repoPath, err)
		}

		result := FixtureResult{
			Name:             filepath.Base(repoPath),
			RepoPath:         repoPath,
			Outcome:          report.Outcome,
			SchemaIssues:     len(report.Evidence.ValidationResult.SchemaIssues),
			SemanticIssues:   len(report.Evidence.ValidationResult.SemanticIssues),
			ValidationPassed: report.Evidence.ValidationResult.Passed,
			NextAction:       report.NextAction,
		}
		summary.Fixtures = append(summary.Fixtures, result)
		summary.Outcomes[string(report.Outcome)]++
	}

	summary.Total = len(summary.Fixtures)
	return summary, nil
}

func discoverFixtures(root string) ([]string, error) {
	set := map[string]bool{}
	if err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || d.Name() != "flogo.json" {
			return nil
		}
		set[filepath.Dir(path)] = true
		return nil
	}); err != nil {
		return nil, err
	}

	fixtures := make([]string, 0, len(set))
	for path := range set {
		fixtures = append(fixtures, path)
	}
	sort.Strings(fixtures)
	return fixtures, nil
}
