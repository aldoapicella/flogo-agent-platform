package model

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type OpenAIConfig struct {
	APIKey          string
	BaseURL         string
	Model           string
	ReasoningEffort string
	HTTPClient      *http.Client
}

type OpenAIClient struct {
	apiKey          string
	baseURL         string
	model           string
	reasoningEffort string
	httpClient      *http.Client
}

func NewOpenAIClient(config OpenAIConfig) *OpenAIClient {
	baseURL := strings.TrimRight(config.BaseURL, "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	model := config.Model
	if model == "" {
		model = "gpt-5.2"
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 60 * time.Second}
	}
	reasoningEffort := config.ReasoningEffort
	if reasoningEffort == "" {
		reasoningEffort = "medium"
	}

	return &OpenAIClient{
		apiKey:          config.APIKey,
		baseURL:         baseURL,
		model:           model,
		reasoningEffort: reasoningEffort,
		httpClient:      httpClient,
	}
}

func (c *OpenAIClient) ProviderName() string {
	return "openai"
}

func (c *OpenAIClient) GenerateText(ctx context.Context, req TextRequest) (TextResponse, error) {
	modelName := req.Model
	if modelName == "" {
		modelName = c.model
	}
	if modelName == "" {
		return TextResponse{}, fmt.Errorf("model name is required")
	}

	effort := req.ReasoningEffort
	if effort == "" {
		effort = c.reasoningEffort
	}

	body := map[string]any{
		"model": modelName,
		"input": []map[string]any{
			{
				"role": "system",
				"content": []map[string]any{
					{"type": "input_text", "text": req.SystemPrompt},
				},
			},
			{
				"role": "user",
				"content": []map[string]any{
					{"type": "input_text", "text": req.UserPrompt},
				},
			},
		},
	}
	if effort != "" {
		body["reasoning"] = map[string]any{"effort": effort}
	}
	if req.MaxOutputTokens > 0 {
		body["max_output_tokens"] = req.MaxOutputTokens
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return TextResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/responses", bytes.NewReader(payload))
	if err != nil {
		return TextResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return TextResponse{}, err
	}
	defer httpResp.Body.Close()

	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return TextResponse{}, err
	}
	if httpResp.StatusCode >= 300 {
		return TextResponse{}, fmt.Errorf("openai responses api returned %s: %s", httpResp.Status, strings.TrimSpace(string(respBody)))
	}

	var parsed responsesAPIResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return TextResponse{}, fmt.Errorf("decode openai response: %w", err)
	}

	text := parsed.extractText()
	if strings.TrimSpace(text) == "" {
		return TextResponse{}, fmt.Errorf("openai response did not include text output")
	}

	return TextResponse{
		Text:      text,
		Model:     parsed.Model,
		RequestID: parsed.ID,
	}, nil
}

type responsesAPIResponse struct {
	ID     string `json:"id"`
	Model  string `json:"model"`
	Output []struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
}

func (r responsesAPIResponse) extractText() string {
	var parts []string
	for _, item := range r.Output {
		for _, content := range item.Content {
			if content.Text != "" {
				parts = append(parts, content.Text)
			}
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}
