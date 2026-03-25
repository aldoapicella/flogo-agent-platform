package agentloop

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
)

type Coordinator struct {
	service   *session.Service
	planner   *Planner
	responder *Responder
	onUpdate  func(*contracts.SessionSnapshot)
}

func New(service *session.Service, modelClient model.Client) *Coordinator {
	return &Coordinator{
		service:   service,
		planner:   NewPlanner(modelClient),
		responder: NewResponder(modelClient),
	}
}

func (c *Coordinator) SetOnUpdate(fn func(*contracts.SessionSnapshot)) {
	c.onUpdate = fn
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
	c.flush(snapshot)
	if shouldAnswerWithoutExecution(content) {
		snapshot.LastTurnPlan = &contracts.TurnPlan{
			GoalSummary: "Answer a direct product question without inspecting the workspace",
			Planner:     "deterministic",
			Notes:       []string{"answered a direct question without running the repo workflow"},
		}
		snapshot.LastTurnKind = "conversation"
		snapshot.LastStepResults = nil
		snapshot.Status = contracts.SessionStatusActive
		appendEvent(snapshot, "conversation", "answered a direct product question")
		appendMessage(snapshot, contracts.RoleAssistant, directConversationAnswer())
		c.flush(snapshot)
		return nil
	}

	plan := c.planner.PlanTurn(ctx, snapshot, content)
	snapshot.LastTurnPlan = &plan
	snapshot.LastTurnKind = "repair"
	if plan.RequiresCreation {
		snapshot.LastTurnKind = "creation"
	}
	snapshot.LastStepResults = nil
	appendEvent(snapshot, "planning", fmt.Sprintf("planned %d step(s) via %s", len(plan.Steps), plan.Planner))
	c.flush(snapshot)

	for _, step := range plan.Steps {
		result, stop, err := c.executeStep(ctx, snapshot, step)
		if err != nil {
			return err
		}
		snapshot.LastStepResults = append(snapshot.LastStepResults, result)
		c.flush(snapshot)
		if stop {
			break
		}
	}

	appendMessage(snapshot, contracts.RoleAssistant, c.composeAssistantResponse(ctx, snapshot))
	c.flush(snapshot)
	return nil
}

func shouldAnswerWithoutExecution(content string) bool {
	normalized := strings.ToLower(strings.TrimSpace(content))
	if normalized == "" {
		return false
	}
	if containsAny(normalized, "repair", "fix", "build", "test", "verify", "create", "bootstrap", "run", "apply", "update", "inspect") {
		return false
	}
	return containsAny(normalized,
		"what are you",
		"who are you",
		"what can you do",
		"how do you work",
		"how does this work",
	)
}

func directConversationAnswer() string {
	return "I am a conversational coding agent specifically for TIBCO Flogo apps. I can inspect and repair flogo.json and flow resources, run Flogo create/build/test workflows, propose reviewable diffs, and explain changes with official Flogo citations. For direct product questions like this, I should answer directly instead of inspecting the repo."
}

func (c *Coordinator) ApprovePending(ctx context.Context, snapshot *contracts.SessionSnapshot) error {
	result, _, err := c.executeStep(ctx, snapshot, contracts.TurnStep{
		Type:   contracts.TurnStepApprovePending,
		Reason: "the user approved the pending patch",
	})
	if err != nil {
		return err
	}
	snapshot.LastStepResults = append(snapshot.LastStepResults, result)
	appendMessage(snapshot, contracts.RoleAssistant, c.composeAssistantResponse(ctx, snapshot))
	c.flush(snapshot)
	return nil
}

func (c *Coordinator) RejectPending(snapshot *contracts.SessionSnapshot, reason string) error {
	result, _, err := c.executeStep(context.Background(), snapshot, contracts.TurnStep{
		Type:   contracts.TurnStepRejectPending,
		Reason: reason,
	})
	if err != nil {
		return err
	}
	snapshot.LastStepResults = append(snapshot.LastStepResults, result)
	appendMessage(snapshot, contracts.RoleAssistant, c.composeAssistantResponse(context.Background(), snapshot))
	c.flush(snapshot)
	return nil
}

func (c *Coordinator) executeStep(ctx context.Context, snapshot *contracts.SessionSnapshot, step contracts.TurnStep) (contracts.TurnStepResult, bool, error) {
	switch step.Type {
	case contracts.TurnStepInspectWorkspace:
		return c.inspectWorkspace(snapshot, step), false, nil
	case contracts.TurnStepAnalyzeFlogo:
		return c.analyzeFlogo(ctx, snapshot)
	case contracts.TurnStepCreateMinimalApp:
		return c.createMinimalApp(snapshot, step)
	case contracts.TurnStepRepairAndVerify:
		return c.repairAndVerify(ctx, snapshot)
	case contracts.TurnStepApprovePending:
		return c.approvePending(ctx, snapshot)
	case contracts.TurnStepRejectPending:
		return c.rejectPending(snapshot, step.Reason), true, nil
	case contracts.TurnStepShowDiff:
		return contracts.TurnStepResult{
			Type:    step.Type,
			Status:  contracts.TurnStepStatusCompleted,
			Summary: renderDiff(snapshot),
		}, true, nil
	case contracts.TurnStepShowStatus:
		return contracts.TurnStepResult{
			Type:    step.Type,
			Status:  contracts.TurnStepStatusCompleted,
			Summary: renderStatus(snapshot),
		}, true, nil
	default:
		return contracts.TurnStepResult{
			Type:    step.Type,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: fmt.Sprintf("unsupported step type %q", step.Type),
		}, true, nil
	}
}

func (c *Coordinator) inspectWorkspace(snapshot *contracts.SessionSnapshot, step contracts.TurnStep) contracts.TurnStepResult {
	var summaries []string
	path := filepath.Join(snapshot.RepoPath, "flogo.json")
	if _, err := os.Stat(path); err == nil {
		summaries = append(summaries, "found flogo.json")
	} else {
		summaries = append(summaries, "flogo.json is missing")
	}
	if _, err := os.Stat(filepath.Join(snapshot.RepoPath, ".flogotest")); err == nil {
		summaries = append(summaries, "found .flogotest")
	}
	if snapshot.PendingApproval != nil {
		summaries = append(summaries, "a patch is waiting for approval")
	}
	appendEvent(snapshot, "workspace", strings.Join(summaries, "; "))
	return contracts.TurnStepResult{
		Type:      step.Type,
		Status:    contracts.TurnStepStatusCompleted,
		Summary:   strings.Join(summaries, "; "),
		ToolCalls: []contracts.ToolCallRecord{{Name: "inspect_workspace", Summary: step.Reason}},
	}
}

func (c *Coordinator) analyzeFlogo(ctx context.Context, snapshot *contracts.SessionSnapshot) (contracts.TurnStepResult, bool, error) {
	if !hasFlogoJSON(snapshot.RepoPath) {
		snapshot.Status = contracts.SessionStatusBlocked
		summary := "No flogo.json is present. Create a Flogo app first before analysis."
		appendEvent(snapshot, "blocked", summary)
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepAnalyzeFlogo,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: summary,
		}, true, nil
	}

	report, err := c.service.Analyze(ctx, sessionRequest(snapshot))
	if err != nil {
		return contracts.TurnStepResult{}, true, err
	}
	applyReport(snapshot, report, false)
	appendEvent(snapshot, "analysis", "analyzed the current Flogo descriptor")
	return contracts.TurnStepResult{
		Type:      contracts.TurnStepAnalyzeFlogo,
		Status:    statusFromOutcome(report.Outcome),
		Summary:   summarizeReport(report),
		ToolCalls: toolCallsFromReport(report, "analyze_flogo"),
		Report:    report,
	}, report.Outcome == contracts.RunOutcomeBlocked, nil
}

func (c *Coordinator) createMinimalApp(snapshot *contracts.SessionSnapshot, step contracts.TurnStep) (contracts.TurnStepResult, bool, error) {
	req := flogo.DefaultBootstrapRequest(snapshot.RepoPath)
	if value := strings.TrimSpace(step.Params["app_name"]); value != "" {
		req.AppName = value
	}
	if value := strings.TrimSpace(step.Params["flow_name"]); value != "" {
		req.FlowName = value
	}
	if value := strings.TrimSpace(step.Params["route"]); value != "" {
		req.Route = value
	}
	if value := strings.TrimSpace(step.Params["port"]); value != "" {
		req.Port = value
	}

	doc, err := flogo.BuildMinimalAppDocument(snapshot.RepoPath, req)
	if err != nil {
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", err.Error())
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepCreateMinimalApp,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: err.Error(),
		}, true, nil
	}

	patchPlan, content, err := flogo.BuildDocumentPatchPlan(
		doc,
		"bootstrap a minimal Flogo app descriptor with a REST trigger and main flow",
		nil,
		true,
	)
	if err != nil {
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", err.Error())
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepCreateMinimalApp,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: err.Error(),
		}, true, nil
	}

	if snapshot.Mode == contracts.ModeReview || snapshot.ApprovalPolicy.RequireWriteApproval {
		snapshot.Status = contracts.SessionStatusWaitingApproval
		snapshot.PendingApproval = &contracts.PendingApproval{
			Kind:        "bootstrap",
			Summary:     "review the proposed bootstrap app before applying",
			RequestedAt: nowUTC(),
			PatchPlan:   patchPlan,
			Writes: []contracts.PendingFileWrite{
				{Path: doc.Path, Content: content},
			},
		}
		snapshot.LastReport = &contracts.RunReport{
			Outcome:    contracts.RunOutcomeReady,
			PatchPlan:  patchPlan,
			NextAction: "review the proposed bootstrap app before applying",
		}
		snapshot.Plan = []contracts.PlanItem{
			{ID: "inspect", Title: "Inspect flogo.json and flow resources", Status: contracts.PlanItemCompleted},
			{ID: "create", Title: "Create a minimal Flogo app bootstrap", Status: contracts.PlanItemInProgress, Details: "review the proposed bootstrap app before applying"},
			{ID: "repair", Title: "Repair Flogo descriptor issues", Status: contracts.PlanItemPending},
			{ID: "build", Title: "Build the generated app", Status: contracts.PlanItemPending},
			{ID: "test", Title: "Run available flow and unit tests", Status: contracts.PlanItemPending},
		}
		appendEvent(snapshot, "creation", "prepared a bootstrap flogo.json for review")
		return contracts.TurnStepResult{
			Type:   contracts.TurnStepCreateMinimalApp,
			Status: contracts.TurnStepStatusCompleted,
			Summary: fmt.Sprintf(
				"Prepared a minimal Flogo app bootstrap with app %q, flow %q, route %q, and port %q for review.",
				req.AppName, req.FlowName, req.Route, req.Port,
			),
			ToolCalls: []contracts.ToolCallRecord{
				{Name: "create_minimal_app", Summary: "prepared bootstrap flogo.json patch"},
			},
			Report: snapshot.LastReport,
		}, true, nil
	}

	snapshot.Status = contracts.SessionStatusActive
	if err := pushUndoEntry(snapshot, "undo bootstrap app creation", []string{doc.Path}); err != nil {
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", err.Error())
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepCreateMinimalApp,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: err.Error(),
		}, true, nil
	}
	if err := flogo.WriteDocument(doc); err != nil {
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", err.Error())
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepCreateMinimalApp,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: err.Error(),
		}, true, nil
	}
	appendEvent(snapshot, "creation", fmt.Sprintf("created bootstrap app at %s", doc.Path))
	return contracts.TurnStepResult{
		Type:   contracts.TurnStepCreateMinimalApp,
		Status: contracts.TurnStepStatusCompleted,
		Summary: fmt.Sprintf(
			"Created a minimal Flogo app bootstrap with app %q, flow %q, route %q, and port %q.",
			req.AppName, req.FlowName, req.Route, req.Port,
		),
		ToolCalls: []contracts.ToolCallRecord{
			{Name: "create_minimal_app", Summary: "wrote bootstrap flogo.json"},
		},
	}, false, nil
}

func (c *Coordinator) repairAndVerify(ctx context.Context, snapshot *contracts.SessionSnapshot) (contracts.TurnStepResult, bool, error) {
	if !hasFlogoJSON(snapshot.RepoPath) {
		snapshot.Status = contracts.SessionStatusBlocked
		summary := "No flogo.json is present. Create a Flogo app before repair and verification."
		appendEvent(snapshot, "blocked", summary)
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepRepairAndVerify,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: summary,
		}, true, nil
	}

	if snapshot.Mode != contracts.ModeReview {
		if err := pushUndoEntry(snapshot, "undo last applied repair", []string{filepath.Join(snapshot.RepoPath, "flogo.json")}); err != nil {
			return contracts.TurnStepResult{}, true, err
		}
	}

	report, err := c.service.Run(ctx, sessionRequest(snapshot))
	if err != nil {
		return contracts.TurnStepResult{}, true, err
	}
	applyReport(snapshot, report, true)
	appendEvent(snapshot, "execution", report.NextAction)
	stop := report.Outcome != contracts.RunOutcomeApplied
	return contracts.TurnStepResult{
		Type:      contracts.TurnStepRepairAndVerify,
		Status:    statusFromOutcome(report.Outcome),
		Summary:   summarizeReport(report),
		ToolCalls: toolCallsFromReport(report, "repair_and_verify"),
		Report:    report,
	}, stop, nil
}

func (c *Coordinator) approvePending(ctx context.Context, snapshot *contracts.SessionSnapshot) (contracts.TurnStepResult, bool, error) {
	if snapshot.PendingApproval == nil {
		summary := "No pending patch is waiting for approval."
		appendEvent(snapshot, "approval", summary)
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepApprovePending,
			Status:  contracts.TurnStepStatusCompleted,
			Summary: summary,
		}, true, nil
	}

	if err := pushUndoEntry(snapshot, "undo approved patch", pendingApprovalPaths(snapshot.PendingApproval)); err != nil {
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", err.Error())
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepApprovePending,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: err.Error(),
		}, true, nil
	}

	if err := applyPendingWrites(snapshot.PendingApproval); err != nil {
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", err.Error())
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepApprovePending,
			Status:  contracts.TurnStepStatusBlocked,
			Summary: err.Error(),
		}, true, nil
	}

	report, err := c.service.Run(ctx, applyRequest(snapshot))
	if err != nil {
		return contracts.TurnStepResult{}, true, err
	}
	applyReport(snapshot, report, true)
	appendEvent(snapshot, "approval", "approved and executed the pending patch")
	return contracts.TurnStepResult{
		Type:      contracts.TurnStepApprovePending,
		Status:    statusFromOutcome(report.Outcome),
		Summary:   summarizeReport(report),
		ToolCalls: toolCallsFromReport(report, "approve_pending"),
		Report:    report,
	}, report.Outcome != contracts.RunOutcomeApplied, nil
}

func (c *Coordinator) UndoLastPatch(snapshot *contracts.SessionSnapshot) error {
	if snapshot == nil {
		return fmt.Errorf("session snapshot is required")
	}
	if len(snapshot.UndoStack) == 0 {
		appendEvent(snapshot, "undo", "no agent-authored patch is available to undo")
		appendMessage(snapshot, contracts.RoleAssistant, "There is no agent-authored patch to undo in this session.")
		c.flush(snapshot)
		return nil
	}

	entry := snapshot.UndoStack[len(snapshot.UndoStack)-1]
	if err := applyWrites(entry.Writes); err != nil {
		snapshot.Status = contracts.SessionStatusBlocked
		appendEvent(snapshot, "blocked", err.Error())
		appendMessage(snapshot, contracts.RoleAssistant, "Undo failed: "+err.Error())
		c.flush(snapshot)
		return err
	}

	snapshot.UndoStack = snapshot.UndoStack[:len(snapshot.UndoStack)-1]
	snapshot.Status = contracts.SessionStatusActive
	snapshot.PendingApproval = nil
	snapshot.LastReport = nil
	snapshot.LastStepResults = nil
	appendEvent(snapshot, "undo", entry.Summary)
	appendMessage(snapshot, contracts.RoleAssistant, "Reverted the last agent-authored patch.")
	c.flush(snapshot)
	return nil
}

func (c *Coordinator) rejectPending(snapshot *contracts.SessionSnapshot, reason string) contracts.TurnStepResult {
	if snapshot.PendingApproval == nil {
		summary := "No pending patch is waiting for rejection."
		appendEvent(snapshot, "approval", summary)
		return contracts.TurnStepResult{
			Type:    contracts.TurnStepRejectPending,
			Status:  contracts.TurnStepStatusCompleted,
			Summary: summary,
		}
	}

	snapshot.PendingApproval = nil
	snapshot.Status = contracts.SessionStatusActive
	summary := "Rejected the pending patch."
	if strings.TrimSpace(reason) != "" {
		summary = fmt.Sprintf("Rejected the pending patch: %s", strings.TrimSpace(reason))
	}
	appendEvent(snapshot, "approval", summary)
	return contracts.TurnStepResult{
		Type:    contracts.TurnStepRejectPending,
		Status:  contracts.TurnStepStatusCompleted,
		Summary: summary,
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
	snapshot.Plan = derivePlan(report, snapshot.LastTurnKind)

	switch report.Outcome {
	case contracts.RunOutcomeReady:
		snapshot.Status = contracts.SessionStatusWaitingApproval
		snapshot.PendingApproval = &contracts.PendingApproval{
			Kind:        "patch",
			Summary:     report.NextAction,
			RequestedAt: nowUTC(),
			PatchPlan:   report.PatchPlan,
		}
	case contracts.RunOutcomeApplied:
		snapshot.PendingApproval = nil
		if executed {
			snapshot.Status = contracts.SessionStatusCompleted
		} else {
			snapshot.Status = contracts.SessionStatusActive
		}
	case contracts.RunOutcomeBlocked, contracts.RunOutcomeFailed:
		snapshot.PendingApproval = nil
		snapshot.Status = contracts.SessionStatusBlocked
	default:
		snapshot.PendingApproval = nil
	}
}

func derivePlan(report *contracts.RunReport, lastTurnKind string) []contracts.PlanItem {
	plan := []contracts.PlanItem{
		{ID: "inspect", Title: "Inspect flogo.json and flow resources", Status: contracts.PlanItemCompleted},
	}
	if lastTurnKind == "creation" {
		plan = append(plan, contracts.PlanItem{ID: "create", Title: "Create a minimal Flogo app bootstrap", Status: contracts.PlanItemCompleted})
	}
	plan = append(plan,
		contracts.PlanItem{ID: "repair", Title: "Repair Flogo descriptor issues", Status: contracts.PlanItemPending},
		contracts.PlanItem{ID: "build", Title: "Build the generated app", Status: contracts.PlanItemPending},
		contracts.PlanItem{ID: "test", Title: "Run available flow and unit tests", Status: contracts.PlanItemPending},
	)
	if report == nil {
		return plan
	}

	repairIndex := len(plan) - 3
	buildIndex := len(plan) - 2
	testIndex := len(plan) - 1

	if report.PatchPlan != nil {
		plan[repairIndex].Status = contracts.PlanItemInProgress
		plan[repairIndex].Details = report.NextAction
	}
	if report.Evidence.ValidationResult.Passed {
		plan[repairIndex].Status = contracts.PlanItemCompleted
	}
	if report.Evidence.BuildResult != nil {
		if report.Evidence.BuildResult.ExitCode == 0 {
			plan[buildIndex].Status = contracts.PlanItemCompleted
		} else {
			plan[buildIndex].Status = contracts.PlanItemBlocked
			plan[buildIndex].Details = report.NextAction
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
			plan[testIndex].Status = contracts.PlanItemCompleted
		} else {
			plan[testIndex].Status = contracts.PlanItemBlocked
			plan[testIndex].Details = report.NextAction
		}
	}
	if report.Outcome == contracts.RunOutcomeBlocked && report.Evidence.BuildResult == nil {
		plan[repairIndex].Status = contracts.PlanItemBlocked
		plan[repairIndex].Details = report.NextAction
	}
	return plan
}

func renderTurnSummary(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return "No session is loaded."
	}

	var builder strings.Builder
	if snapshot.LastTurnPlan != nil {
		builder.WriteString("Plan: ")
		builder.WriteString(snapshot.LastTurnPlan.GoalSummary)
		builder.WriteByte('\n')
		builder.WriteString("Planner: ")
		builder.WriteString(snapshot.LastTurnPlan.Planner)
		builder.WriteByte('\n')
	}
	if snapshot.LastTurnKind != "" {
		builder.WriteString("Turn kind: ")
		builder.WriteString(snapshot.LastTurnKind)
		builder.WriteByte('\n')
	}
	if len(snapshot.LastStepResults) > 0 {
		builder.WriteString("Step results:\n")
		for _, result := range snapshot.LastStepResults {
			builder.WriteString(fmt.Sprintf("- [%s] %s: %s\n", result.Status, result.Type, result.Summary))
		}
	}
	if snapshot.PendingApproval != nil {
		builder.WriteString("Pending approval: ")
		builder.WriteString(snapshot.PendingApproval.Summary)
		builder.WriteByte('\n')
	}
	if snapshot.LastReport != nil {
		builder.WriteString("Latest report: ")
		builder.WriteString(summarizeReport(snapshot.LastReport))
		builder.WriteByte('\n')
		for _, test := range snapshot.LastReport.Evidence.TestResults {
			builder.WriteString(fmt.Sprintf("Test %s passed=%t skipped=%t\n", test.Name, test.Passed, test.Skipped))
		}
	}
	return strings.TrimSpace(builder.String())
}

func renderPlan(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return "No plan is available yet."
	}
	var builder strings.Builder
	if snapshot.LastTurnPlan != nil {
		builder.WriteString("Last turn plan:\n")
		for _, step := range snapshot.LastTurnPlan.Steps {
			builder.WriteString("- " + string(step.Type))
			if step.Reason != "" {
				builder.WriteString(": " + step.Reason)
			}
			builder.WriteByte('\n')
		}
	}
	if len(snapshot.Plan) > 0 {
		if builder.Len() > 0 {
			builder.WriteByte('\n')
		}
		builder.WriteString("Execution plan:\n")
		for _, item := range snapshot.Plan {
			builder.WriteString(fmt.Sprintf("- [%s] %s", item.Status, item.Title))
			if item.Details != "" {
				builder.WriteString(": " + item.Details)
			}
			builder.WriteByte('\n')
		}
	}
	if builder.Len() == 0 {
		return "No plan is available yet."
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
	if snapshot.LastTurnKind != "" {
		builder.WriteString(fmt.Sprintf("Last turn kind: %s\n", snapshot.LastTurnKind))
	}
	if snapshot.LastTurnPlan != nil {
		builder.WriteString("Last planner: " + snapshot.LastTurnPlan.Planner + "\n")
	}
	if snapshot.PendingApproval != nil {
		builder.WriteString("Pending approval: yes\n")
		builder.WriteString("Next: " + snapshot.PendingApproval.Summary)
	} else {
		builder.WriteString("Pending approval: no")
	}
	return builder.String()
}

func (c *Coordinator) composeAssistantResponse(ctx context.Context, snapshot *contracts.SessionSnapshot) string {
	if c == nil || c.responder == nil {
		return renderTurnSummary(snapshot)
	}
	return c.responder.ComposeTurnResponse(ctx, snapshot)
}

func applyPendingWrites(pending *contracts.PendingApproval) error {
	if pending == nil {
		return nil
	}
	return applyWrites(pending.Writes)
}

func applyWrites(writes []contracts.PendingFileWrite) error {
	for _, write := range writes {
		if strings.TrimSpace(write.Path) == "" {
			continue
		}
		if write.Delete {
			if err := os.Remove(write.Path); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove %s: %w", write.Path, err)
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(write.Path), 0o755); err != nil {
			return fmt.Errorf("create directory for %s: %w", write.Path, err)
		}
		if err := os.WriteFile(write.Path, []byte(write.Content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", write.Path, err)
		}
	}
	return nil
}

func pendingWritePaths(pending *contracts.PendingApproval) []string {
	if pending == nil {
		return nil
	}
	paths := make([]string, 0, len(pending.Writes))
	for _, write := range pending.Writes {
		if strings.TrimSpace(write.Path) != "" {
			paths = append(paths, write.Path)
		}
	}
	return paths
}

func pendingApprovalPaths(pending *contracts.PendingApproval) []string {
	paths := pendingWritePaths(pending)
	if len(paths) > 0 {
		return paths
	}
	if pending == nil || pending.PatchPlan == nil {
		return nil
	}
	paths = make([]string, 0, len(pending.PatchPlan.TargetFiles))
	for _, path := range pending.PatchPlan.TargetFiles {
		if strings.TrimSpace(path) != "" {
			paths = append(paths, path)
		}
	}
	return paths
}

func pushUndoEntry(snapshot *contracts.SessionSnapshot, summary string, paths []string) error {
	writes, err := captureUndoWrites(paths)
	if err != nil {
		return err
	}
	if len(writes) == 0 {
		return nil
	}
	snapshot.UndoStack = append(snapshot.UndoStack, contracts.UndoEntry{
		ID:        nextID("undo"),
		Summary:   summary,
		CreatedAt: nowUTC(),
		Writes:    writes,
	})
	return nil
}

func captureUndoWrites(paths []string) ([]contracts.PendingFileWrite, error) {
	seen := map[string]struct{}{}
	writes := make([]contracts.PendingFileWrite, 0, len(paths))
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		contents, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				writes = append(writes, contracts.PendingFileWrite{Path: path, Delete: true})
				continue
			}
			return nil, fmt.Errorf("capture undo contents for %s: %w", path, err)
		}
		writes = append(writes, contracts.PendingFileWrite{Path: path, Content: string(contents)})
	}
	return writes, nil
}

func toolCallsFromReport(report *contracts.RunReport, name string) []contracts.ToolCallRecord {
	if report == nil {
		return nil
	}
	records := []contracts.ToolCallRecord{
		{Name: name, Summary: report.NextAction},
	}
	if report.Evidence.BuildResult != nil {
		records = append(records, contracts.ToolCallRecord{
			Name:   "build",
			Result: report.Evidence.BuildResult,
		})
	}
	for _, test := range report.Evidence.TestResults {
		result := test.Result
		records = append(records, contracts.ToolCallRecord{
			Name:    test.Name,
			Summary: fmt.Sprintf("passed=%t skipped=%t", test.Passed, test.Skipped),
			Result:  &result,
		})
	}
	return records
}

func summarizeReport(report *contracts.RunReport) string {
	if report == nil {
		return "no report available"
	}
	if report.NextAction != "" {
		return fmt.Sprintf("Outcome: %s; %s", report.Outcome, report.NextAction)
	}
	return fmt.Sprintf("Outcome: %s", report.Outcome)
}

func statusFromOutcome(outcome contracts.RunOutcome) contracts.TurnStepStatus {
	switch outcome {
	case contracts.RunOutcomeApplied, contracts.RunOutcomeReady:
		return contracts.TurnStepStatusCompleted
	default:
		return contracts.TurnStepStatusBlocked
	}
}

func hasFlogoJSON(repoPath string) bool {
	_, err := os.Stat(filepath.Join(repoPath, "flogo.json"))
	return err == nil
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

func (c *Coordinator) flush(snapshot *contracts.SessionSnapshot) {
	if c == nil || c.onUpdate == nil || snapshot == nil {
		return
	}
	c.onUpdate(snapshot)
}
