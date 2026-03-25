package agentloop

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

type Planner struct {
	modelClient model.Client
}

func NewPlanner(modelClient model.Client) *Planner {
	return &Planner{modelClient: modelClient}
}

type workspaceFacts struct {
	RepoPath          string
	HasFlogoJSON      bool
	HasFlogoTest      bool
	HasPendingApproval bool
	LastOutcome       string
}

func collectWorkspaceFacts(snapshot *contracts.SessionSnapshot) workspaceFacts {
	facts := workspaceFacts{
		RepoPath: snapshot.RepoPath,
	}
	if _, err := os.Stat(filepath.Join(snapshot.RepoPath, "flogo.json")); err == nil {
		facts.HasFlogoJSON = true
	}
	if _, err := os.Stat(filepath.Join(snapshot.RepoPath, ".flogotest")); err == nil {
		facts.HasFlogoTest = true
	}
	facts.HasPendingApproval = snapshot.PendingApproval != nil
	if snapshot.LastReport != nil {
		facts.LastOutcome = string(snapshot.LastReport.Outcome)
	}
	return facts
}

func (f workspaceFacts) toMap() map[string]string {
	return map[string]string{
		"repoPath":           f.RepoPath,
		"hasFlogoJSON":       boolString(f.HasFlogoJSON),
		"hasFlogoTest":       boolString(f.HasFlogoTest),
		"hasPendingApproval": boolString(f.HasPendingApproval),
		"lastOutcome":        f.LastOutcome,
	}
}

func (p *Planner) PlanTurn(ctx context.Context, snapshot *contracts.SessionSnapshot, userMessage string) contracts.TurnPlan {
	facts := collectWorkspaceFacts(snapshot)
	fallback := deterministicPlan(snapshot, userMessage, facts)
	fallback.Workspace = facts.toMap()

	if p == nil || p.modelClient == nil {
		fallback.Planner = "deterministic"
		return fallback
	}

	systemPrompt := strings.TrimSpace(`You are a Flogo coding-agent turn planner.
Return only valid JSON with no markdown fences and no explanation.
You must choose from these step types only:
- inspect_workspace
- analyze_flogo
- create_minimal_app
- repair_and_verify
- approve_pending
- reject_pending
- show_diff
- show_status

Rules:
- If the repo has no flogo.json and the user asks to create/bootstrap/start a Flogo app, include create_minimal_app then repair_and_verify.
- If the repo has no flogo.json and the user asks only to repair, do not invent a descriptor; inspect and explain the missing app instead.
- If approval is pending and the user asks to approve/reject/show diff/status, choose those steps directly.
- Prefer the smallest number of steps needed to complete the turn.
- Keep creation scope minimal: a basic REST-triggered app with one main flow.`)

	response, err := p.modelClient.GenerateText(ctx, model.TextRequest{
		SystemPrompt:    systemPrompt,
		UserPrompt:      buildPlannerPrompt(snapshot, userMessage, facts),
		MaxOutputTokens: 2000,
	})
	if err != nil {
		fallback.Planner = "deterministic-fallback"
		fallback.Notes = append(fallback.Notes, fmt.Sprintf("planner call failed: %v", err))
		return fallback
	}

	parsed, err := parseTurnPlan(response.Text)
	if err != nil {
		fallback.Planner = "deterministic-fallback"
		fallback.Notes = append(fallback.Notes, fmt.Sprintf("planner output was invalid: %v", err))
		return fallback
	}
	if err := validateTurnPlan(parsed, facts); err != nil {
		fallback.Planner = "deterministic-fallback"
		fallback.Notes = append(fallback.Notes, fmt.Sprintf("planner output did not validate: %v", err))
		return fallback
	}

	parsed.Planner = fmt.Sprintf("%s/%s", p.modelClient.ProviderName(), response.Model)
	parsed.Workspace = facts.toMap()
	return parsed
}

func buildPlannerPrompt(snapshot *contracts.SessionSnapshot, userMessage string, facts workspaceFacts) string {
	var builder strings.Builder
	builder.WriteString("Return JSON matching this shape:\n")
	builder.WriteString(`{"goalSummary":"...","requiresCreation":false,"steps":[{"type":"inspect_workspace","reason":"...","params":{"app_name":"...","flow_name":"...","route":"/","port":"8888"}}]}`)
	builder.WriteString("\n\nSession goal: ")
	builder.WriteString(snapshot.Goal)
	builder.WriteString("\nSession mode: ")
	builder.WriteString(string(snapshot.Mode))
	builder.WriteString("\nUser message: ")
	builder.WriteString(strings.TrimSpace(userMessage))
	builder.WriteString("\nWorkspace facts:\n")
	for key, value := range facts.toMap() {
		builder.WriteString("- " + key + ": " + value + "\n")
	}
	if snapshot.PendingApproval != nil {
		builder.WriteString("Pending approval summary: " + snapshot.PendingApproval.Summary + "\n")
	}
	if snapshot.LastReport != nil {
		builder.WriteString("Last outcome: " + string(snapshot.LastReport.Outcome) + "\n")
	}
	return builder.String()
}

func deterministicPlan(snapshot *contracts.SessionSnapshot, userMessage string, facts workspaceFacts) contracts.TurnPlan {
	normalized := strings.ToLower(strings.TrimSpace(userMessage))
	switch {
	case facts.HasPendingApproval && (normalized == "approve" || strings.Contains(normalized, "approve pending") || strings.HasPrefix(normalized, "/approve")):
		return contracts.TurnPlan{
			GoalSummary: "Approve the pending patch and continue verification",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepApprovePending, Reason: "the session is waiting for approval"},
			},
		}
	case facts.HasPendingApproval && (normalized == "reject" || strings.HasPrefix(normalized, "/reject")):
		return contracts.TurnPlan{
			GoalSummary: "Reject the pending patch",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepRejectPending, Reason: "the session is waiting for approval"},
			},
		}
	case facts.HasPendingApproval && (normalized == "diff" || strings.HasPrefix(normalized, "/diff") || strings.Contains(normalized, "show diff")):
		return contracts.TurnPlan{
			GoalSummary: "Show the current pending diff",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepShowDiff, Reason: "a patch is pending"},
			},
		}
	case normalized == "status" || strings.HasPrefix(normalized, "/status") || strings.Contains(normalized, "what's the status") || strings.Contains(normalized, "what is the status"):
		return contracts.TurnPlan{
			GoalSummary: "Show the current session status",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepShowStatus, Reason: "the user asked for current status"},
			},
		}
	}

	createRequested := containsAny(normalized, "create", "bootstrap", "new app", "start app", "initialize", "init")
	executeRequested := containsAny(normalized, "build", "test", "repair", "fix", "apply", "update", "verify", "run")

	if !facts.HasFlogoJSON {
		if createRequested {
			return contracts.TurnPlan{
				GoalSummary:      "Create a minimal Flogo app and verify it",
				RequiresCreation: true,
				Steps: []contracts.TurnStep{
					{Type: contracts.TurnStepInspectWorkspace, Reason: "confirm the repo does not contain flogo.json"},
					{Type: contracts.TurnStepCreateMinimalApp, Reason: "bootstrap a minimal valid Flogo app", Params: map[string]string{
						"app_name":  filepath.Base(snapshot.RepoPath),
						"flow_name": "main",
						"route":     "/",
						"port":      "8888",
					}},
					{Type: contracts.TurnStepRepairAndVerify, Reason: "validate, build, and test the newly created app"},
				},
			}
		}
		return contracts.TurnPlan{
			GoalSummary: "Inspect the workspace and explain that no Flogo app exists yet",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepInspectWorkspace, Reason: "the repo does not contain flogo.json"},
				{Type: contracts.TurnStepShowStatus, Reason: "report the missing Flogo app state"},
			},
		}
	}

	if executeRequested {
		return contracts.TurnPlan{
			GoalSummary: "Inspect, repair, build, and test the Flogo app",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepInspectWorkspace, Reason: "capture current repo state before execution"},
				{Type: contracts.TurnStepAnalyzeFlogo, Reason: "understand the current descriptor issues"},
				{Type: contracts.TurnStepRepairAndVerify, Reason: "run the repair/build/test loop"},
			},
		}
	}

	return contracts.TurnPlan{
		GoalSummary: "Inspect the current Flogo app and explain its state",
		Steps: []contracts.TurnStep{
			{Type: contracts.TurnStepInspectWorkspace, Reason: "capture current repo state"},
			{Type: contracts.TurnStepAnalyzeFlogo, Reason: "explain the current Flogo descriptor state"},
		},
	}
}

func parseTurnPlan(text string) (contracts.TurnPlan, error) {
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
		trimmed = strings.TrimPrefix(trimmed, "```")
		trimmed = strings.TrimSuffix(trimmed, "```")
		trimmed = strings.TrimSpace(trimmed)
	}

	if !json.Valid([]byte(trimmed)) {
		start := strings.Index(trimmed, "{")
		end := strings.LastIndex(trimmed, "}")
		if start == -1 || end == -1 || end <= start {
			return contracts.TurnPlan{}, fmt.Errorf("planner response did not contain valid JSON")
		}
		trimmed = strings.TrimSpace(trimmed[start : end+1])
	}

	var plan contracts.TurnPlan
	if err := json.Unmarshal([]byte(trimmed), &plan); err != nil {
		return contracts.TurnPlan{}, err
	}
	return plan, nil
}

func validateTurnPlan(plan contracts.TurnPlan, facts workspaceFacts) error {
	if strings.TrimSpace(plan.GoalSummary) == "" {
		return fmt.Errorf("goalSummary is required")
	}
	if len(plan.Steps) == 0 {
		return fmt.Errorf("at least one step is required")
	}
	requiresCreation := false
	for _, step := range plan.Steps {
		switch step.Type {
		case contracts.TurnStepInspectWorkspace, contracts.TurnStepAnalyzeFlogo, contracts.TurnStepCreateMinimalApp,
			contracts.TurnStepRepairAndVerify, contracts.TurnStepApprovePending, contracts.TurnStepRejectPending,
			contracts.TurnStepShowDiff, contracts.TurnStepShowStatus:
		default:
			return fmt.Errorf("unsupported step type %q", step.Type)
		}
		if step.Type == contracts.TurnStepCreateMinimalApp {
			requiresCreation = true
		}
		if !facts.HasFlogoJSON && step.Type == contracts.TurnStepAnalyzeFlogo && !requiresCreation {
			return fmt.Errorf("analyze_flogo requires flogo.json or prior creation")
		}
		if !facts.HasFlogoJSON && step.Type == contracts.TurnStepRepairAndVerify && !requiresCreation {
			return fmt.Errorf("repair_and_verify requires flogo.json or prior creation")
		}
	}
	if plan.RequiresCreation && !requiresCreation {
		return fmt.Errorf("requiresCreation=true without create_minimal_app step")
	}
	return nil
}

func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

func containsAny(text string, items ...string) bool {
	for _, item := range items {
		if strings.Contains(text, item) {
			return true
		}
	}
	return false
}
