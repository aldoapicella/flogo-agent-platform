package reporting

import (
	"fmt"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func FormatReport(report *contracts.RunReport) string {
	if report == nil {
		return "no report"
	}

	var lines []string
	lines = append(lines, fmt.Sprintf("Outcome: %s", report.Outcome))
	lines = append(lines, fmt.Sprintf("Iteration: %d", report.Evidence.Iteration))
	lines = append(lines, fmt.Sprintf("Validation passed: %t", report.Evidence.ValidationResult.Passed))

	if report.PatchPlan != nil {
		lines = append(lines, "Patch rationale: "+report.PatchPlan.Rationale)
		if report.PatchPlan.UnifiedDiff != "" {
			lines = append(lines, "Patch diff:")
			lines = append(lines, report.PatchPlan.UnifiedDiff)
		}
	}

	for _, issue := range report.Evidence.ValidationResult.SchemaIssues {
		lines = append(lines, formatIssue("schema", issue))
	}
	for _, issue := range report.Evidence.ValidationResult.SemanticIssues {
		lines = append(lines, formatIssue("semantic", issue))
	}

	if report.Evidence.BuildResult != nil {
		lines = append(lines, fmt.Sprintf("Build exit code: %d", report.Evidence.BuildResult.ExitCode))
		if report.Evidence.BuildResult.Error != "" {
			lines = append(lines, "Build error: "+report.Evidence.BuildResult.Error)
		}
	}
	for _, test := range report.Evidence.TestResults {
		lines = append(lines, fmt.Sprintf("Test %s passed=%t skipped=%t exit=%d", test.Name, test.Passed, test.Skipped, test.Result.ExitCode))
	}
	if report.NextAction != "" {
		lines = append(lines, "Next action: "+report.NextAction)
	}
	return strings.Join(lines, "\n")
}

func formatIssue(kind string, issue contracts.ValidationIssue) string {
	return fmt.Sprintf("[%s] %s %s: %s", kind, issue.RuleID, issue.JSONPath, issue.Message)
}
