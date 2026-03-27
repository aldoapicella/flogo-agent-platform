package evals

import (
	"context"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func TestEvaluateConversation(t *testing.T) {
	client := fakeEvalModel{
		text: `{
			"direct_answer_quality":{"score":2,"reason":"direct"},
			"repair_guidance_quality":{"score":1,"reason":"clear"},
			"diff_explanation_quality":{"score":1,"reason":"clear"},
			"approval_completion_quality":{"score":2,"reason":"clear"},
			"overall_coherence":{"score":1,"reason":"coherent"},
			"summary":"passed"
		}`,
		model: "gpt-5.2",
	}

	result, err := EvaluateConversation(context.Background(), client, "", ConversationEvalInput{
		Scenario: "repair flow",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatalf("expected rubric result to pass, got %+v", result)
	}
	if result.TotalScore != 7 {
		t.Fatalf("expected total score 7, got %d", result.TotalScore)
	}
	if result.Model != "fake/gpt-5.2" {
		t.Fatalf("expected annotated model name, got %q", result.Model)
	}
}

func TestEvaluateConversationRejectsOutOfRangeScores(t *testing.T) {
	client := fakeEvalModel{
		text: `{
			"direct_answer_quality":{"score":3,"reason":"bad"},
			"repair_guidance_quality":{"score":1,"reason":"clear"},
			"diff_explanation_quality":{"score":1,"reason":"clear"},
			"approval_completion_quality":{"score":2,"reason":"clear"},
			"overall_coherence":{"score":1,"reason":"coherent"},
			"summary":"failed"
		}`,
		model: "gpt-5.2",
	}
	if _, err := EvaluateConversation(context.Background(), client, "", ConversationEvalInput{}); err == nil {
		t.Fatal("expected out-of-range score error")
	}
}

type fakeEvalModel struct {
	text  string
	model string
}

func (f fakeEvalModel) GenerateText(context.Context, model.TextRequest) (model.TextResponse, error) {
	return model.TextResponse{Text: f.text, Model: f.model}, nil
}

func (f fakeEvalModel) GenerateMultimodalText(context.Context, model.MultimodalTextRequest) (model.TextResponse, error) {
	return model.TextResponse{Text: f.text, Model: f.model}, nil
}

func (f fakeEvalModel) ProviderName() string {
	return "fake"
}
