package model

import (
	"context"
	"errors"
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

var ErrMissingOpenAIAPIKey = errors.New("OPENAI_API_KEY is required for agent commands")

func NewFromEnv() (Client, error) {
	apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	if apiKey == "" {
		return nil, nil
	}

	return NewOpenAIClient(configFromEnv(apiKey)), nil
}

func RequireFromEnv() (Client, error) {
	apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	if apiKey == "" {
		return nil, ErrMissingOpenAIAPIKey
	}
	return NewOpenAIClient(configFromEnv(apiKey)), nil
}

func configFromEnv(apiKey string) OpenAIConfig {
	return OpenAIConfig{
		APIKey:          apiKey,
		BaseURL:         strings.TrimSpace(os.Getenv("OPENAI_BASE_URL")),
		Model:           strings.TrimSpace(os.Getenv("OPENAI_MODEL")),
		ReasoningEffort: strings.TrimSpace(os.Getenv("OPENAI_REASONING_EFFORT")),
	}
}
