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

func TestResponderUsesFocusedDiffExcerpt(t *testing.T) {
	snapshot := &contracts.SessionSnapshot{
		Status:       contracts.SessionStatusWaitingApproval,
		LastTurnKind: "repair",
		LastStepResults: []contracts.TurnStepResult{
			{Type: contracts.TurnStepShowDiff, Status: contracts.TurnStepStatusCompleted},
		},
		LastReport: &contracts.RunReport{
			Outcome: contracts.RunOutcomeReady,
			Messages: []string{
				"normalized flowURI at $.triggers[0].handlers[0].action.settings.flowURI",
				`replaced invalid handler action input scope at $.triggers[0].handlers[0].action.input.message with "=$.pathParams.val"`,
				"removed inline handler action id \"runFlow\" at $.triggers[0].handlers[0].action.id",
			},
			PatchPlan: &contracts.PatchPlan{
				UnifiedDiff: `--- before/flogo.json
+++ after/flogo.json
@@
-              {
-                "settings": {
-                  "flowURI": "main"
-                },
-                "id": "runFlow",
-                "input": {
-                  "message": "$flow.body"
-                }
-              }
+              {
+                "input": {
+                  "message": "=$.pathParams.val"
+                },
+                "settings": {
+                  "flowURI": "res://flow:main"
+                }
+              }`,
			},
		},
		PendingApproval: &contracts.PendingApproval{
			Summary: "review the proposed patch before applying",
			PatchPlan: &contracts.PatchPlan{
				UnifiedDiff: "--- before\n+++ after",
			},
		},
	}

	text := NewResponder(nil).ComposeTurnResponse(context.Background(), snapshot)
	if !strings.Contains(text, "Semantic changes:") {
		t.Fatalf("expected semantic diff heading, got %q", text)
	}
	if strings.Contains(text, `-              {`) {
		t.Fatalf("expected focused semantic excerpt, got %q", text)
	}
	if !strings.Contains(text, `"flowURI": "res://flow:main"`) {
		t.Fatalf("expected flowURI line in focused diff excerpt, got %q", text)
	}
	if !strings.Contains(text, `"message": "=$.pathParams.val"`) {
		t.Fatalf("expected mapping line in focused diff excerpt, got %q", text)
	}
}

func TestResponderUsesDeterministicLocalTestingGuidance(t *testing.T) {
	snapshot := &contracts.SessionSnapshot{
		Status:       contracts.SessionStatusCompleted,
		LastTurnKind: "inspection",
		LastStepResults: []contracts.TurnStepResult{
			{
				Type:   contracts.TurnStepInspectBuildArtifacts,
				Status: contracts.TurnStepStatusCompleted,
				Observations: []contracts.Observation{
					{
						Kind:    "binary",
						Summary: "The built executable is /tmp/app/bin/sample-app.",
						Data: map[string]string{
							"path":          "/tmp/app/bin/sample-app",
							"start_command": "/tmp/app/bin/sample-app",
						},
					},
					{
						Kind:    "test_support",
						Summary: "The built executable does not support Flogo -test flags, so use startup and trigger-level testing instead.",
						Data: map[string]string{
							"supports_test_flags": "false",
						},
					},
				},
			},
			{
				Type:   contracts.TurnStepPlanLocalTesting,
				Status: contracts.TurnStepStatusCompleted,
				Observations: []contracts.Observation{
					{
						Kind:    "local_test_plan",
						Summary: "Start /tmp/app/bin/sample-app, then test GET http://127.0.0.1:8888/test with curl -i http://127.0.0.1:8888/test.",
						Data: map[string]string{
							"method": "GET",
							"port":   "8888",
							"path":   "/test",
							"url":    "http://127.0.0.1:8888/test",
							"curl":   "curl -i http://127.0.0.1:8888/test",
						},
					},
				},
			},
		},
		LastReport: &contracts.RunReport{
			Outcome:    contracts.RunOutcomeApplied,
			NextAction: "validation, build, and available tests completed",
		},
	}

	text := NewResponder(responderFakeModel{text: "ignored", model: "test-model"}).ComposeTurnResponse(context.Background(), snapshot)
	if !strings.Contains(text, "/tmp/app/bin/sample-app") {
		t.Fatalf("expected binary path in local testing guidance, got %q", text)
	}
	if !strings.Contains(text, "curl -i http://127.0.0.1:8888/test") {
		t.Fatalf("expected curl command in local testing guidance, got %q", text)
	}
	if strings.Contains(text, "validation, build, and available tests completed") {
		t.Fatalf("expected local testing guidance instead of generic verification summary, got %q", text)
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

func (f responderFakeModel) GenerateMultimodalText(_ context.Context, _ model.MultimodalTextRequest) (model.TextResponse, error) {
	if f.err != nil {
		return model.TextResponse{}, f.err
	}
	return model.TextResponse{Text: f.text, Model: f.model}, nil
}

func (f responderFakeModel) ProviderName() string {
	return "fake"
}
