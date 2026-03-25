package model

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAIClientGenerateText(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/responses" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer test-key" {
			t.Fatalf("unexpected auth header %q", auth)
		}

		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["model"] != "gpt-5.2" {
			t.Fatalf("unexpected model payload %+v", payload)
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":    "resp_123",
			"model": "gpt-5.2",
			"output": []any{
				map[string]any{
					"content": []any{
						map[string]any{
							"type": "output_text",
							"text": "{\"name\":\"demo\"}",
						},
					},
				},
			},
		})
	}))
	defer server.Close()

	client := NewOpenAIClient(OpenAIConfig{
		APIKey:  "test-key",
		BaseURL: server.URL,
		Model:   "gpt-5.2",
	})

	response, err := client.GenerateText(context.Background(), TextRequest{
		SystemPrompt: "system",
		UserPrompt:   "user",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.RequestID != "resp_123" {
		t.Fatalf("unexpected response %+v", response)
	}
	if strings.TrimSpace(response.Text) != "{\"name\":\"demo\"}" {
		t.Fatalf("unexpected text %q", response.Text)
	}
}
