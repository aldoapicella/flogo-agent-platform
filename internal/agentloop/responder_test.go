package agentloop

import (
	"context"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func TestResponderUsesDeterministicPendingPatchSummary(t *testing.T) {
	snapshot := &contracts.SessionSnapshot{
		Status:       contracts.SessionStatusWaitingApproval,
		LastTurnKind: "repair",
		LastReport: &contracts.RunReport{
			Outcome:    contracts.RunOutcomeReady,
			NextAction: "review the proposed patch before applying",
			Messages: []string{
				"normalized flowURI at $.triggers[0].handlers[0].action.settings.flowURI",
				`replaced invalid handler action input scope at $.triggers[0].handlers[0].action.input.message with "=$.pathParams.val"`,
				"removed inline handler action id \"runFlow\" at $.triggers[0].handlers[0].action.id",
			},
			PatchPlan: &contracts.PatchPlan{
				UnifiedDiff: `--- before/flogo.json
+++ after/flogo.json
@@
-                "flowURI": "main",
-                "id": "runFlow",
-                "message": "=$flow.body"
+                "flowURI": "res://flow:main",
+                "message": "=$.pathParams.val"`,
			},
			Evidence: contracts.BuildTestEvidence{
				ValidationResult: contracts.ValidationResult{
					SemanticIssues: []contracts.ValidationIssue{
						{Severity: "error", RuleID: "flow.uri.prefix", Message: `flowURI "main" should use res://flow:<id>`},
						{Severity: "error", RuleID: "handler.action.input.invalid_scope", Message: `handler action input "message" uses unsupported resolver $flow before the flow executes; map from trigger data using $.<field> instead`},
						{Severity: "error", RuleID: "mapping.expression_prefix", Message: `mapping expression "$flow.body" should start with '='`},
						{Severity: "error", RuleID: "handler.action.inline_id", Message: `inline handler action "runFlow" should not declare id when the action body is embedded`},
					},
				},
			},
		},
		PendingApproval: &contracts.PendingApproval{
			Summary: "review the proposed patch before applying",
			PatchPlan: &contracts.PatchPlan{
				UnifiedDiff: `--- before/flogo.json
+++ after/flogo.json`,
			},
		},
	}

	text := NewResponder(responderFakeModel{text: "ignored", model: "test-model"}).ComposeTurnResponse(context.Background(), snapshot)
	if !strings.Contains(text, "I found these blocking issues:") {
		t.Fatalf("expected issue summary, got %q", text)
	}
	if !strings.Contains(text, `flowURI "main" should use res://flow:<id>`) {
		t.Fatalf("expected flowURI issue in response, got %q", text)
	}
	if !strings.Contains(text, "=$.pathParams.val") {
		t.Fatalf("expected repaired mapping in response, got %q", text)
	}
	if strings.Contains(text, "ignored") {
		t.Fatalf("expected deterministic response to win over model text, got %q", text)
	}
}

func TestResponderUsesDeterministicApprovalSummary(t *testing.T) {
	snapshot := &contracts.SessionSnapshot{
		Status:       contracts.SessionStatusCompleted,
		LastTurnKind: "approval",
		LastReport: &contracts.RunReport{
			Outcome:    contracts.RunOutcomeApplied,
			NextAction: "validation, build, and available tests completed",
			Evidence: contracts.BuildTestEvidence{
				ValidationResult: contracts.ValidationResult{Passed: true},
				BuildResult:      &contracts.ToolResult{ExitCode: 0},
				TestResults: []contracts.TestResult{
					{Name: "orphaned-check", Passed: true},
					{Name: "startup-smoke", Passed: true},
					{Name: "flow-list", Skipped: true, Result: contracts.ToolResult{ExitCode: 2}, SkipReason: "the built executable does not support Flogo -test flags"},
				},
			},
		},
	}

	text := NewResponder(responderFakeModel{text: "ignored", model: "test-model"}).ComposeTurnResponse(context.Background(), snapshot)
	if !strings.Contains(text, "I applied the patch you approved.") {
		t.Fatalf("expected explicit user approval wording, got %q", text)
	}
	if !strings.Contains(text, "flow-list skipped: the built executable does not support Flogo -test flags") {
		t.Fatalf("expected explicit skip reason, got %q", text)
	}
	if strings.Contains(strings.ToLower(text), "i approved") {
		t.Fatalf("did not expect assistant to claim it approved the patch, got %q", text)
	}
}

type responderFakeModel struct {
	text  string
	model string
	err   error
}

func (f responderFakeModel) GenerateText(_ context.Context, _ model.TextRequest) (model.TextResponse, error) {
	if f.err != nil {
		return model.TextResponse{}, f.err
	}
	return model.TextResponse{Text: f.text, Model: f.model}, nil
}

func (f responderFakeModel) ProviderName() string {
	return "fake"
}
