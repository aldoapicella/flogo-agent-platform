package agentloop

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

type Responder struct {
	modelClient model.Client
}

func NewResponder(modelClient model.Client) *Responder {
	return &Responder{modelClient: modelClient}
}

func (r *Responder) ComposeTurnResponse(ctx context.Context, snapshot *contracts.SessionSnapshot) string {
	deterministic := strings.TrimSpace(composeDeterministicTurnResponse(snapshot))
	if deterministic != "" {
		return deterministic
	}

	trace := renderTurnSummary(snapshot)
	if r == nil || r.modelClient == nil || snapshot == nil {
		return trace
	}

	response, err := r.modelClient.GenerateText(ctx, model.TextRequest{
		SystemPrompt: strings.TrimSpace(`You are a conversational Flogo coding agent in a terminal workflow.
Write the assistant reply for the user after a tool-augmented turn.
Be concrete, concise, and grounded in the execution results.
Do not invent tool outcomes, schema rules, build results, or approvals.
If approval is pending, say that clearly.
Do not suggest alternative fixes or unsupported options unless the user asked for them.
If sources are available, cite them by source title in plain text.
Do not use markdown fences.`),
		UserPrompt:      buildResponderPrompt(snapshot),
		MaxOutputTokens: 800,
	})
	if err != nil || strings.TrimSpace(response.Text) == "" {
		return trace
	}

	return strings.TrimSpace(response.Text)
}

func composeDeterministicTurnResponse(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return ""
	}
	if snapshot.LastTurnKind == "inspection" {
		if response := composeInspectionResponse(snapshot); strings.TrimSpace(response) != "" {
			return response
		}
	}
	if snapshot.PendingApproval != nil && snapshot.PendingApproval.PatchPlan != nil {
		if lastStepType(snapshot) == contracts.TurnStepShowDiff {
			return composePendingDiffResponse(snapshot)
		}
		return composePendingPatchResponse(snapshot)
	}
	if snapshot.LastTurnKind == "approval" && snapshot.LastReport != nil {
		return composeApprovalCompletionResponse(snapshot)
	}
	if snapshot.LastReport != nil && snapshot.Status == contracts.SessionStatusBlocked {
		return composeBlockedResponse(snapshot)
	}
	return ""
}

func composeInspectionResponse(snapshot *contracts.SessionSnapshot) string {
	observations := lastTurnObservations(snapshot)
	if len(observations) == 0 {
		return ""
	}

	localPlans := filterObservationsByKind(observations, "local_test_plan")
	if len(localPlans) == 0 {
		return composeObservationSummary(observations)
	}

	binaryPath := firstObservationValue(observations, "binary", "path")
	testSupport := firstObservation(observations, "test_support")
	var parts []string

	if binaryPath != "" {
		parts = append(parts, "To test it locally, start the generated app with `"+binaryPath+"`.")
	}

	for idx, plan := range localPlans {
		if idx >= 2 {
			break
		}
		if curl := strings.TrimSpace(plan.Data["curl"]); curl != "" {
			method := strings.ToUpper(strings.TrimSpace(plan.Data["method"]))
			if method == "" {
				method = "GET"
			}
			url := strings.TrimSpace(plan.Data["url"])
			path := strings.TrimSpace(plan.Data["path"])
			port := strings.TrimSpace(plan.Data["port"])
			parts = append(parts, fmt.Sprintf("The descriptor configures %s %s on port %s. Probe it with `%s`.", method, valueOr(path, url), valueOr(port, "8080"), curl))
			continue
		}
		parts = append(parts, plan.Summary)
	}

	if testSupport != nil && !strings.EqualFold(strings.TrimSpace(testSupport.Data["supports_test_flags"]), "true") {
		parts = append(parts, testSupport.Summary)
	}

	return strings.Join(parts, "\n\n")
}

func composeObservationSummary(observations []contracts.Observation) string {
	var parts []string
	for idx, observation := range observations {
		if idx >= 3 {
			break
		}
		if strings.TrimSpace(observation.Summary) == "" {
			continue
		}
		parts = append(parts, observation.Summary)
	}
	return strings.Join(parts, "\n\n")
}

func composePendingPatchResponse(snapshot *contracts.SessionSnapshot) string {
	report := snapshot.LastReport
	if report == nil || report.PatchPlan == nil {
		return ""
	}

	var parts []string
	issues := validationIssueSummaries(report.Evidence.ValidationResult, 4)
	if len(issues) > 0 {
		parts = append(parts, "I found these blocking issues:\n- "+strings.Join(issues, "\n- "))
	}

	changes := patchChangeSummaries(report, 4)
	if len(changes) > 0 {
		parts = append(parts, "I prepared this patch:\n- "+strings.Join(changes, "\n- "))
	}

	if next := strings.TrimSpace(report.NextAction); next != "" {
		parts = append(parts, "Next: "+next+".")
	} else {
		parts = append(parts, "Next: review the proposed patch before applying it.")
	}

	return strings.Join(parts, "\n\n")
}

func composePendingDiffResponse(snapshot *contracts.SessionSnapshot) string {
	report := snapshot.LastReport
	if report == nil || report.PatchPlan == nil {
		return "The patch is still waiting for your approval."
	}

	changes := patchChangeSummaries(report, 4)
	snippet := compactDiffSnippet(report.PatchPlan.UnifiedDiff, 8)

	var builder strings.Builder
	builder.WriteString("The patch is still waiting for your approval.\n")
	if len(changes) > 0 {
		builder.WriteString("\nSemantic changes:\n- ")
		builder.WriteString(strings.Join(changes, "\n- "))
		builder.WriteByte('\n')
	}
	if snippet != "" {
		builder.WriteString("\nFocused diff excerpt:\n")
		builder.WriteString(snippet)
		builder.WriteByte('\n')
	}
	builder.WriteString("\nApprove the pending patch when you want me to apply it.")
	return strings.TrimSpace(builder.String())
}

func composeApprovalCompletionResponse(snapshot *contracts.SessionSnapshot) string {
	report := snapshot.LastReport
	if report == nil {
		return ""
	}

	lines := []string{"I applied the patch you approved."}
	if report.Evidence.ValidationResult.Passed {
		lines = append(lines, "Validation now passes.")
	}
	if report.Evidence.BuildResult != nil {
		if report.Evidence.BuildResult.ExitCode == 0 {
			lines = append(lines, "The generated app built successfully.")
		} else {
			lines = append(lines, fmt.Sprintf("The build still failed with exit code %d.", report.Evidence.BuildResult.ExitCode))
		}
	}

	tests := testResultSummaries(report.Evidence.TestResults)
	if len(tests) > 0 {
		lines = append(lines, "Verification summary:\n- "+strings.Join(tests, "\n- "))
	}

	if next := strings.TrimSpace(report.NextAction); next != "" {
		lines = append(lines, "Next: "+next+".")
	}
	return strings.Join(lines, "\n\n")
}

func composeBlockedResponse(snapshot *contracts.SessionSnapshot) string {
	report := snapshot.LastReport
	if report == nil {
		return ""
	}

	var parts []string
	issues := validationIssueSummaries(report.Evidence.ValidationResult, 4)
	if len(issues) > 0 {
		parts = append(parts, "The run is blocked by:\n- "+strings.Join(issues, "\n- "))
	}
	failures := failingTestSummaries(report.Evidence.TestResults)
	if len(failures) > 0 {
		parts = append(parts, "Verification is still blocked:\n- "+strings.Join(failures, "\n- "))
	}
	if next := strings.TrimSpace(report.NextAction); next != "" {
		parts = append(parts, "Next: "+next+".")
	}
	return strings.Join(parts, "\n\n")
}

func buildResponderPrompt(snapshot *contracts.SessionSnapshot) string {
	var builder strings.Builder
	builder.WriteString("Write the reply for the latest assistant turn.\n")
	if snapshot.LastTurnPlan != nil {
		builder.WriteString("Planned goal: " + snapshot.LastTurnPlan.GoalSummary + "\n")
		builder.WriteString("Planner: " + snapshot.LastTurnPlan.Planner + "\n")
	}
	if snapshot.LastTurnKind != "" {
		builder.WriteString("Turn kind: " + snapshot.LastTurnKind + "\n")
	}
	builder.WriteString("Session status: " + string(snapshot.Status) + "\n")

	if len(snapshot.LastStepResults) > 0 {
		builder.WriteString("Step results:\n")
		for _, result := range snapshot.LastStepResults {
			builder.WriteString(fmt.Sprintf("- [%s] %s: %s\n", result.Status, result.Type, result.Summary))
			for _, observation := range result.Observations {
				builder.WriteString(fmt.Sprintf("  - Observation %s: %s\n", observation.Kind, observation.Summary))
			}
		}
	}

	if snapshot.LastReport != nil {
		builder.WriteString("Execution report:\n")
		builder.WriteString("- " + summarizeReport(snapshot.LastReport) + "\n")
		appendValidationSummary(&builder, snapshot.LastReport.Evidence.ValidationResult)
		if snapshot.LastReport.PatchPlan != nil {
			builder.WriteString("- Patch rationale: " + snapshot.LastReport.PatchPlan.Rationale + "\n")
			builder.WriteString(fmt.Sprintf("- Patch safe: %t\n", snapshot.LastReport.PatchPlan.Safe))
		}
		for _, test := range snapshot.LastReport.Evidence.TestResults {
			builder.WriteString(fmt.Sprintf("- Test %s passed=%t skipped=%t", test.Name, test.Passed, test.Skipped))
			if test.SkipReason != "" {
				builder.WriteString(" reason=" + test.SkipReason)
			}
			builder.WriteByte('\n')
		}
	}

	if snapshot.PendingApproval != nil {
		builder.WriteString("Pending approval: " + snapshot.PendingApproval.Summary + "\n")
	}

	citations := latestCitations(snapshot)
	if len(citations) > 0 {
		builder.WriteString("Relevant sources:\n")
		for idx, citation := range citations {
			if idx >= 4 {
				break
			}
			builder.WriteString("- " + citation.Title)
			if citation.Locator != "" {
				builder.WriteString(" (" + citation.Locator + ")")
			}
			builder.WriteByte('\n')
		}
	}

	builder.WriteString("Reply requirements:\n")
	builder.WriteString("- First explain what happened in this turn.\n")
	builder.WriteString("- Then explain the next action or approval requirement.\n")
	builder.WriteString("- Mention the most important concrete issue or change when one is available.\n")
	builder.WriteString("- Keep it under 140 words.\n")
	return builder.String()
}

func appendValidationSummary(builder *strings.Builder, validation contracts.ValidationResult) {
	appendIssue := func(prefix string, issues []contracts.ValidationIssue) {
		for idx, issue := range issues {
			if idx >= 4 {
				break
			}
			builder.WriteString(fmt.Sprintf("- %s %s: %s\n", prefix, issue.RuleID, issue.Message))
		}
	}
	appendIssue("Schema issue", validation.SchemaIssues)
	appendIssue("Semantic issue", validation.SemanticIssues)
}

func validationIssueSummaries(validation contracts.ValidationResult, limit int) []string {
	issues := make([]contracts.ValidationIssue, 0, len(validation.SchemaIssues)+len(validation.SemanticIssues))
	for _, issue := range validation.SchemaIssues {
		if !strings.EqualFold(issue.Severity, "warning") {
			issues = append(issues, issue)
		}
	}
	for _, issue := range validation.SemanticIssues {
		if !strings.EqualFold(issue.Severity, "warning") {
			issues = append(issues, issue)
		}
	}
	if len(issues) == 0 {
		return nil
	}
	sort.SliceStable(issues, func(i, j int) bool {
		if issues[i].RuleID == issues[j].RuleID {
			return issues[i].JSONPath < issues[j].JSONPath
		}
		return issues[i].RuleID < issues[j].RuleID
	})
	if limit > 0 && len(issues) > limit {
		issues = issues[:limit]
	}
	out := make([]string, 0, len(issues))
	for _, issue := range issues {
		out = append(out, issue.Message)
	}
	return out
}

func patchChangeSummaries(report *contracts.RunReport, limit int) []string {
	if report == nil {
		return nil
	}
	var changes []string
	seen := map[string]struct{}{}
	for _, note := range report.Messages {
		summary := humanizePatchNote(note)
		if summary == "" {
			continue
		}
		if _, ok := seen[summary]; ok {
			continue
		}
		seen[summary] = struct{}{}
		changes = append(changes, summary)
	}
	if report.PatchPlan != nil {
		for _, summary := range diffHighlights(report.PatchPlan.UnifiedDiff) {
			if _, ok := seen[summary]; ok {
				continue
			}
			seen[summary] = struct{}{}
			changes = append(changes, summary)
		}
	}
	if limit > 0 && len(changes) > limit {
		changes = changes[:limit]
	}
	return changes
}

func humanizePatchNote(note string) string {
	note = strings.TrimSpace(note)
	if note == "" {
		return ""
	}
	switch {
	case strings.Contains(note, "normalized flowURI"):
		return "normalized the handler flowURI to use the official res://flow:<id> form"
	case strings.Contains(note, "removed inline handler action id"):
		return "removed the inline handler action id from the embedded handler action"
	case strings.Contains(note, "replaced invalid handler action input scope"):
		if idx := strings.LastIndex(note, ` with "`); idx != -1 {
			replacement := strings.TrimSuffix(strings.TrimPrefix(note[idx+6:], `"`), `"`)
			return fmt.Sprintf("replaced the invalid handler action input scope with %s", replacement)
		}
		return "replaced the invalid handler action input scope with trigger data"
	case strings.Contains(note, "prefixed mapping expression"):
		return "added the required '=' prefix to a mapping expression"
	case strings.Contains(note, "renamed flow input mapping"):
		return note
	default:
		return note
	}
}

func diffHighlights(unifiedDiff string) []string {
	lines := strings.Split(unifiedDiff, "\n")
	var flowBefore, flowAfter string
	var messageBefore, messageAfter string
	var idRemoved string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, `-"flowURI":`):
			flowBefore = strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
		case strings.HasPrefix(trimmed, `+"flowURI":`):
			flowAfter = strings.TrimSpace(strings.TrimPrefix(trimmed, "+"))
		case strings.HasPrefix(trimmed, `-"message":`):
			messageBefore = strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
		case strings.HasPrefix(trimmed, `+"message":`):
			messageAfter = strings.TrimSpace(strings.TrimPrefix(trimmed, "+"))
		case strings.HasPrefix(trimmed, `-"id":`):
			idRemoved = strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
		}
	}

	var out []string
	if flowBefore != "" || flowAfter != "" {
		out = append(out, fmt.Sprintf("flowURI changed from %s to %s", fallbackDiffValue(flowBefore), fallbackDiffValue(flowAfter)))
	}
	if idRemoved != "" {
		out = append(out, fmt.Sprintf("removed %s from the embedded handler action", fallbackDiffValue(idRemoved)))
	}
	if messageBefore != "" || messageAfter != "" {
		out = append(out, fmt.Sprintf("message input changed from %s to %s", fallbackDiffValue(messageBefore), fallbackDiffValue(messageAfter)))
	}
	return out
}

func fallbackDiffValue(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return "<none>"
	}
	return text
}

func compactDiffSnippet(unifiedDiff string, limit int) string {
	if limit <= 0 {
		limit = 8
	}
	lines := strings.Split(unifiedDiff, "\n")
	selected := collectSemanticDiffLines(lines, limit)
	if len(selected) == 0 {
		selected = collectFallbackDiffLines(lines, limit)
	}
	return strings.Join(selected, "\n")
}

func collectSemanticDiffLines(lines []string, limit int) []string {
	selected := make([]string, 0, limit)
	for _, line := range lines {
		if strings.HasPrefix(line, "---") || strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "@@") {
			continue
		}
		if !strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "-") {
			continue
		}
		if !isSemanticDiffLine(line) {
			continue
		}
		selected = append(selected, line)
		if len(selected) >= limit {
			break
		}
	}
	return selected
}

func collectFallbackDiffLines(lines []string, limit int) []string {
	selected := make([]string, 0, limit)
	for _, line := range lines {
		if strings.HasPrefix(line, "---") || strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "@@") {
			continue
		}
		if !strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "-") {
			continue
		}
		trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(line, "+"), "-"))
		switch trimmed {
		case "", "{", "}", "[", "]", ",", "},", "],":
			continue
		}
		selected = append(selected, line)
		if len(selected) >= limit {
			break
		}
	}
	return selected
}

func isSemanticDiffLine(line string) bool {
	trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(line, "+"), "-"))
	if trimmed == "" {
		return false
	}
	return strings.Contains(trimmed, `"flowURI"`) ||
		strings.Contains(trimmed, `"message"`) ||
		strings.Contains(trimmed, `"id"`) ||
		strings.Contains(trimmed, "res://flow:") ||
		strings.Contains(trimmed, "=$.") ||
		strings.Contains(trimmed, "=$flow") ||
		strings.Contains(trimmed, "$.pathParams")
}

func testResultSummaries(results []contracts.TestResult) []string {
	out := make([]string, 0, len(results))
	for _, test := range results {
		switch {
		case test.Skipped && test.SkipReason != "":
			out = append(out, fmt.Sprintf("%s skipped: %s", test.Name, test.SkipReason))
		case test.Skipped:
			out = append(out, fmt.Sprintf("%s skipped", test.Name))
		case test.Passed:
			out = append(out, fmt.Sprintf("%s passed", test.Name))
		default:
			out = append(out, fmt.Sprintf("%s failed (exit code %d)", test.Name, test.Result.ExitCode))
		}
	}
	return out
}

func failingTestSummaries(results []contracts.TestResult) []string {
	out := make([]string, 0, len(results))
	for _, test := range results {
		switch {
		case test.Skipped && test.SkipReason != "":
			out = append(out, fmt.Sprintf("%s skipped: %s", test.Name, test.SkipReason))
		case test.Skipped:
			out = append(out, fmt.Sprintf("%s skipped", test.Name))
		case !test.Passed:
			out = append(out, fmt.Sprintf("%s failed (exit code %d)", test.Name, test.Result.ExitCode))
		}
	}
	return out
}

func lastStepType(snapshot *contracts.SessionSnapshot) contracts.TurnStepType {
	if snapshot == nil || len(snapshot.LastStepResults) == 0 {
		return ""
	}
	return snapshot.LastStepResults[len(snapshot.LastStepResults)-1].Type
}

func lastTurnObservations(snapshot *contracts.SessionSnapshot) []contracts.Observation {
	if snapshot == nil {
		return nil
	}
	var observations []contracts.Observation
	for _, result := range snapshot.LastStepResults {
		observations = append(observations, result.Observations...)
	}
	return observations
}

func filterObservationsByKind(observations []contracts.Observation, kind string) []contracts.Observation {
	filtered := make([]contracts.Observation, 0, len(observations))
	for _, observation := range observations {
		if observation.Kind == kind {
			filtered = append(filtered, observation)
		}
	}
	return filtered
}

func firstObservation(observations []contracts.Observation, kind string) *contracts.Observation {
	for idx := range observations {
		if observations[idx].Kind == kind {
			return &observations[idx]
		}
	}
	return nil
}

func firstObservationValue(observations []contracts.Observation, kind string, key string) string {
	for _, observation := range observations {
		if observation.Kind != kind {
			continue
		}
		return strings.TrimSpace(observation.Data[key])
	}
	return ""
}

func valueOr(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func latestCitations(snapshot *contracts.SessionSnapshot) []contracts.SourceCitation {
	if snapshot == nil || snapshot.LastReport == nil {
		return nil
	}
	if len(snapshot.LastReport.Citations) > 0 {
		return snapshot.LastReport.Citations
	}
	if snapshot.LastReport.PatchPlan != nil && len(snapshot.LastReport.PatchPlan.Citations) > 0 {
		return snapshot.LastReport.PatchPlan.Citations
	}
	var citations []contracts.SourceCitation
	for _, issue := range snapshot.LastReport.Evidence.ValidationResult.SchemaIssues {
		citations = append(citations, issue.Citations...)
	}
	for _, issue := range snapshot.LastReport.Evidence.ValidationResult.SemanticIssues {
		citations = append(citations, issue.Citations...)
	}
	return citations
}
