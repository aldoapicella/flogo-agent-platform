package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"

	"github.com/aldoapicella/flogo-agent-platform/internal/config"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
	"github.com/aldoapicella/flogo-agent-platform/internal/ui"
)

var errCredentialPromptCanceled = errors.New("model API key entry was canceled")

var promptForModelAPIKeyTTY = promptForModelAPIKeyTTYImpl
var promptForModelAPIKeyUI = ui.PromptForModelAPIKey
var stdioIsTerminal = func() bool {
	return term.IsTerminal(int(os.Stdin.Fd())) && term.IsTerminal(int(os.Stdout.Fd()))
}

func ensureAgentModelCLI() (model.Client, error) {
	client, err := requireAgentModel()
	if err == nil {
		return client, nil
	}
	if !errors.Is(err, model.ErrMissingOpenAIAPIKey) {
		return nil, err
	}
	if !stdioIsTerminal() {
		return nil, fmt.Errorf("%w; configure it in the environment, .env, or user config before running this command", err)
	}
	key, err := promptForModelAPIKeyTTY()
	if err != nil {
		return nil, err
	}
	if err := persistModelAPIKey(key); err != nil {
		return nil, err
	}
	return requireAgentModel()
}

func ensureAgentModelInteractive() (model.Client, error) {
	client, err := requireAgentModel()
	if err == nil {
		return client, nil
	}
	if !errors.Is(err, model.ErrMissingOpenAIAPIKey) {
		return nil, err
	}
	key, err := promptForModelAPIKeyUI()
	if err != nil {
		return nil, err
	}
	if err := persistModelAPIKey(key); err != nil {
		return nil, err
	}
	return requireAgentModel()
}

func persistModelAPIKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return model.ErrMissingOpenAIAPIKey
	}
	if err := config.SaveStoredCredentials("openai", key); err != nil {
		return err
	}
	return os.Setenv("OPENAI_API_KEY", key)
}

func promptForModelAPIKeyTTYImpl() (string, error) {
	if !stdioIsTerminal() {
		return "", fmt.Errorf("%w; prompting requires a TTY", model.ErrMissingOpenAIAPIKey)
	}
	fmt.Fprint(os.Stderr, "Model API Key: ")
	secret, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	key := strings.TrimSpace(string(secret))
	if key == "" {
		return "", model.ErrMissingOpenAIAPIKey
	}
	return key, nil
}
