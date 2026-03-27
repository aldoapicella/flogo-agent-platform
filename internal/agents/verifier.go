package agents

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
	"github.com/aldoapicella/flogo-agent-platform/internal/tools"
)

type Verifier struct {
	flogoClient *tools.FlogoClient
}

const startupSmokeTimeout = 3 * time.Second

func NewVerifier(flogoClient *tools.FlogoClient) *Verifier {
	return &Verifier{flogoClient: flogoClient}
}

func (v *Verifier) Validate(doc *flogo.Document) (contracts.ValidationResult, error) {
	schemaIssues, err := flogo.ValidateSchema(doc)
	if err != nil {
		return contracts.ValidationResult{}, err
	}
	semanticIssues := flogo.ValidateSemantics(doc)
	return contracts.ValidationResult{
		SchemaIssues:   schemaIssues,
		SemanticIssues: semanticIssues,
		Passed:         !hasBlockingIssues(schemaIssues) && !hasBlockingIssues(semanticIssues),
	}, nil
}

func (v *Verifier) BuildAndTest(ctx context.Context, repoPath string, workspaceRoot string) (*contracts.ToolResult, []contracts.TestResult, error) {
	results := []contracts.TestResult{}

	if err := os.RemoveAll(workspaceRoot); err != nil {
		return nil, results, err
	}
	if err := os.MkdirAll(filepath.Dir(workspaceRoot), 0o755); err != nil {
		return nil, results, err
	}

	createResult, err := v.flogoClient.CreateSource(ctx, repoPath, workspaceRoot)
	if err != nil {
		return nil, results, err
	}
	if createResult.ExitCode != 0 {
		return &createResult, results, nil
	}

	orphanResult, err := v.flogoClient.ListOrphaned(ctx, workspaceRoot)
	if err != nil {
		return &createResult, results, err
	}
	results = append(results, contracts.TestResult{
		Name:   "orphaned-check",
		Result: orphanResult,
		Passed: orphanResult.ExitCode == 0,
	})

	if err := copyIfExists(filepath.Join(repoPath, ".flogotest"), filepath.Join(workspaceRoot, ".flogotest")); err != nil {
		return nil, results, err
	}

	buildResult, err := v.flogoClient.BuildWithOptions(ctx, workspaceRoot, tools.BuildOptions{
		Embed:       true,
		SyncImports: true,
	})
	if err != nil {
		return nil, results, err
	}
	buildResult.ArtifactPaths = append(createResult.ArtifactPaths, buildResult.ArtifactPaths...)
	if buildResult.ExitCode != 0 {
		return &buildResult, results, nil
	}

	executablePath, err := v.flogoClient.FindExecutable(workspaceRoot)
	if err != nil {
		buildResult.Error = fmt.Sprintf("build succeeded but no executable was found: %v", err)
		return &buildResult, results, nil
	}

	startupResult, err := v.flogoClient.StartupSmoke(ctx, executablePath, workspaceRoot, startupSmokeTimeout)
	if err != nil {
		return &buildResult, results, err
	}
	startupTest := contracts.TestResult{
		Name:   "startup-smoke",
		Result: startupResult,
		Passed: startupResult.ExitCode == 0,
	}
	results = append(results, startupTest)
	if !startupTest.Passed {
		return &buildResult, results, nil
	}

	if _, err := os.Stat(filepath.Join(workspaceRoot, ".flogotest")); err == nil {
		outputDir := filepath.Join(workspaceRoot, "test-results")
		if err := os.MkdirAll(outputDir, 0o755); err != nil {
			return &buildResult, results, err
		}

		testResult, err := v.flogoClient.RunUnitTests(ctx, executablePath, workspaceRoot, tools.UnitTestOptions{
			AppFile:        filepath.Join(workspaceRoot, "flogo.json"),
			TestFile:       filepath.Join(workspaceRoot, ".flogotest"),
			OutputDir:      outputDir,
			ResultFilename: filepath.Base(repoPath) + ".testresult",
		})
		if err != nil {
			return &buildResult, results, err
		}
		unitResult := contracts.TestResult{
			Name:   "unit-tests",
			Result: testResult,
			Passed: testResult.ExitCode == 0,
		}
		if unsupportedExecutableTestMode(testResult) {
			unitResult.Skipped = true
			unitResult.SkipReason = "the built executable does not support Flogo -test flags"
		}
		results = append(results, unitResult)
		return &buildResult, results, nil
	}

	listFlows, err := v.flogoClient.ListFlows(ctx, executablePath, workspaceRoot)
	if err != nil {
		return &buildResult, results, err
	}
	flowListResult := contracts.TestResult{
		Name:   "flow-list",
		Result: listFlows,
		Passed: listFlows.ExitCode == 0,
	}
	if unsupportedExecutableTestMode(listFlows) {
		flowListResult.Skipped = true
		flowListResult.SkipReason = "the built executable does not support Flogo -test flags"
	}
	results = append(results, flowListResult)
	if flowListResult.Skipped {
		return &buildResult, results, nil
	}
	if listFlows.ExitCode != 0 {
		return &buildResult, results, nil
	}

	flowName, err := firstFlowName(repoPath)
	if err != nil {
		return &buildResult, results, err
	}
	if flowName == "" {
		return &buildResult, results, nil
	}

	generateResult, err := v.flogoClient.GenerateFlowData(ctx, executablePath, workspaceRoot, flowName)
	if err != nil {
		return &buildResult, results, err
	}
	results = append(results, contracts.TestResult{
		Name:   "flow-generate-data",
		Result: generateResult,
		Passed: generateResult.ExitCode == 0,
	})
	if generateResult.ExitCode != 0 {
		return &buildResult, results, nil
	}

	inputFile, err := generatedFlowInput(workspaceRoot)
	if err != nil {
		return &buildResult, results, err
	}
	if inputFile == "" {
		return &buildResult, results, nil
	}

	flowOutput := filepath.Join(workspaceRoot, "flow-output.json")
	testResult, err := v.flogoClient.RunFlowTest(ctx, executablePath, workspaceRoot, inputFile, flowOutput)
	if err != nil {
		return &buildResult, results, err
	}
	results = append(results, contracts.TestResult{
		Name:    "flow-tests",
		Result:  testResult,
		Passed:  testResult.ExitCode == 0,
		Skipped: testResult.ExitCode == -1,
	})

	return &buildResult, results, nil
}

func (v *Verifier) InspectBuildArtifacts(ctx context.Context, repoPath string, workspaceRoot string) (flogo.BuildArtifactFacts, []contracts.Observation, error) {
	facts := flogo.BuildArtifactFacts{
		RepoPath:      repoPath,
		WorkspacePath: workspaceRoot,
	}
	observations := []contracts.Observation{
		{
			Kind:    "workspace",
			Summary: fmt.Sprintf("The generated workspace path is %s.", workspaceRoot),
			Data: map[string]string{
				"workspace_path": workspaceRoot,
			},
		},
	}

	if _, err := os.Stat(workspaceRoot); err != nil {
		if os.IsNotExist(err) {
			observations = append(observations, contracts.Observation{
				Kind:    "binary",
				Summary: "No generated workspace exists yet. Build the app before trying to run it locally.",
				Data: map[string]string{
					"workspace_path": workspaceRoot,
				},
			})
			return facts, observations, nil
		}
		return facts, observations, err
	}

	executablePath, err := v.flogoClient.FindExecutable(workspaceRoot)
	if err != nil {
		observations = append(observations, contracts.Observation{
			Kind:    "binary",
			Summary: fmt.Sprintf("No built executable was found under %s/bin yet.", workspaceRoot),
			Data: map[string]string{
				"workspace_path": workspaceRoot,
			},
		})
		return facts, observations, nil
	}

	facts.ExecutablePath = executablePath
	observations = append(observations, contracts.Observation{
		Kind:    "binary",
		Summary: fmt.Sprintf("The built executable is %s.", executablePath),
		Data: map[string]string{
			"path":           executablePath,
			"start_command":  executablePath,
			"workspace_path": workspaceRoot,
		},
	})

	listFlows, err := v.flogoClient.ListFlows(ctx, executablePath, workspaceRoot)
	if err != nil {
		return facts, observations, err
	}
	facts.TestSupportKnown = true
	facts.SupportsTestFlags = listFlows.ExitCode == 0
	if unsupportedExecutableTestMode(listFlows) {
		facts.SupportsTestFlags = false
	}

	summary := "The built executable supports Flogo -test flags."
	if !facts.SupportsTestFlags {
		summary = "The built executable does not support Flogo -test flags, so local testing should use startup and trigger-level probes."
	}
	observations = append(observations, contracts.Observation{
		Kind:    "test_support",
		Summary: summary,
		Data: map[string]string{
			"supports_test_flags": strconv.FormatBool(facts.SupportsTestFlags),
		},
	})

	return facts, observations, nil
}

func unsupportedExecutableTestMode(result contracts.ToolResult) bool {
	if result.ExitCode == 0 || result.StderrPath == "" {
		return false
	}
	stderr, err := os.ReadFile(result.StderrPath)
	if err != nil {
		return false
	}
	text := strings.ToLower(string(stderr))
	return strings.Contains(text, "flag provided but not defined: -test")
}

func copyIfExists(src string, dst string) error {
	contents, err := os.ReadFile(src)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return os.WriteFile(dst, contents, 0o644)
}

func firstFlowName(repoPath string) (string, error) {
	doc, err := flogo.LoadDocument(repoPath)
	if err != nil {
		return "", err
	}
	for _, id := range doc.ResourceIDs() {
		if strings.HasPrefix(id, "flow:") {
			return strings.TrimPrefix(id, "flow:"), nil
		}
	}
	return "", nil
}

func generatedFlowInput(workspaceRoot string) (string, error) {
	matches, err := filepath.Glob(filepath.Join(workspaceRoot, "*_input.json"))
	if err != nil {
		return "", err
	}
	if len(matches) == 0 {
		return "", nil
	}
	return matches[0], nil
}

func hasBlockingIssues(items []contracts.ValidationIssue) bool {
	for _, item := range items {
		if strings.EqualFold(item.Severity, "warning") {
			continue
		}
		return true
	}
	return false
}
