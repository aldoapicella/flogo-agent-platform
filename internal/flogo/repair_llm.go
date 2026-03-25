package flogo

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func BuildModelPatchPlan(ctx context.Context, doc *Document, validation contracts.ValidationResult, citations []contracts.SourceCitation, client model.Client) (*contracts.PatchPlan, []string, error) {
	if client == nil {
		return nil, nil, nil
	}

	systemPrompt := strings.TrimSpace(`You repair TIBCO Flogo application descriptors.
Return only a valid flogo.json object as raw JSON with no markdown fences, no comments, and no explanatory text.
Keep the diff as small as possible.
Do not invent unsupported keys or imports.
Respect current Flogo schema, flowURI resource references, mapping syntax, and flow input/output declarations.`)

	userPrompt := buildModelRepairPrompt(doc, validation, citations)
	response, err := client.GenerateText(ctx, model.TextRequest{
		SystemPrompt:    systemPrompt,
		UserPrompt:      userPrompt,
		MaxOutputTokens: 8000,
	})
	if err != nil {
		return nil, nil, err
	}

	repairedJSON, err := extractJSONObject(response.Text)
	if err != nil {
		return nil, nil, err
	}

	candidate, err := ParseDocumentBytes(doc.Path, doc.Original, []byte(repairedJSON))
	if err != nil {
		return nil, nil, fmt.Errorf("parse llm repair candidate: %w", err)
	}

	schemaIssues, err := ValidateSchema(candidate)
	if err != nil {
		return nil, nil, err
	}
	semanticIssues := ValidateSemantics(candidate)

	originalBlocking := blockingIssueCount(validation.SchemaIssues) + blockingIssueCount(validation.SemanticIssues)
	candidateBlocking := blockingIssueCount(schemaIssues) + blockingIssueCount(semanticIssues)
	originalTotal := len(validation.SchemaIssues) + len(validation.SemanticIssues)
	candidateTotal := len(schemaIssues) + len(semanticIssues)

	if candidateBlocking > originalBlocking || (candidateBlocking == originalBlocking && candidateTotal >= originalTotal) {
		return nil, []string{fmt.Sprintf("model candidate from %s did not improve validation", response.Model)}, nil
	}

	updated, err := candidate.PrettyJSON()
	if err != nil {
		return nil, nil, fmt.Errorf("marshal llm repaired document: %w", err)
	}
	diff, err := unifiedDiff(doc.Original, updated)
	if err != nil {
		return nil, nil, err
	}

	doc.Raw = candidate.Raw
	notes := []string{fmt.Sprintf("model-generated repair candidate via %s/%s", client.ProviderName(), response.Model)}
	if response.RequestID != "" {
		notes = append(notes, "request id "+response.RequestID)
	}

	return &contracts.PatchPlan{
		TargetFiles: []string{doc.Path},
		UnifiedDiff: diff,
		Rationale:   strings.Join(notes, "; "),
		Citations:   citations,
		Safe:        candidateBlocking == 0,
	}, notes, nil
}

func buildModelRepairPrompt(doc *Document, validation contracts.ValidationResult, citations []contracts.SourceCitation) string {
	var builder strings.Builder
	builder.WriteString("Current flogo.json:\n")
	builder.Write(doc.Original)
	builder.WriteString("\n\nValidation issues:\n")
	for _, issue := range validation.SchemaIssues {
		builder.WriteString("- [schema] " + issue.RuleID + " " + issue.JSONPath + ": " + issue.Message + "\n")
	}
	for _, issue := range validation.SemanticIssues {
		builder.WriteString("- [semantic] " + issue.RuleID + " " + issue.JSONPath + ": " + issue.Message + "\n")
	}

	if len(citations) > 0 {
		builder.WriteString("\nRelevant official references:\n")
		for idx, citation := range citations {
			if idx >= 6 {
				break
			}
			builder.WriteString("- " + citation.Title)
			if citation.Locator != "" {
				builder.WriteString(" (" + citation.Locator + ")")
			}
			if excerpt := strings.TrimSpace(citation.Excerpt); excerpt != "" {
				builder.WriteString(": " + excerpt)
			}
			builder.WriteByte('\n')
		}
	}

	builder.WriteString("\nReturn the full repaired flogo.json as raw JSON only.")
	return builder.String()
}

func blockingIssueCount(items []contracts.ValidationIssue) int {
	total := 0
	for _, item := range items {
		if strings.EqualFold(item.Severity, "warning") {
			continue
		}
		total++
	}
	return total
}

func extractJSONObject(text string) (string, error) {
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
		trimmed = strings.TrimPrefix(trimmed, "```")
		trimmed = strings.TrimSuffix(trimmed, "```")
		trimmed = strings.TrimSpace(trimmed)
	}

	if json.Valid([]byte(trimmed)) {
		return trimmed, nil
	}

	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start == -1 || end == -1 || end <= start {
		return "", fmt.Errorf("model response did not contain a JSON object")
	}
	candidate := strings.TrimSpace(trimmed[start : end+1])
	if !json.Valid([]byte(candidate)) {
		return "", fmt.Errorf("model response did not contain valid JSON")
	}
	return candidate, nil
}
