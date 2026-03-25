package agents

import (
	"context"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func TestRepairerUsesModelFirstWhenAvailable(t *testing.T) {
	original := []byte(`{
  "name": "demo",
  "type": "flogo:app",
  "version": "1.0.0",
  "appModel": "1.1.0",
  "description": "demo",
  "imports": [
    "github.com/project-flogo/flow",
    "github.com/project-flogo/contrib/activity/log"
  ],
  "properties": [],
  "channels": [],
  "triggers": [],
  "actions": [],
  "resources": [
    {
      "id": "flow:main",
      "data": {
        "metadata": {
          "input": [],
          "output": []
        },
        "tasks": [
          {
            "id": "log_message",
            "activity": {}
          }
        ],
        "links": []
      }
    }
  ]
}`)
	repaired := `{"name":"demo","type":"flogo:app","version":"1.0.0","appModel":"1.1.0","description":"demo","imports":["github.com/project-flogo/flow","github.com/project-flogo/contrib/activity/log"],"properties":[],"channels":[],"triggers":[],"actions":[],"resources":[{"id":"flow:main","data":{"metadata":{"input":[],"output":[]},"tasks":[{"id":"log_message","activity":{"ref":"#log","input":{"message":"demo"}}}],"links":[]}}]}`

	doc, err := flogo.ParseDocumentBytes("flogo.json", original, original)
	if err != nil {
		t.Fatal(err)
	}
	validation := contracts.ValidationResult{
		SemanticIssues: flogo.ValidateSemantics(doc),
	}

	repairer := NewRepairer(repairerFakeModel{text: repaired, model: "gpt-test"})
	plan, notes, err := repairer.BuildPatchPlan(context.Background(), doc, validation, nil)
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatalf("expected patch plan, got nil with notes %+v", notes)
	}
	if !strings.Contains(plan.Rationale, "model-generated repair candidate") {
		t.Fatalf("expected model-generated rationale, got %q", plan.Rationale)
	}
	if !strings.Contains(plan.UnifiedDiff, "\"ref\": \"#log\"") {
		t.Fatalf("expected model-generated diff, got %s", plan.UnifiedDiff)
	}
}

func TestRepairerFallsBackToDeterministicRepairWhenModelPatchIsUnsafe(t *testing.T) {
	original := []byte(`{
  "name": "demo",
  "type": "flogo:app",
  "version": "1.0.0",
  "appModel": "1.1.0",
  "description": "demo",
  "imports": [
    "github.com/project-flogo/contrib/trigger/rest",
    "github.com/project-flogo/flow"
  ],
  "properties": [],
  "channels": [],
  "triggers": [
    {
      "id": "receive_http_message",
      "ref": "#rest",
      "settings": {"port":"8888"},
      "handlers": [
        {
          "settings": {"method":"GET","path":"/test/:val"},
          "action": {
            "ref": "#flow",
            "settings": {"flowURI": "main"},
            "input": {"message": "$flow.body"}
          }
        }
      ]
    }
  ],
  "actions": [],
  "resources": [
    {
      "id": "flow:main",
      "data": {
        "metadata": {
          "input": [{"name": "message", "type": "string"}]
        },
        "tasks": [],
        "links": []
      }
    }
  ]
}`)
	modelCandidate := `{"name":"demo","type":"flogo:app","version":"1.0.0","appModel":"1.1.0","description":"demo","imports":["github.com/project-flogo/contrib/trigger/rest","github.com/project-flogo/flow"],"properties":[],"channels":[],"triggers":[{"id":"receive_http_message","ref":"#rest","settings":{"port":"8888"},"handlers":[{"settings":{"method":"GET","path":"/test/:val"},"action":{"ref":"#flow","settings":{"flowURI":"res://flow:main"},"input":{"message":"=$trigger.pathParams.val"}}}]}],"actions":[],"resources":[{"id":"flow:main","data":{"metadata":{"input":[{"name":"message","type":"string"}]},"tasks":[],"links":[]}}]}`

	doc, err := flogo.ParseDocumentBytes("flogo.json", original, original)
	if err != nil {
		t.Fatal(err)
	}
	validation := contracts.ValidationResult{
		SemanticIssues: flogo.ValidateSemantics(doc),
	}

	repairer := NewRepairer(repairerFakeModel{text: modelCandidate, model: "gpt-test"})
	plan, notes, err := repairer.BuildPatchPlan(context.Background(), doc, validation, nil)
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatalf("expected fallback patch plan, got nil with notes %+v", notes)
	}
	if !plan.Safe {
		t.Fatalf("expected deterministic fallback patch to be safe, got %+v", plan)
	}
	if !strings.Contains(plan.UnifiedDiff, "=$.pathParams.val") {
		t.Fatalf("expected deterministic handler input repair, got %s", plan.UnifiedDiff)
	}
	if strings.Contains(plan.UnifiedDiff, "=$trigger.pathParams.val") {
		t.Fatalf("expected unsafe model resolver to be rejected, got %s", plan.UnifiedDiff)
	}
	if len(notes) == 0 || !strings.Contains(strings.Join(notes, " "), "deterministic repair rules") {
		t.Fatalf("expected fallback note, got %+v", notes)
	}
}

type repairerFakeModel struct {
	text  string
	model string
	err   error
}

func (f repairerFakeModel) GenerateText(_ context.Context, _ model.TextRequest) (model.TextResponse, error) {
	if f.err != nil {
		return model.TextResponse{}, f.err
	}
	return model.TextResponse{Text: f.text, Model: f.model}, nil
}

func (f repairerFakeModel) ProviderName() string {
	return "fake"
}
