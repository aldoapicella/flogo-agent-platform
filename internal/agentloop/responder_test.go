package agentloop

import (
	"context"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func TestResponderPrependsModelAuthoredReply(t *testing.T) {
	snapshot := &contracts.SessionSnapshot{
		Status:       contracts.SessionStatusWaitingApproval,
		LastTurnKind: "repair",
		LastTurnPlan: &contracts.TurnPlan{
			GoalSummary: "Repair and verify the app",
			Planner:     "openai/test-model",
		},
		LastStepResults: []contracts.TurnStepResult{
			{Type: contracts.TurnStepInspectWorkspace, Status: contracts.TurnStepStatusCompleted, Summary: "found flogo.json"},
		},
		PendingApproval: &contracts.PendingApproval{
			Summary: "review the proposed patch before applying",
		},
		LastReport: &contracts.RunReport{
			Outcome:    contracts.RunOutcomeReady,
			NextAction: "review the proposed patch before applying",
		},
	}

	text := NewResponder(responderFakeModel{text: "I inspected the app and prepared a patch for review.", model: "test-model"}).ComposeTurnResponse(context.Background(), snapshot)
	if strings.TrimSpace(text) != "I inspected the app and prepared a patch for review." {
		t.Fatalf("expected only the model-authored reply, got %q", text)
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
