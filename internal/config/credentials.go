package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type StoredCredentials struct {
	Provider  string `json:"provider"`
	APIKey    string `json:"api_key"`
	UpdatedAt string `json:"updated_at"`
}

func CredentialsPath() (string, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "flogo-agent", "credentials.json"), nil
}

func LoadStoredCredentials() (*StoredCredentials, error) {
	path, err := CredentialsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var creds StoredCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, err
	}
	creds.Provider = strings.TrimSpace(creds.Provider)
	creds.APIKey = strings.TrimSpace(creds.APIKey)
	if creds.Provider == "" {
		creds.Provider = "openai"
	}
	if creds.APIKey == "" {
		return nil, nil
	}
	return &creds, nil
}

func SaveStoredCredentials(provider string, apiKey string) error {
	provider = strings.TrimSpace(provider)
	if provider == "" {
		provider = "openai"
	}
	apiKey = strings.TrimSpace(apiKey)
	path, err := CredentialsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(StoredCredentials{
		Provider:  provider,
		APIKey:    apiKey,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o600)
}

func LoadIntoEnv() error {
	if strings.TrimSpace(os.Getenv("OPENAI_API_KEY")) != "" {
		return nil
	}
	creds, err := LoadStoredCredentials()
	if err != nil || creds == nil {
		return err
	}
	return os.Setenv("OPENAI_API_KEY", creds.APIKey)
}
