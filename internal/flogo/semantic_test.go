package flogo

import (
	"path/filepath"
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
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"properties": []any{},
			"channels":   []any{},
			"actions":    []any{},
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#rest",
					"settings": map[string]any{"port": "8888"},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{"method": "GET", "path": "/test"},
							"action": map[string]any{
								"ref":      "#flow",
								"settings": map[string]any{"flowURI": "main"},
								"input":    map[string]any{"message": "$flow.body"},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id": "flow:main",
					"data": map[string]any{
						"metadata": map[string]any{
							"input": []any{
								map[string]any{"name": "message", "type": "string"},
							},
						},
					},
				},
			},
		},
	}

	issues := ValidateSemantics(doc)
	if len(issues) != 3 {
		t.Fatalf("expected 3 issues, got %d", len(issues))
	}
	if issues[0].RuleID == issues[1].RuleID {
		t.Fatalf("expected distinct rule ids, got %+v", issues)
	}
}

func TestBuildSafePatchPlanRepairsKnownIssues(t *testing.T) {
	doc := &Document{
		Path:     "flogo.json",
		Original: []byte("{\"name\":\"demo\",\"type\":\"flogo:app\",\"version\":\"1.0.0\",\"description\":\"demo\",\"imports\":[],\"properties\":[],\"channels\":[],\"actions\":[],\"triggers\":[{\"id\":\"t1\",\"ref\":\"#rest\",\"settings\":{\"port\":\"8888\"},\"handlers\":[{\"settings\":{\"method\":\"GET\",\"path\":\"/test\"},\"action\":{\"ref\":\"#flow\",\"settings\":{\"flowURI\":\"main\"},\"input\":{\"message\":\"$flow.body\"}}}]}],\"resources\":[{\"id\":\"flow:main\"}]}"),
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"properties": []any{},
			"channels":   []any{},
			"actions":    []any{},
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#rest",
					"settings": map[string]any{"port": "8888"},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{"method": "GET", "path": "/test"},
							"action": map[string]any{
								"ref":      "#flow",
								"settings": map[string]any{"flowURI": "main"},
								"input":    map[string]any{"message": "$flow.body"},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id": "flow:main",
					"data": map[string]any{
						"metadata": map[string]any{
							"input": []any{
								map[string]any{"name": "message", "type": "string"},
							},
						},
					},
				},
			},
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
	if !strings.Contains(plan.UnifiedDiff, "=$.content") {
		t.Fatalf("expected mapping repair in diff, got %s", plan.UnifiedDiff)
	}
}

func TestValidateSchemaAcceptsOfficialExamples(t *testing.T) {
	for _, fixture := range []string{
		filepath.Join("..", "..", "testdata", "benchmarks", "official-core", "flogo.json"),
		filepath.Join("..", "..", "testdata", "benchmarks", "official-flow", "flogo.json"),
	} {
		doc, err := LoadDocument(filepath.Dir(fixture))
		if err != nil {
			t.Fatalf("LoadDocument(%s) returned error: %v", fixture, err)
		}
		issues, err := ValidateSchema(doc)
		if err != nil {
			t.Fatalf("ValidateSchema(%s) returned error: %v", fixture, err)
		}
		if len(issues) != 0 {
			t.Fatalf("expected no schema issues for %s, got %+v", fixture, issues)
		}
	}
}

func TestValidateSemanticsDetectsUnresolvedRefsAndFlowIODrift(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"properties": []any{},
			"channels":   []any{},
			"actions":    []any{},
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#missing",
					"settings": map[string]any{},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{},
							"actions": []any{
								map[string]any{
									"ref": "#flow",
									"settings": map[string]any{
										"flowURI": "res://flow:main",
									},
									"input": map[string]any{
										"missing": "=$.pathParams.val",
									},
								},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id": "flow:main",
					"data": map[string]any{
						"metadata": map[string]any{
							"input": []any{
								map[string]any{"name": "expected", "type": "string"},
							},
						},
						"tasks": []any{
							map[string]any{
								"activity": map[string]any{
									"ref": "#missingActivity",
									"input": map[string]any{
										"message": "=$flow.unknown",
									},
								},
							},
						},
					},
				},
			},
		},
	}

	issues := ValidateSemantics(doc)
	if len(issues) < 4 {
		t.Fatalf("expected multiple issues, got %+v", issues)
	}

	ruleIDs := map[string]bool{}
	for _, issue := range issues {
		ruleIDs[issue.RuleID] = true
	}

	for _, expected := range []string{
		"imports.ref.unresolved",
		"flow.input.undefined",
		"flow.input.missing_mapping",
		"flow.expression.undefined",
	} {
		if !ruleIDs[expected] {
			t.Fatalf("expected rule %s in %+v", expected, issues)
		}
	}
}

func TestValidateSemanticsDetectsTaskAndLinkIssues(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports": []any{
				"github.com/project-flogo/flow",
				"github.com/project-flogo/contrib/trigger/rest",
			},
			"properties": []any{},
			"channels":   []any{},
			"actions":    []any{},
			"triggers":   []any{},
			"resources": []any{
				map[string]any{
					"id": "flow:main",
					"data": map[string]any{
						"metadata": map[string]any{},
						"tasks": []any{
							map[string]any{
								"name": "First",
							},
							map[string]any{
								"id":   "dup",
								"name": "Second",
								"activity": map[string]any{
									"ref": "#missing",
								},
							},
							map[string]any{
								"id":   "dup",
								"name": "Third",
								"activity": map[string]any{
									"ref": "#rest",
								},
							},
						},
						"links": []any{
							map[string]any{
								"from": "dup",
								"to":   "unknown",
							},
						},
					},
				},
			},
		},
	}

	issues := ValidateSemantics(doc)
	ruleIDs := map[string]bool{}
	for _, issue := range issues {
		ruleIDs[issue.RuleID] = true
	}
	for _, expected := range []string{
		"task.id.missing",
		"task.activity.missing",
		"task.id.duplicate",
		"task.activity.ref.unresolved",
		"link.to.unknown",
	} {
		if !ruleIDs[expected] {
			t.Fatalf("expected rule %s in %+v", expected, issues)
		}
	}
}

func TestValidateSemanticsDetectsInlineHandlerActionID(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"properties": []any{},
			"channels":   []any{},
			"actions":    []any{},
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#rest",
					"settings": map[string]any{"port": "8888"},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{"method": "GET", "path": "/test"},
							"action": map[string]any{
								"id":       "runFlow",
								"ref":      "#flow",
								"settings": map[string]any{"flowURI": "res://flow:main"},
								"input":    map[string]any{"message": "=$flow.body"},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id": "flow:main",
					"data": map[string]any{
						"metadata": map[string]any{
							"input": []any{
								map[string]any{"name": "message", "type": "string"},
							},
						},
						"tasks": []any{},
						"links": []any{},
					},
				},
			},
		},
	}

	issues := ValidateSemantics(doc)
	found := false
	for _, issue := range issues {
		if issue.RuleID == "handler.action.inline_id" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected inline handler action id issue, got %+v", issues)
	}
}

func TestValidateSemanticsDetectsInvalidHandlerActionInputScope(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"properties": []any{},
			"channels":   []any{},
			"actions":    []any{},
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#rest",
					"settings": map[string]any{"port": "8888"},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{"method": "GET", "path": "/test/:val"},
							"action": map[string]any{
								"ref":      "#flow",
								"settings": map[string]any{"flowURI": "res://flow:main"},
								"input":    map[string]any{"message": "=$flow.body"},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id": "flow:main",
					"data": map[string]any{
						"metadata": map[string]any{
							"input": []any{
								map[string]any{"name": "message", "type": "string"},
							},
						},
						"tasks": []any{},
						"links": []any{},
					},
				},
			},
		},
	}

	issues := ValidateSemantics(doc)
	found := false
	for _, issue := range issues {
		if issue.RuleID == "handler.action.input.invalid_scope" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected handler action input scope issue, got %+v", issues)
	}
}

func TestValidateSemanticsDetectsInvalidTriggerResolverInHandlerInput(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"properties": []any{},
			"channels":   []any{},
			"actions":    []any{},
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#rest",
					"settings": map[string]any{"port": "8888"},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{"method": "GET", "path": "/test/:val"},
							"action": map[string]any{
								"ref":      "#flow",
								"settings": map[string]any{"flowURI": "res://flow:main"},
								"input":    map[string]any{"message": "=$trigger.pathParams.val"},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id": "flow:main",
					"data": map[string]any{
						"metadata": map[string]any{
							"input": []any{
								map[string]any{"name": "message", "type": "string"},
							},
						},
						"tasks": []any{},
						"links": []any{},
					},
				},
			},
		},
	}

	issues := ValidateSemantics(doc)
	for _, issue := range issues {
		if issue.RuleID == "handler.action.input.invalid_scope" {
			return
		}
	}
	t.Fatalf("expected invalid trigger resolver issue, got %+v", issues)
}
