package agentloop

import (
	"context"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestCoordinatorAnswersDirectProductQuestionWithoutRepoInspection(t *testing.T) {
	snapshot := &contracts.SessionSnapshot{
		ID:       "session-1",
		RepoPath: t.TempDir(),
		Goal:     "help with a Flogo app",
		Mode:     contracts.ModeReview,
		Status:   contracts.SessionStatusActive,
	}

	coordinator := New(nil, nil)
	if err := coordinator.HandleUserMessage(context.Background(), snapshot, "what are you"); err != nil {
		t.Fatal(err)
	}

	if snapshot.LastTurnKind != "conversation" {
		t.Fatalf("expected conversation turn kind, got %q", snapshot.LastTurnKind)
	}
	if len(snapshot.LastStepResults) != 0 {
		t.Fatalf("expected no execution steps, got %+v", snapshot.LastStepResults)
	}
	last := snapshot.Messages[len(snapshot.Messages)-1]
	if last.Role != contracts.RoleAssistant {
		t.Fatalf("expected assistant reply, got %+v", last)
	}
	if !strings.Contains(strings.ToLower(last.Content), "conversational coding agent specifically for tibco flogo apps") {
		t.Fatalf("unexpected assistant reply %q", last.Content)
	}
}

func TestClassifyTurnKindPrioritizesRepairOverInspection(t *testing.T) {
	kind := classifyTurnKind(contracts.TurnPlan{
		GoalSummary: "repair and verify",
		Steps: []contracts.TurnStep{
			{Type: contracts.TurnStepInspectWorkspace},
			{Type: contracts.TurnStepInspectDescriptor},
			{Type: contracts.TurnStepAnalyzeFlogo},
			{Type: contracts.TurnStepRepairAndVerify},
		},
	})
	if kind != "repair" {
		t.Fatalf("expected repair turn kind, got %q", kind)
	}
}
