package model

import (
	"context"
	"os"
	"strings"
)

type TextRequest struct {
	SystemPrompt    string
	UserPrompt      string
	Model           string
	MaxOutputTokens int
	ReasoningEffort string
}

type TextResponse struct {
	Text      string
	Model     string
	RequestID string
}

type Client interface {
	GenerateText(context.Context, TextRequest) (TextResponse, error)
	ProviderName() string
}

func NewFromEnv() (Client, error) {
	apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	if apiKey == "" {
		return nil, nil
	}

	return NewOpenAIClient(OpenAIConfig{
		APIKey:          apiKey,
		BaseURL:         strings.TrimSpace(os.Getenv("OPENAI_BASE_URL")),
		Model:           strings.TrimSpace(os.Getenv("OPENAI_MODEL")),
		ReasoningEffort: strings.TrimSpace(os.Getenv("OPENAI_REASONING_EFFORT")),
	}), nil
}
