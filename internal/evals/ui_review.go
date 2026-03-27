package evals

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

type UIReviewCapture struct {
	Name            string `json:"name"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Path            string `json:"path"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	SideMode        string `json:"sideMode,omitempty"`
	SessionStatus   string `json:"sessionStatus,omitempty"`
	SessionID       string `json:"sessionId,omitempty"`
	PendingApproval bool   `json:"pendingApproval,omitempty"`
	ScreenText      string `json:"screenText,omitempty"`
}

type UIReviewInput struct {
	Scenario string            `json:"scenario"`
	Captures []UIReviewCapture `json:"captures"`
}

type UIReviewScore struct {
	Score  int    `json:"score"`
	Reason string `json:"reason"`
}

type UIReviewFinding struct {
	Severity string   `json:"severity"`
	Title    string   `json:"title"`
	Details  string   `json:"details"`
	Captures []string `json:"captures,omitempty"`
}

type UIReviewTask struct {
	Priority        string   `json:"priority"`
	Title           string   `json:"title"`
	Rationale       string   `json:"rationale"`
	SuggestedChange string   `json:"suggested_change"`
	Captures        []string `json:"captures,omitempty"`
}

type UIReviewReport struct {
	Readability      UIReviewScore   `json:"readability"`
	VisualHierarchy  UIReviewScore   `json:"visual_hierarchy"`
	ApprovalClarity  UIReviewScore   `json:"approval_clarity"`
	DiffClarity      UIReviewScore   `json:"diff_clarity"`
	OverallCoherence UIReviewScore   `json:"overall_coherence"`
	Findings         []UIReviewFinding `json:"findings"`
	Tasks            []UIReviewTask  `json:"tasks"`
	TotalScore       int             `json:"total_score"`
	Summary          string          `json:"summary"`
	Model            string          `json:"model,omitempty"`
}

func EvaluateUIReview(ctx context.Context, client model.Client, reviewModel string, input UIReviewInput, images []model.ImageInput) (*UIReviewReport, error) {
	if client == nil {
		return nil, fmt.Errorf("ui review model client is required")
	}
	if len(input.Captures) == 0 {
		return nil, fmt.Errorf("at least one UI capture is required")
	}
	if len(images) != len(input.Captures) {
		return nil, fmt.Errorf("capture/image count mismatch")
	}

	payload, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		return nil, err
	}

	reviewOnce := func(systemPrompt string, maxTokens int) (model.TextResponse, *UIReviewReport, error) {
		response, err := client.GenerateMultimodalText(ctx, model.MultimodalTextRequest{
			Model: reviewModel,
			SystemPrompt: systemPrompt,
			UserPrompt: fmt.Sprintf("Review this scripted Flogo terminal UI scenario.\nScenario metadata:\n%s", string(payload)),
			Images:          images,
			MaxOutputTokens: maxTokens,
		})
		if err != nil {
			return model.TextResponse{}, nil, err
		}
		report, err := parseUIReviewReport(response.Text)
		if err != nil {
			return response, nil, err
		}
		return response, report, nil
	}

	systemPrompt := strings.TrimSpace(`You are reviewing a terminal UI for a TIBCO Flogo coding agent.
Return only valid JSON with no markdown fences.
Score each rubric dimension from 0 to 2.
Judge only what is visible in the screenshots and metadata. Do not invent hidden states.
Focus on terminal-UI quality, not product strategy.
Keep the response compact.
Use at most 4 findings and at most 4 tasks.
Keep each reason, details field, and suggested change to one short sentence.
Rubric:
- readability: transcript, status, and side-panel text are easy to scan
- visual_hierarchy: the layout makes primary vs secondary information obvious
- approval_clarity: pending approval state and next action are clear
- diff_clarity: diff/review presentation highlights semantic changes rather than noise
- overall_coherence: the views feel consistent and usable across the flow
Required JSON shape:
{
  "readability":{"score":0,"reason":"..."},
  "visual_hierarchy":{"score":0,"reason":"..."},
  "approval_clarity":{"score":0,"reason":"..."},
  "diff_clarity":{"score":0,"reason":"..."},
  "overall_coherence":{"score":0,"reason":"..."},
  "findings":[{"severity":"high|medium|low","title":"...","details":"...","captures":["capture-name"]}],
  "tasks":[{"priority":"high|medium|low","title":"...","rationale":"...","suggested_change":"...","captures":["capture-name"]}],
  "summary":"..."
}`)

	response, report, err := reviewOnce(systemPrompt, 1400)
	if err != nil {
		compactPrompt := strings.TrimSpace(`Review this terminal UI and return only strict compact JSON.
Do not use markdown fences.
Use at most 3 findings and at most 3 tasks.
Keep every reason, details field, and suggested change under 18 words.
Use this exact JSON shape:
{
  "readability":{"score":0,"reason":"..."},
  "visual_hierarchy":{"score":0,"reason":"..."},
  "approval_clarity":{"score":0,"reason":"..."},
  "diff_clarity":{"score":0,"reason":"..."},
  "overall_coherence":{"score":0,"reason":"..."},
  "findings":[{"severity":"high|medium|low","title":"...","details":"...","captures":["capture-name"]}],
  "tasks":[{"priority":"high|medium|low","title":"...","rationale":"...","suggested_change":"...","captures":["capture-name"]}],
  "summary":"..."
}`)
		response, report, retryErr := reviewOnce(compactPrompt, 900)
		if retryErr != nil {
			return nil, fmt.Errorf("ui review parse failed after retry: %w (response=%q)", retryErr, truncateForError(response.Text, 400))
		}
		report.Model = fmt.Sprintf("%s/%s", client.ProviderName(), response.Model)
		report.TotalScore = report.Readability.Score +
			report.VisualHierarchy.Score +
			report.ApprovalClarity.Score +
			report.DiffClarity.Score +
			report.OverallCoherence.Score
		return report, nil
	}
	report.Model = fmt.Sprintf("%s/%s", client.ProviderName(), response.Model)
	report.TotalScore = report.Readability.Score +
		report.VisualHierarchy.Score +
		report.ApprovalClarity.Score +
		report.DiffClarity.Score +
		report.OverallCoherence.Score
	return report, nil
}

func truncateForError(text string, limit int) string {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) <= limit {
		return trimmed
	}
	return trimmed[:limit] + "..."
}

func ParseUIReviewReport(text string) (*UIReviewReport, error) {
	return parseUIReviewReport(text)
}

func parseUIReviewReport(text string) (*UIReviewReport, error) {
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
			return nil, fmt.Errorf("ui review did not return valid JSON")
		}
		trimmed = strings.TrimSpace(trimmed[start : end+1])
	}

	var report UIReviewReport
	if err := json.Unmarshal([]byte(trimmed), &report); err != nil {
		return nil, err
	}
	for name, score := range map[string]UIReviewScore{
		"readability":       report.Readability,
		"visual_hierarchy":  report.VisualHierarchy,
		"approval_clarity":  report.ApprovalClarity,
		"diff_clarity":      report.DiffClarity,
		"overall_coherence": report.OverallCoherence,
	} {
		if score.Score < 0 || score.Score > 2 {
			return nil, fmt.Errorf("%s score must be between 0 and 2", name)
		}
	}
	return &report, nil
}

func FormatUIReviewMarkdown(input UIReviewInput, report *UIReviewReport) string {
	var builder strings.Builder
	builder.WriteString("# UI Review\n\n")
	builder.WriteString("## Summary\n\n")
	if report != nil {
		builder.WriteString(report.Summary)
		builder.WriteString("\n\n")
		builder.WriteString(fmt.Sprintf("- Total score: %d/10\n", report.TotalScore))
		builder.WriteString(fmt.Sprintf("- Readability: %d/2\n", report.Readability.Score))
		builder.WriteString(fmt.Sprintf("- Visual hierarchy: %d/2\n", report.VisualHierarchy.Score))
		builder.WriteString(fmt.Sprintf("- Approval clarity: %d/2\n", report.ApprovalClarity.Score))
		builder.WriteString(fmt.Sprintf("- Diff clarity: %d/2\n", report.DiffClarity.Score))
		builder.WriteString(fmt.Sprintf("- Overall coherence: %d/2\n", report.OverallCoherence.Score))
		if report.Model != "" {
			builder.WriteString(fmt.Sprintf("- Reviewer model: %s\n", report.Model))
		}
	}

	builder.WriteString("\n## Captures\n\n")
	for _, capture := range input.Captures {
		builder.WriteString(fmt.Sprintf("- `%s`: %s (%dx%d)\n", capture.Name, capture.Title, capture.Width, capture.Height))
	}

	if report != nil && len(report.Findings) > 0 {
		builder.WriteString("\n## Findings\n\n")
		for _, finding := range report.Findings {
			builder.WriteString(fmt.Sprintf("- [%s] %s: %s", strings.ToUpper(finding.Severity), finding.Title, finding.Details))
			if len(finding.Captures) > 0 {
				builder.WriteString(fmt.Sprintf(" (captures: %s)", strings.Join(finding.Captures, ", ")))
			}
			builder.WriteByte('\n')
		}
	}

	if report != nil && len(report.Tasks) > 0 {
		builder.WriteString("\n## Change Tasks\n\n")
		for _, task := range report.Tasks {
			builder.WriteString(fmt.Sprintf("- [%s] %s: %s", strings.ToUpper(task.Priority), task.Title, task.SuggestedChange))
			if task.Rationale != "" {
				builder.WriteString(" Rationale: " + task.Rationale)
			}
			if len(task.Captures) > 0 {
				builder.WriteString(fmt.Sprintf(" (captures: %s)", strings.Join(task.Captures, ", ")))
			}
			builder.WriteByte('\n')
		}
	}
	return builder.String()
}

func FormatUIReviewTasksMarkdown(report *UIReviewReport) string {
	var builder strings.Builder
	builder.WriteString("# UI Review Tasks\n\n")
	if report == nil || len(report.Tasks) == 0 {
		builder.WriteString("No UI change tasks were generated.\n")
		return builder.String()
	}
	for _, task := range report.Tasks {
		builder.WriteString(fmt.Sprintf("- [%s] %s\n", strings.ToUpper(task.Priority), task.Title))
		if task.SuggestedChange != "" {
			builder.WriteString(fmt.Sprintf("  - Change: %s\n", task.SuggestedChange))
		}
		if task.Rationale != "" {
			builder.WriteString(fmt.Sprintf("  - Rationale: %s\n", task.Rationale))
		}
		if len(task.Captures) > 0 {
			builder.WriteString(fmt.Sprintf("  - Captures: %s\n", strings.Join(task.Captures, ", ")))
		}
	}
	return builder.String()
}
