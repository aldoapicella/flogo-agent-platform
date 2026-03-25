package agentloop

import (
	"context"
	"fmt"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

type Responder struct {
	modelClient model.Client
}

func NewResponder(modelClient model.Client) *Responder {
	return &Responder{modelClient: modelClient}
}

func (r *Responder) ComposeTurnResponse(ctx context.Context, snapshot *contracts.SessionSnapshot) string {
	trace := renderTurnSummary(snapshot)
	if r == nil || r.modelClient == nil || snapshot == nil {
		return trace
	}

	response, err := r.modelClient.GenerateText(ctx, model.TextRequest{
		SystemPrompt: strings.TrimSpace(`You are a conversational Flogo coding agent in a terminal workflow.
Write the assistant reply for the user after a tool-augmented turn.
Be concrete, concise, and grounded in the execution results.
Do not invent tool outcomes, schema rules, build results, or approvals.
If approval is pending, say that clearly.
If sources are available, cite them by source title in plain text.
Do not use markdown fences.`),
		UserPrompt:      buildResponderPrompt(snapshot),
		MaxOutputTokens: 800,
	})
	if err != nil || strings.TrimSpace(response.Text) == "" {
		return trace
	}

	return strings.TrimSpace(response.Text) + "\n\n" + trace
}

func buildResponderPrompt(snapshot *contracts.SessionSnapshot) string {
	var builder strings.Builder
	builder.WriteString("Write the reply for the latest assistant turn.\n")
	if snapshot.LastTurnPlan != nil {
		builder.WriteString("Planned goal: " + snapshot.LastTurnPlan.GoalSummary + "\n")
		builder.WriteString("Planner: " + snapshot.LastTurnPlan.Planner + "\n")
	}
	if snapshot.LastTurnKind != "" {
		builder.WriteString("Turn kind: " + snapshot.LastTurnKind + "\n")
	}
	builder.WriteString("Session status: " + string(snapshot.Status) + "\n")

	if len(snapshot.LastStepResults) > 0 {
		builder.WriteString("Step results:\n")
		for _, result := range snapshot.LastStepResults {
			builder.WriteString(fmt.Sprintf("- [%s] %s: %s\n", result.Status, result.Type, result.Summary))
		}
	}

	if snapshot.LastReport != nil {
		builder.WriteString("Execution report:\n")
		builder.WriteString("- " + summarizeReport(snapshot.LastReport) + "\n")
		if snapshot.LastReport.PatchPlan != nil {
			builder.WriteString("- Patch rationale: " + snapshot.LastReport.PatchPlan.Rationale + "\n")
			builder.WriteString(fmt.Sprintf("- Patch safe: %t\n", snapshot.LastReport.PatchPlan.Safe))
		}
		for _, test := range snapshot.LastReport.Evidence.TestResults {
			builder.WriteString(fmt.Sprintf("- Test %s passed=%t skipped=%t\n", test.Name, test.Passed, test.Skipped))
		}
	}

	if snapshot.PendingApproval != nil {
		builder.WriteString("Pending approval: " + snapshot.PendingApproval.Summary + "\n")
	}

	citations := latestCitations(snapshot)
	if len(citations) > 0 {
		builder.WriteString("Relevant sources:\n")
		for idx, citation := range citations {
			if idx >= 4 {
				break
			}
			builder.WriteString("- " + citation.Title)
			if citation.Locator != "" {
				builder.WriteString(" (" + citation.Locator + ")")
			}
			builder.WriteByte('\n')
		}
	}

	builder.WriteString("Reply requirements:\n")
	builder.WriteString("- First explain what happened in this turn.\n")
	builder.WriteString("- Then explain the next action or approval requirement.\n")
	builder.WriteString("- Keep it under 140 words.\n")
	return builder.String()
}

func latestCitations(snapshot *contracts.SessionSnapshot) []contracts.SourceCitation {
	if snapshot == nil || snapshot.LastReport == nil {
		return nil
	}
	if len(snapshot.LastReport.Citations) > 0 {
		return snapshot.LastReport.Citations
	}
	if snapshot.LastReport.PatchPlan != nil && len(snapshot.LastReport.PatchPlan.Citations) > 0 {
		return snapshot.LastReport.PatchPlan.Citations
	}
	var citations []contracts.SourceCitation
	for _, issue := range snapshot.LastReport.Evidence.ValidationResult.SchemaIssues {
		citations = append(citations, issue.Citations...)
	}
	for _, issue := range snapshot.LastReport.Evidence.ValidationResult.SemanticIssues {
		citations = append(citations, issue.Citations...)
	}
	return citations
}
