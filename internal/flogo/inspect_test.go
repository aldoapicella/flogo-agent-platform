package flogo

import (
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestDescribeDescriptorExtractsRESTEndpointAndFlowIO(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"name":     "demo",
			"type":     "flogo:app",
			"appModel": "1.1.0",
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"triggers": []any{
				map[string]any{
					"id":       "receive_http_message",
					"ref":      "#rest",
					"settings": map[string]any{"port": "8888"},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{
								"method": "GET",
								"path":   "/test/:val",
							},
							"action": map[string]any{
								"ref": "#flow",
								"settings": map[string]any{
									"flowURI": "res://flow:main",
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
							"input":  []any{map[string]any{"name": "message", "type": "string"}},
							"output": []any{map[string]any{"name": "reply", "type": "string"}},
						},
					},
				},
			},
		},
	}

	observations := DescribeDescriptor(doc)
	assertObservationContains(t, observations, "rest_endpoint", "GET /test/:val")
	assertObservationData(t, observations, "rest_endpoint", "port", "8888")
	assertObservationData(t, observations, "rest_endpoint", "sample_path", "/test/sample-val")
	assertObservationContains(t, observations, "flow_io", "Flow main accepts inputs [message] and returns outputs [reply].")
}

func TestBuildLocalTestingObservationsUsesCurlForRESTApps(t *testing.T) {
	doc := &Document{
		Path: "flogo.json",
		Raw: map[string]any{
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"triggers": []any{
				map[string]any{
					"id":       "receive_http_message",
					"ref":      "#rest",
					"settings": map[string]any{"port": 8080},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{
								"method": "POST",
								"path":   "/device/:id",
							},
							"action": map[string]any{
								"ref": "#flow",
								"settings": map[string]any{
									"flowURI": "res://flow:main",
								},
							},
						},
					},
				},
			},
		},
	}

	observations := BuildLocalTestingObservations(doc, BuildArtifactFacts{
		ExecutablePath:    "/tmp/workspace/bin/sample-app",
		WorkspacePath:     "/tmp/workspace",
		TestSupportKnown:  true,
		SupportsTestFlags: false,
	})
	assertObservationContains(t, observations, "local_test_plan", "curl -i -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8080/device/sample-id")
	assertObservationContains(t, observations, "test_support", "does not support Flogo -test flags")
}

func assertObservationContains(t *testing.T, observations []contracts.Observation, kind string, expected string) {
	t.Helper()
	for _, observation := range observations {
		if observation.Kind != kind {
			continue
		}
		if strings.Contains(observation.Summary, expected) {
			return
		}
	}
	t.Fatalf("expected %s observation containing %q, got %+v", kind, expected, observations)
}

func assertObservationData(t *testing.T, observations []contracts.Observation, kind string, key string, expected string) {
	t.Helper()
	for _, observation := range observations {
		if observation.Kind != kind {
			continue
		}
		if observation.Data[key] == expected {
			return
		}
	}
	t.Fatalf("expected %s observation data %s=%q, got %+v", kind, key, expected, observations)
}
