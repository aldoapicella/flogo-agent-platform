package agents

import (
	"context"
	"os"
	"path/filepath"

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
		Passed:         len(schemaIssues) == 0 && len(semanticIssues) == 0,
	}, nil
}

func (v *Verifier) BuildAndTest(ctx context.Context, repoPath string) (*contracts.ToolResult, []contracts.TestResult, error) {
	createResult, err := v.flogoClient.Create(ctx, repoPath)
	if err != nil {
		return nil, nil, err
	}
	buildResult, err := v.flogoClient.Build(ctx, repoPath)
	if err != nil {
		return nil, nil, err
	}
	buildResult.ArtifactPaths = append(createResult.ArtifactPaths, buildResult.ArtifactPaths...)

	results := []contracts.TestResult{}

	if _, err := os.Stat(filepath.Join(repoPath, ".flogotest")); err == nil {
		testResult, err := v.flogoClient.RunUnitTests(ctx, repoPath)
		if err != nil {
			return &buildResult, results, err
		}
		results = append(results, contracts.TestResult{
			Name:   "unit-tests",
			Result: testResult,
			Passed: testResult.ExitCode == 0,
		})
	} else {
		testResult, err := v.flogoClient.RunFlowTests(ctx, repoPath)
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
