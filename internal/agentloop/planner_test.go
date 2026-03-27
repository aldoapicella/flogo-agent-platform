package agentloop

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func TestPlannerCreatesMinimalAppForEmptyRepo(t *testing.T) {
	repoPath := t.TempDir()
	snapshot := &contracts.SessionSnapshot{
		RepoPath: repoPath,
		Goal:     "create a Flogo app",
		Mode:     contracts.ModeReview,
	}

	plan := NewPlanner(nil).PlanTurn(context.Background(), snapshot, "create a minimal flogo app")
	if !plan.RequiresCreation {
		t.Fatalf("expected creation plan, got %+v", plan)
	}
	if plan.Planner != "deterministic" {
		t.Fatalf("expected deterministic planner, got %q", plan.Planner)
	}
	if len(plan.Steps) != 3 {
		t.Fatalf("expected 3 steps, got %+v", plan.Steps)
	}
	if plan.Steps[0].Type != contracts.TurnStepInspectWorkspace || plan.Steps[1].Type != contracts.TurnStepCreateMinimalApp || plan.Steps[2].Type != contracts.TurnStepRepairAndVerify {
		t.Fatalf("unexpected steps: %+v", plan.Steps)
	}
}

func TestPlannerDoesNotInventCreationForRepairOnEmptyRepo(t *testing.T) {
	repoPath := t.TempDir()
	snapshot := &contracts.SessionSnapshot{
		RepoPath: repoPath,
		Goal:     "repair a Flogo app",
		Mode:     contracts.ModeReview,
	}

	plan := NewPlanner(nil).PlanTurn(context.Background(), snapshot, "repair the app")
	if plan.RequiresCreation {
		t.Fatalf("did not expect creation plan, got %+v", plan)
	}
	if len(plan.Steps) != 2 {
		t.Fatalf("expected inspect/status steps, got %+v", plan.Steps)
	}
	if plan.Steps[0].Type != contracts.TurnStepInspectWorkspace || plan.Steps[1].Type != contracts.TurnStepShowStatus {
		t.Fatalf("unexpected steps: %+v", plan.Steps)
	}
}

func TestPlannerFallsBackWhenModelOutputIsInvalid(t *testing.T) {
	repoPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(repoPath, "flogo.json"), []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	snapshot := &contracts.SessionSnapshot{
		RepoPath: repoPath,
		Goal:     "repair a Flogo app",
		Mode:     contracts.ModeReview,
	}

	plan := NewPlanner(fakeModelClient{
		provider: "fake",
		text:     "definitely not json",
		model:    "planner-model",
	}).PlanTurn(context.Background(), snapshot, "repair and verify the app")
	if plan.Planner != "deterministic-fallback" {
		t.Fatalf("expected fallback planner, got %+v", plan)
	}
	if len(plan.Notes) == 0 || !strings.Contains(plan.Notes[0], "planner output was invalid") {
		t.Fatalf("expected planner failure note, got %+v", plan.Notes)
	}
	if len(plan.Steps) == 0 || plan.Steps[0].Type != contracts.TurnStepInspectWorkspace {
		t.Fatalf("expected deterministic fallback steps, got %+v", plan.Steps)
	}
}

func TestPlannerUsesValidatedModelPlan(t *testing.T) {
	repoPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(repoPath, "flogo.json"), []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	snapshot := &contracts.SessionSnapshot{
		RepoPath: repoPath,
		Goal:     "inspect a Flogo app",
		Mode:     contracts.ModeReview,
	}

	plan := NewPlanner(fakeModelClient{
		provider: "fake",
		model:    "planner-model",
		text:     `{"goalSummary":"Show the current session status","requiresCreation":false,"steps":[{"type":"show_status","reason":"the user asked for status"}]}`,
	}).PlanTurn(context.Background(), snapshot, "what is the status")
	if plan.Planner != "fake/planner-model" {
		t.Fatalf("expected model planner, got %+v", plan)
	}
	if len(plan.Steps) != 1 || plan.Steps[0].Type != contracts.TurnStepShowStatus {
		t.Fatalf("unexpected planned steps: %+v", plan.Steps)
	}
}

func TestPlannerUsesInspectionStepsForLocalTestingQuestion(t *testing.T) {
	repoPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(repoPath, "flogo.json"), []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	snapshot := &contracts.SessionSnapshot{
		RepoPath: repoPath,
		Goal:     "help with local testing",
		Mode:     contracts.ModeReview,
	}

	plan := NewPlanner(fakeModelClient{
		provider: "fake",
		model:    "planner-model",
		text:     `{"goalSummary":"wrong","requiresCreation":false,"steps":[{"type":"repair_and_verify","reason":"bad plan"}]}`,
	}).PlanTurn(context.Background(), snapshot, "How do I test this locally?")
	if plan.Planner != "deterministic" {
		t.Fatalf("expected deterministic local-testing plan, got %+v", plan)
	}
	if len(plan.Steps) != 4 {
		t.Fatalf("expected inspection-oriented steps, got %+v", plan.Steps)
	}
	if plan.Steps[0].Type != contracts.TurnStepInspectDescriptor ||
		plan.Steps[1].Type != contracts.TurnStepInspectRuntimeConfig ||
		plan.Steps[2].Type != contracts.TurnStepInspectBuildArtifacts ||
		plan.Steps[3].Type != contracts.TurnStepPlanLocalTesting {
		t.Fatalf("unexpected local-testing steps: %+v", plan.Steps)
	}
}

type fakeModelClient struct {
	provider string
	model    string
	text     string
	err      error
}

func (f fakeModelClient) GenerateText(_ context.Context, _ model.TextRequest) (model.TextResponse, error) {
	if f.err != nil {
		return model.TextResponse{}, f.err
	}
	return model.TextResponse{
		Text:  f.text,
		Model: f.model,
	}, nil
}

func (f fakeModelClient) GenerateMultimodalText(ctx context.Context, _ model.MultimodalTextRequest) (model.TextResponse, error) {
	return f.GenerateText(ctx, model.TextRequest{})
}

func (f fakeModelClient) ProviderName() string {
	return f.provider
}
