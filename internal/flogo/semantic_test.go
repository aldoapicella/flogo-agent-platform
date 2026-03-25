package flogo

import (
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestValidateSemanticsDetectsFlowURIAndMappingIssues(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports":     []any{},
			"properties":  []any{},
			"channels":    []any{},
			"triggers": []any{
				map[string]any{
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{"flowURI": "main"},
							"input":    map[string]any{"message": "$flow.body"},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{"id": "flow:main"},
			},
			"actions": []any{},
		},
	}

	issues := ValidateSemantics(doc)
	if len(issues) != 2 {
		t.Fatalf("expected 2 issues, got %d", len(issues))
	}
	if issues[0].RuleID == issues[1].RuleID {
		t.Fatalf("expected distinct rule ids, got %+v", issues)
	}
}

func TestBuildSafePatchPlanRepairsKnownIssues(t *testing.T) {
	doc := &Document{
		Path:     "flogo.json",
		Original: []byte("{\"triggers\":[{\"handlers\":[{\"settings\":{\"flowURI\":\"main\"},\"input\":{\"message\":\"$flow.body\"}}]}],\"resources\":[{\"id\":\"flow:main\"}]}"),
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports":     []any{},
			"properties":  []any{},
			"channels":    []any{},
			"triggers": []any{
				map[string]any{
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{"flowURI": "main"},
							"input":    map[string]any{"message": "$flow.body"},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{"id": "flow:main"},
			},
			"actions": []any{},
		},
	}

	plan, notes, err := BuildSafePatchPlan(doc, []contracts.SourceCitation{{SourceID: "research-report"}})
	if err != nil {
		t.Fatalf("BuildSafePatchPlan returned error: %v", err)
	}
	if plan == nil {
		t.Fatal("expected patch plan")
	}
	if len(notes) != 2 {
		t.Fatalf("expected 2 notes, got %d", len(notes))
	}
	if !strings.Contains(plan.UnifiedDiff, "res://flow:main") {
		t.Fatalf("expected flowURI repair in diff, got %s", plan.UnifiedDiff)
	}
	if !strings.Contains(plan.UnifiedDiff, "=$flow.body") {
		t.Fatalf("expected mapping repair in diff, got %s", plan.UnifiedDiff)
	}
}
