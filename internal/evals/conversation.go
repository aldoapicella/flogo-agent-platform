package evals

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

type ConversationTurn struct {
	UserMessage      string                     `json:"userMessage"`
	AssistantMessage string                     `json:"assistantMessage"`
	Status           contracts.SessionStatus    `json:"status"`
	TurnKind         string                     `json:"turnKind,omitempty"`
	Planner          string                     `json:"planner,omitempty"`
	PendingApproval  bool                       `json:"pendingApproval"`
	Outcome          contracts.RunOutcome       `json:"outcome,omitempty"`
	StepResults      []contracts.TurnStepResult `json:"stepResults,omitempty"`
}

type ConversationEvalInput struct {
	Scenario   string                  `json:"scenario"`
	SessionID  string                  `json:"sessionId,omitempty"`
	Transcript []contracts.ChatMessage `json:"transcript"`
	Turns      []ConversationTurn      `json:"turns"`
}

type ConversationRubricScore struct {
	Score  int    `json:"score"`
	Reason string `json:"reason"`
}

type ConversationEvalResult struct {
	DirectAnswerQuality       ConversationRubricScore `json:"direct_answer_quality"`
	RepairGuidanceQuality     ConversationRubricScore `json:"repair_guidance_quality"`
	DiffExplanationQuality    ConversationRubricScore `json:"diff_explanation_quality"`
	ApprovalCompletionQuality ConversationRubricScore `json:"approval_completion_quality"`
	OverallCoherence          ConversationRubricScore `json:"overall_coherence"`
	TotalScore                int                     `json:"total_score"`
	Passed                    bool                    `json:"passed"`
	Summary                   string                  `json:"summary"`
	Model                     string                  `json:"model,omitempty"`
}

func EvaluateConversation(ctx context.Context, client model.Client, evalModel string, input ConversationEvalInput) (*ConversationEvalResult, error) {
	if client == nil {
		return nil, fmt.Errorf("evaluation model client is required")
	}

	payload, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		return nil, err
	}

	response, err := client.GenerateText(ctx, model.TextRequest{
		Model: evalModel,
		SystemPrompt: strings.TrimSpace(`You are grading a conversational coding agent for TIBCO Flogo.
Return only valid JSON with no markdown fences.
Score each rubric dimension from 0 to 2.
Rubric:
- direct_answer_quality: the "what are you" reply is direct, accurate, and avoids unnecessary repo work
- repair_guidance_quality: the repair turn explains the issue, the proposal, and the approval requirement clearly
- diff_explanation_quality: the diff turn explains what changed and preserves the review state
- approval_completion_quality: the approval completion explains that work was applied and verified
- overall_coherence: the conversation is consistent, grounded, and useful across turns
JSON shape:
{
  "direct_answer_quality":{"score":0,"reason":"..."},
  "repair_guidance_quality":{"score":0,"reason":"..."},
  "diff_explanation_quality":{"score":0,"reason":"..."},
  "approval_completion_quality":{"score":0,"reason":"..."},
  "overall_coherence":{"score":0,"reason":"..."},
  "summary":"..."
}`),
		UserPrompt:      string(payload),
		MaxOutputTokens: 1200,
	})
	if err != nil {
		return nil, err
	}

	result, err := parseConversationEvalResult(response.Text)
	if err != nil {
		return nil, err
	}
	result.Model = fmt.Sprintf("%s/%s", client.ProviderName(), response.Model)
	result.TotalScore = result.DirectAnswerQuality.Score +
		result.RepairGuidanceQuality.Score +
		result.DiffExplanationQuality.Score +
		result.ApprovalCompletionQuality.Score +
		result.OverallCoherence.Score
	result.Passed = result.TotalScore >= 7 &&
		result.DirectAnswerQuality.Score >= 1 &&
		result.ApprovalCompletionQuality.Score >= 1
	return result, nil
}

func parseConversationEvalResult(text string) (*ConversationEvalResult, error) {
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
			return nil, fmt.Errorf("conversation evaluation did not return valid JSON")
		}
		trimmed = strings.TrimSpace(trimmed[start : end+1])
	}
	var result ConversationEvalResult
	if err := json.Unmarshal([]byte(trimmed), &result); err != nil {
		return nil, err
	}
	for name, score := range map[string]ConversationRubricScore{
		"direct_answer_quality":       result.DirectAnswerQuality,
		"repair_guidance_quality":     result.RepairGuidanceQuality,
		"diff_explanation_quality":    result.DiffExplanationQuality,
		"approval_completion_quality": result.ApprovalCompletionQuality,
		"overall_coherence":           result.OverallCoherence,
	} {
		if score.Score < 0 || score.Score > 2 {
			return nil, fmt.Errorf("%s score must be between 0 and 2", name)
		}
	}
	return &result, nil
}
