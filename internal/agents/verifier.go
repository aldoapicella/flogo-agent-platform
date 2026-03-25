package agents

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
	"github.com/aldoapicella/flogo-agent-platform/internal/tools"
)

type Verifier struct {
	flogoClient *tools.FlogoClient
}

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
	orphanResult, err := v.flogoClient.ListOrphaned(ctx, repoPath)
	if err != nil {
		return nil, nil, err
	}
	results := []contracts.TestResult{
		{
			Name:   "orphaned-check",
			Result: orphanResult,
			Passed: orphanResult.ExitCode == 0,
		},
	}

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

	buildResult, err := v.flogoClient.Build(ctx, workspaceRoot)
	if err != nil {
		return nil, results, err
	}
	buildResult.ArtifactPaths = append(createResult.ArtifactPaths, buildResult.ArtifactPaths...)
	if buildResult.ExitCode != 0 {
		return &buildResult, results, nil
	}

	if _, err := os.Stat(filepath.Join(repoPath, ".flogotest")); err == nil {
		testResult, err := v.flogoClient.RunUnitTests(ctx, workspaceRoot)
		if err != nil {
			return &buildResult, results, err
		}
		results = append(results, contracts.TestResult{
			Name:   "unit-tests",
			Result: testResult,
			Passed: testResult.ExitCode == 0,
		})
	} else {
		testResult, err := v.flogoClient.RunFlowTests(ctx, workspaceRoot)
		if err != nil {
			return &buildResult, results, err
		}
		results = append(results, contracts.TestResult{
			Name:    "flow-tests",
			Result:  testResult,
			Passed:  testResult.ExitCode == 0,
			Skipped: testResult.ExitCode == -1,
		})
	}

	return &buildResult, results, nil
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
