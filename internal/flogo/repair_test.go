package flogo

import (
	"strings"
	"testing"
)

func TestBuildSafePatchPlanAddsCanonicalImports(t *testing.T) {
	doc := &Document{
		Path:     "flogo.json",
		Original: []byte(`{"name":"demo","type":"flogo:app","version":"1.0.0","description":"demo","imports":[],"properties":[],"channels":[],"actions":[],"triggers":[{"id":"t1","ref":"#rest","settings":{},"handlers":[{"settings":{},"action":{"ref":"#flow","settings":{"flowURI":"res://flow:main"}}}]}],"resources":[{"id":"flow:main","data":{"metadata":{"input":[],"output":[]}}}]}`),
		Raw: map[string]any{
			"name":        "demo",
			"type":        "flogo:app",
			"version":     "1.0.0",
			"description": "demo",
			"imports":     []any{},
			"properties":  []any{},
			"channels":    []any{},
			"actions":     []any{},
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#rest",
					"settings": map[string]any{},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{},
							"action": map[string]any{
								"ref":      "#flow",
								"settings": map[string]any{"flowURI": "res://flow:main"},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id":   "flow:main",
					"data": map[string]any{"metadata": map[string]any{"input": []any{}, "output": []any{}}},
				},
			},
		},
	}

	plan, notes, err := BuildSafePatchPlan(doc, nil)
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatal("expected patch plan")
	}
	if !strings.Contains(plan.UnifiedDiff, "github.com/project-flogo/flow") || !strings.Contains(plan.UnifiedDiff, "github.com/project-flogo/contrib/trigger/rest") {
		t.Fatalf("expected canonical imports in diff, got %s", plan.UnifiedDiff)
	}
	if len(notes) == 0 {
		t.Fatal("expected repair notes")
	}
}

func TestBuildSafePatchPlanRenamesFlowInputMapping(t *testing.T) {
	doc := &Document{
		Path:     "flogo.json",
		Original: []byte(`{"name":"demo","type":"flogo:app","version":"1.0.0","description":"demo","imports":["github.com/project-flogo/flow","github.com/project-flogo/contrib/trigger/rest"],"properties":[],"channels":[],"actions":[],"triggers":[{"id":"t1","ref":"#rest","settings":{},"handlers":[{"settings":{},"action":{"ref":"#flow","settings":{"flowURI":"res://flow:main"},"input":{"message":"=$.pathParams.val"}}}]}],"resources":[{"id":"flow:main","data":{"metadata":{"input":[{"name":"name","type":"string"}]}}}]}`),
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
			"triggers": []any{
				map[string]any{
					"id":       "t1",
					"ref":      "#rest",
					"settings": map[string]any{},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{},
							"action": map[string]any{
								"ref": "#flow",
								"settings": map[string]any{
									"flowURI": "res://flow:main",
								},
								"input": map[string]any{
									"message": "=$.pathParams.val",
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
								map[string]any{"name": "name", "type": "string"},
							},
						},
					},
				},
			},
		},
	}

	plan, _, err := BuildSafePatchPlan(doc, nil)
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatal("expected patch plan")
	}
	if !strings.Contains(plan.UnifiedDiff, `"name": "=$.pathParams.val"`) {
		t.Fatalf("expected renamed input mapping in diff, got %s", plan.UnifiedDiff)
	}
}

func TestBuildSafePatchPlanAddsExplicitImportsAndTaskIDsAndOutputRename(t *testing.T) {
	doc := &Document{
		Path:     "flogo.json",
		Original: []byte(`{"name":"demo","type":"flogo:app","version":"1.0.0","description":"demo","imports":["github.com/project-flogo/flow","github.com/project-flogo/contrib/trigger/rest"],"properties":[],"channels":[],"actions":[],"triggers":[{"id":"t1","ref":"#rest","handlers":[{"action":{"ref":"#flow","settings":{"flowURI":"res://flow:main"},"output":{"reply":"=$flow.message"}}}]}],"resources":[{"id":"flow:main","data":{"metadata":{"output":[{"name":"message","type":"string"}]},"tasks":[{"name":"Log Something","activity":{"ref":"github.com/project-flogo/contrib/activity/log"}}],"links":[]}}]}`),
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
			"triggers": []any{
				map[string]any{
					"id":  "t1",
					"ref": "#rest",
					"handlers": []any{
						map[string]any{
							"action": map[string]any{
								"ref": "#flow",
								"settings": map[string]any{
									"flowURI": "res://flow:main",
								},
								"output": map[string]any{
									"reply": "=$flow.message",
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
							"output": []any{
								map[string]any{"name": "message", "type": "string"},
							},
						},
						"tasks": []any{
							map[string]any{
								"name": "Log Something",
								"activity": map[string]any{
									"ref": "github.com/project-flogo/contrib/activity/log",
								},
							},
						},
						"links": []any{},
					},
				},
			},
		},
	}

	plan, notes, err := BuildSafePatchPlan(doc, nil)
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatal("expected patch plan")
	}
	for _, expected := range []string{
		`"github.com/project-flogo/contrib/activity/log"`,
		`"id": "log_something"`,
		`"message": "=$flow.message"`,
	} {
		if !strings.Contains(plan.UnifiedDiff, expected) {
			t.Fatalf("expected %s in diff, got %s", expected, plan.UnifiedDiff)
		}
	}
	if len(notes) < 3 {
		t.Fatalf("expected multiple repair notes, got %+v", notes)
	}
}
