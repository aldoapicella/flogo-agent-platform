package flogo

import (
	"context"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

type fakeModelClient struct {
	text string
}

func (f fakeModelClient) GenerateText(ctx context.Context, req model.TextRequest) (model.TextResponse, error) {
	return model.TextResponse{
		Text:      f.text,
		Model:     "fake-model",
		RequestID: "resp_fake",
	}, nil
}

func (f fakeModelClient) GenerateMultimodalText(ctx context.Context, req model.MultimodalTextRequest) (model.TextResponse, error) {
	return model.TextResponse{
		Text:      f.text,
		Model:     "fake-model",
		RequestID: "resp_fake",
	}, nil
}

func (f fakeModelClient) ProviderName() string {
	return "fake"
}

func TestBuildModelPatchPlanUsesModelCandidate(t *testing.T) {
	original := `{
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
}`
	doc, err := ParseDocumentBytes("flogo.json", []byte(original), []byte(original))
	if err != nil {
		t.Fatal(err)
	}
	validation := contracts.ValidationResult{
		SemanticIssues: ValidateSemantics(doc),
	}
	if len(validation.SemanticIssues) == 0 {
		t.Fatal("expected semantic issues in original document")
	}

	modelJSON := `{"name":"demo","type":"flogo:app","version":"1.0.0","appModel":"1.1.0","description":"demo","imports":["github.com/project-flogo/contrib/trigger/rest","github.com/project-flogo/flow"],"properties":[],"channels":[],"triggers":[{"id":"receive_http_message","ref":"#rest","settings":{"port":"8888"},"handlers":[{"settings":{"method":"GET","path":"/test/:val"},"action":{"ref":"#flow","settings":{"flowURI":"res://flow:main"},"input":{"message":"=$.pathParams.val"}}}]}],"actions":[],"resources":[{"id":"flow:main","data":{"metadata":{"input":[{"name":"message","type":"string"}]},"tasks":[],"links":[]}}]}`
	plan, notes, err := BuildModelPatchPlan(context.Background(), doc, validation, nil, fakeModelClient{text: modelJSON})
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatal("expected patch plan")
	}
	if !plan.Safe {
		t.Fatalf("expected safe patch plan, got %+v", plan)
	}
	if len(notes) == 0 || !strings.Contains(notes[0], "model-generated") {
		t.Fatalf("expected model-generated notes, got %+v", notes)
	}
	if !strings.Contains(plan.UnifiedDiff, "res://flow:main") || !strings.Contains(plan.UnifiedDiff, "=$.pathParams.val") {
		t.Fatalf("unexpected diff %s", plan.UnifiedDiff)
	}
}

func TestBuildModelPatchPlanMarksInvalidTriggerResolverCandidateUnsafe(t *testing.T) {
	original := `{
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
}`
	doc, err := ParseDocumentBytes("flogo.json", []byte(original), []byte(original))
	if err != nil {
		t.Fatal(err)
	}
	validation := contracts.ValidationResult{
		SemanticIssues: ValidateSemantics(doc),
	}
	if len(validation.SemanticIssues) == 0 {
		t.Fatal("expected semantic issues in original document")
	}

	modelJSON := `{"name":"demo","type":"flogo:app","version":"1.0.0","appModel":"1.1.0","description":"demo","imports":["github.com/project-flogo/contrib/trigger/rest","github.com/project-flogo/flow"],"properties":[],"channels":[],"triggers":[{"id":"receive_http_message","ref":"#rest","settings":{"port":"8888"},"handlers":[{"settings":{"method":"GET","path":"/test/:val"},"action":{"ref":"#flow","settings":{"flowURI":"res://flow:main"},"input":{"message":"=$trigger.pathParams.val"}}}]}],"actions":[],"resources":[{"id":"flow:main","data":{"metadata":{"input":[{"name":"message","type":"string"}]},"tasks":[],"links":[]}}]}`
	plan, notes, err := BuildModelPatchPlan(context.Background(), doc, validation, nil, fakeModelClient{text: modelJSON})
	if err != nil {
		t.Fatal(err)
	}
	if plan == nil {
		t.Fatal("expected patch plan")
	}
	if plan.Safe {
		t.Fatalf("expected invalid trigger resolver candidate to be unsafe, got %+v", plan)
	}
	if !strings.Contains(plan.UnifiedDiff, "=$trigger.pathParams.val") {
		t.Fatalf("expected trigger resolver candidate diff, got %s", plan.UnifiedDiff)
	}
	if len(notes) == 0 || !strings.Contains(notes[0], "model-generated") {
		t.Fatalf("expected model-generated notes, got %+v", notes)
	}
}
