package model

import (
	"bytes"
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

func TestOpenAIClientGenerateMultimodalText(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/responses" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		input, ok := payload["input"].([]any)
		if !ok || len(input) != 2 {
			t.Fatalf("unexpected input payload %+v", payload["input"])
		}
		user, ok := input[1].(map[string]any)
		if !ok {
			t.Fatalf("unexpected user payload %+v", input[1])
		}
		content, ok := user["content"].([]any)
		if !ok || len(content) != 2 {
			t.Fatalf("unexpected content payload %+v", user["content"])
		}
		imageItem, ok := content[1].(map[string]any)
		if !ok {
			t.Fatalf("unexpected image payload %+v", content[1])
		}
		imageURL, _ := imageItem["image_url"].(string)
		if !strings.HasPrefix(imageURL, "data:image/png;base64,") {
			t.Fatalf("unexpected image_url %q", imageURL)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":    "resp_mm",
			"model": "gpt-5.2",
			"output": []any{
				map[string]any{
					"content": []any{
						map[string]any{
							"type": "output_text",
							"text": "{\"summary\":\"ok\"}",
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
	response, err := client.GenerateMultimodalText(context.Background(), MultimodalTextRequest{
		SystemPrompt: "review this ui",
		UserPrompt:   "describe the screenshot",
		Images: []ImageInput{
			{MIMEType: "image/png", Data: bytes.Repeat([]byte{0x42}, 8)},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.RequestID != "resp_mm" {
		t.Fatalf("unexpected response %+v", response)
	}
	if strings.TrimSpace(response.Text) != "{\"summary\":\"ok\"}" {
		t.Fatalf("unexpected text %q", response.Text)
	}
}
