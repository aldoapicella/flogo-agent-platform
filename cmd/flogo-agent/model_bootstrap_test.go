package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/config"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func TestEnsureAgentModelCLIPromptsAndPersists(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("OPENAI_API_KEY", "")

	oldPrompt := promptForModelAPIKeyTTY
	oldTTY := stdioIsTerminal
	defer func() {
		promptForModelAPIKeyTTY = oldPrompt
		stdioIsTerminal = oldTTY
	}()

	stdioIsTerminal = func() bool { return true }
	promptForModelAPIKeyTTY = func() (string, error) { return "prompted-key", nil }

	client, err := ensureAgentModelCLI()
	if err != nil {
		t.Fatal(err)
	}
	if client.ProviderName() != "openai" {
		t.Fatalf("expected openai provider, got %q", client.ProviderName())
	}
	if got := os.Getenv("OPENAI_API_KEY"); got != "prompted-key" {
		t.Fatalf("expected prompted key in env, got %q", got)
	}
	creds, err := config.LoadStoredCredentials()
	if err != nil {
		t.Fatal(err)
	}
	if creds == nil || creds.APIKey != "prompted-key" {
		t.Fatalf("expected persisted prompted key, got %+v", creds)
	}
}

func TestEnsureAgentModelCLIFailsWithoutTTY(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")

	oldTTY := stdioIsTerminal
	defer func() { stdioIsTerminal = oldTTY }()
	stdioIsTerminal = func() bool { return false }

	_, err := ensureAgentModelCLI()
	if !errors.Is(err, model.ErrMissingOpenAIAPIKey) {
		t.Fatalf("expected missing api key error, got %v", err)
	}
}

func TestLoadDefaultEnvLoadsStoredCredentials(t *testing.T) {
	configRoot := t.TempDir()
	repo := filepath.Join(t.TempDir(), "repo")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("XDG_CONFIG_HOME", configRoot)
	t.Setenv("OPENAI_API_KEY", "")
	if err := config.SaveStoredCredentials("openai", "stored-key"); err != nil {
		t.Fatal(err)
	}

	if err := loadDefaultEnv(repo); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("OPENAI_API_KEY"); got != "stored-key" {
		t.Fatalf("expected stored key to load into env, got %q", got)
	}
}
