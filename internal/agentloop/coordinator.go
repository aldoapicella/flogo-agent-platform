package agentloop

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
)

type Coordinator struct {
	service *session.Service
}

func New(service *session.Service) *Coordinator {
	return &Coordinator{service: service}
}

func (c *Coordinator) HandleUserMessage(ctx context.Context, snapshot *contracts.SessionSnapshot, content string) error {
	if snapshot == nil {
		return fmt.Errorf("session snapshot is required")
	}

	content = strings.TrimSpace(content)
	if content == "" {
		return nil
	}

	appendMessage(snapshot, contracts.RoleUser, content)
	intent := classifyIntent(content)

	switch intent {
	case intentApprove:
		return c.ApprovePending(ctx, snapshot)
	case intentReject:
		return c.RejectPending(snapshot, "")
	case intentPlan:
		appendMessage(snapshot, contracts.RoleAssistant, renderPlan(snapshot))
		appendEvent(snapshot, "plan", "rendered current execution plan")
		return nil
	case intentDiff:
		appendMessage(snapshot, contracts.RoleAssistant, renderDiff(snapshot))
		appendEvent(snapshot, "diff", "rendered current patch diff")
		return nil
	case intentStatus:
		appendMessage(snapshot, contracts.RoleAssistant, renderStatus(snapshot))
		appendEvent(snapshot, "status", "rendered current session status")
		return nil
	case intentInspect:
		report, err := c.service.Analyze(ctx, sessionRequest(snapshot))
		if err != nil {
			return err
		}
		applyReport(snapshot, report, false)
		appendMessage(snapshot, contracts.RoleAssistant, renderReport("inspection", report))
		return nil
	default:
		report, err := c.service.Run(ctx, sessionRequest(snapshot))
		if err != nil {
			return err
		}
		applyReport(snapshot, report, true)
		appendMessage(snapshot, contracts.RoleAssistant, renderReport("execution", report))
		return nil
	}
}

func (c *Coordinator) ApprovePending(ctx context.Context, snapshot *contracts.SessionSnapshot) error {
	if snapshot == nil {
		return fmt.Errorf("session snapshot is required")
	}
	if snapshot.PendingApproval == nil {
		appendMessage(snapshot, contracts.RoleAssistant, "No pending patch is waiting for approval.")
		appendEvent(snapshot, "approval", "no pending approval was available")
		return nil
	}

	report, err := c.service.Run(ctx, applyRequest(snapshot))
	if err != nil {
		return err
	}
	applyReport(snapshot, report, true)
	appendMessage(snapshot, contracts.RoleAssistant, renderReport("approval", report))
	appendEvent(snapshot, "approval", "approved and executed the pending patch")
	return nil
}

func (c *Coordinator) RejectPending(snapshot *contracts.SessionSnapshot, reason string) error {
	if snapshot == nil {
		return fmt.Errorf("session snapshot is required")
	}
	if snapshot.PendingApproval == nil {
		appendMessage(snapshot, contracts.RoleAssistant, "No pending patch is waiting for rejection.")
		appendEvent(snapshot, "approval", "no pending approval was available to reject")
		return nil
	}

	snapshot.PendingApproval = nil
	snapshot.Status = contracts.SessionStatusActive
	message := "Rejected the pending patch. I can inspect again, generate a new repair, or explain the current issues."
	if strings.TrimSpace(reason) != "" {
		message = fmt.Sprintf("Rejected the pending patch (%s). I can inspect again, generate a new repair, or explain the current issues.", reason)
	}
	appendMessage(snapshot, contracts.RoleAssistant, message)
	appendEvent(snapshot, "approval", "rejected the pending patch")
	snapshot.UpdatedAt = nowUTC()
	return nil
}

type intentKind string

const (
	intentInspect intentKind = "inspect"
	intentExecute intentKind = "execute"
	intentApprove intentKind = "approve"
	intentReject  intentKind = "reject"
	intentPlan    intentKind = "plan"
	intentDiff    intentKind = "diff"
	intentStatus  intentKind = "status"
)

func classifyIntent(content string) intentKind {
	normalized := strings.ToLower(strings.TrimSpace(content))
	switch {
	case strings.HasPrefix(normalized, "/approve"), strings.Contains(normalized, "approve pending"), normalized == "approve":
		return intentApprove
	case strings.HasPrefix(normalized, "/reject"), normalized == "reject":
		return intentReject
	case strings.HasPrefix(normalized, "/plan"), normalized == "plan":
		return intentPlan
	case strings.HasPrefix(normalized, "/diff"), normalized == "diff":
		return intentDiff
	case strings.HasPrefix(normalized, "/status"), normalized == "status":
		return intentStatus
	case strings.Contains(normalized, "build"), strings.Contains(normalized, "test"), strings.Contains(normalized, "repair"),
		strings.Contains(normalized, "fix"), strings.Contains(normalized, "apply"), strings.Contains(normalized, "update"),
		strings.Contains(normalized, "verify"), strings.Contains(normalized, "run"):
		return intentExecute
	default:
		return intentInspect
	}
}

func sessionRequest(snapshot *contracts.SessionSnapshot) contracts.SessionRequest {
	return contracts.SessionRequest{
		RepoPath:        snapshot.RepoPath,
		Goal:            snapshot.Goal,
		Mode:            snapshot.Mode,
		ApprovalPolicy:  snapshot.ApprovalPolicy,
		Sandbox:         snapshot.Sandbox,
		StateDir:        snapshot.StateDir,
		SourcesManifest: snapshot.SourcesManifest,
	}
}

func applyRequest(snapshot *contracts.SessionSnapshot) contracts.SessionRequest {
	req := sessionRequest(snapshot)
	req.Mode = contracts.ModeApply
	req.ApprovalPolicy.RequireWriteApproval = false
	return req
}

func applyReport(snapshot *contracts.SessionSnapshot, report *contracts.RunReport, executed bool) {
	snapshot.LastReport = report
	snapshot.UpdatedAt = nowUTC()
	snapshot.Plan = derivePlan(report)

	switch report.Outcome {
	case contracts.RunOutcomeReady:
		snapshot.Status = contracts.SessionStatusWaitingApproval
		snapshot.PendingApproval = &contracts.PendingApproval{
			Kind:        "patch",
			Summary:     report.NextAction,
			RequestedAt: nowUTC(),
			PatchPlan:   report.PatchPlan,
		}
		appendEvent(snapshot, "analysis", "prepared a reviewable patch proposal")
	case contracts.RunOutcomeApplied:
		snapshot.PendingApproval = nil
		if executed {
			snapshot.Status = contracts.SessionStatusCompleted
			appendEvent(snapshot, "execution", "completed validation, build, and available tests")
		} else {
			snapshot.Status = contracts.SessionStatusActive
			appendEvent(snapshot, "analysis", "inspected the app and found no blocking validation issues")
		}
	case contracts.RunOutcomeBlocked:
		snapshot.PendingApproval = nil
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", report.NextAction)
	default:
		snapshot.PendingApproval = nil
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "failed", report.NextAction)
	}
}

func derivePlan(report *contracts.RunReport) []contracts.PlanItem {
	plan := []contracts.PlanItem{
		{ID: "inspect", Title: "Inspect flogo.json and flow resources", Status: contracts.PlanItemCompleted},
		{ID: "repair", Title: "Repair Flogo descriptor issues", Status: contracts.PlanItemPending},
		{ID: "build", Title: "Build the generated app", Status: contracts.PlanItemPending},
		{ID: "test", Title: "Run available flow and unit tests", Status: contracts.PlanItemPending},
	}
	if report == nil {
		return plan
	}

	if report.PatchPlan != nil {
		plan[1].Status = contracts.PlanItemInProgress
		plan[1].Details = report.NextAction
	}
	if report.Evidence.ValidationResult.Passed {
		plan[1].Status = contracts.PlanItemCompleted
	}
	if report.Evidence.BuildResult != nil {
		if report.Evidence.BuildResult.ExitCode == 0 {
			plan[2].Status = contracts.PlanItemCompleted
		} else {
			plan[2].Status = contracts.PlanItemBlocked
			plan[2].Details = report.NextAction
		}
	}
	if len(report.Evidence.TestResults) > 0 {
		testsPassed := true
		for _, test := range report.Evidence.TestResults {
			if !test.Passed && !test.Skipped {
				testsPassed = false
				break
			}
		}
		if testsPassed {
			plan[3].Status = contracts.PlanItemCompleted
		} else {
			plan[3].Status = contracts.PlanItemBlocked
			plan[3].Details = report.NextAction
		}
	}
	if report.Outcome == contracts.RunOutcomeBlocked && report.Evidence.BuildResult == nil {
		plan[1].Status = contracts.PlanItemBlocked
		plan[1].Details = report.NextAction
	}
	return plan
}

func renderReport(kind string, report *contracts.RunReport) string {
	if report == nil {
		return "No report is available."
	}

	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("Completed %s.\n", kind))
	builder.WriteString(fmt.Sprintf("Outcome: %s\n", report.Outcome))
	builder.WriteString(fmt.Sprintf("Validation passed: %t\n", report.Evidence.ValidationResult.Passed))

	issues := append([]contracts.ValidationIssue{}, report.Evidence.ValidationResult.SchemaIssues...)
	issues = append(issues, report.Evidence.ValidationResult.SemanticIssues...)
	if len(issues) > 0 {
		builder.WriteString("Top issues:\n")
		for idx, issue := range issues {
			if idx >= 3 {
				break
			}
			builder.WriteString(fmt.Sprintf("- %s: %s\n", issue.RuleID, issue.Message))
		}
	}

	if report.PatchPlan != nil {
		builder.WriteString("Patch rationale: ")
		builder.WriteString(strings.TrimSpace(report.PatchPlan.Rationale))
		builder.WriteByte('\n')
		if diff := strings.TrimSpace(report.PatchPlan.UnifiedDiff); diff != "" {
			builder.WriteString("Diff:\n")
			builder.WriteString(diff)
			builder.WriteByte('\n')
		}
	}

	if report.Evidence.BuildResult != nil {
		builder.WriteString(fmt.Sprintf("Build exit code: %d\n", report.Evidence.BuildResult.ExitCode))
	}
	for _, test := range report.Evidence.TestResults {
		builder.WriteString(fmt.Sprintf("Test %s passed=%t skipped=%t exit=%d\n", test.Name, test.Passed, test.Skipped, test.Result.ExitCode))
	}
	if len(report.Citations) > 0 {
		builder.WriteString("Sources:\n")
		for idx, citation := range report.Citations {
			if idx >= 3 {
				break
			}
			builder.WriteString("- " + citation.Title)
			if citation.Locator != "" {
				builder.WriteString(" (" + citation.Locator + ")")
			}
			builder.WriteByte('\n')
		}
	}
	if report.NextAction != "" {
		builder.WriteString("Next: ")
		builder.WriteString(report.NextAction)
	}
	return strings.TrimSpace(builder.String())
}

func renderPlan(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil || len(snapshot.Plan) == 0 {
		return "No plan is available yet."
	}
	var builder strings.Builder
	builder.WriteString("Current Flogo execution plan:\n")
	for _, item := range snapshot.Plan {
		builder.WriteString(fmt.Sprintf("- [%s] %s", item.Status, item.Title))
		if item.Details != "" {
			builder.WriteString(": " + item.Details)
		}
		builder.WriteByte('\n')
	}
	return strings.TrimSpace(builder.String())
}

func renderDiff(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return "No session is loaded."
	}
	if snapshot.PendingApproval != nil && snapshot.PendingApproval.PatchPlan != nil && strings.TrimSpace(snapshot.PendingApproval.PatchPlan.UnifiedDiff) != "" {
		return snapshot.PendingApproval.PatchPlan.UnifiedDiff
	}
	if snapshot.LastReport != nil && snapshot.LastReport.PatchPlan != nil && strings.TrimSpace(snapshot.LastReport.PatchPlan.UnifiedDiff) != "" {
		return snapshot.LastReport.PatchPlan.UnifiedDiff
	}
	return "No patch diff is available."
}

func renderStatus(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return "No session is loaded."
	}
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("Session %s\n", snapshot.ID))
	builder.WriteString(fmt.Sprintf("Status: %s\n", snapshot.Status))
	builder.WriteString(fmt.Sprintf("Repo: %s\n", snapshot.RepoPath))
	if snapshot.PendingApproval != nil {
		builder.WriteString("Pending approval: yes\n")
		builder.WriteString("Next: " + snapshot.PendingApproval.Summary)
	} else {
		builder.WriteString("Pending approval: no")
	}
	return builder.String()
}

func appendMessage(snapshot *contracts.SessionSnapshot, role contracts.MessageRole, content string) {
	snapshot.Messages = append(snapshot.Messages, contracts.ChatMessage{
		ID:        nextID("msg"),
		Role:      role,
		Content:   strings.TrimSpace(content),
		CreatedAt: nowUTC(),
	})
	snapshot.UpdatedAt = nowUTC()
}

func appendEvent(snapshot *contracts.SessionSnapshot, eventType string, summary string) {
	snapshot.Events = append(snapshot.Events, contracts.SessionEvent{
		ID:        nextID("evt"),
		Type:      eventType,
		Summary:   summary,
		CreatedAt: nowUTC(),
	})
	snapshot.UpdatedAt = nowUTC()
}

func nextID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UTC().UnixNano())
}

func nowUTC() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
