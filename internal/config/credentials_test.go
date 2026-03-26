package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveAndLoadStoredCredentials(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)

	if err := SaveStoredCredentials("", "test-key"); err != nil {
		t.Fatal(err)
	}

	creds, err := LoadStoredCredentials()
	if err != nil {
		t.Fatal(err)
	}
	if creds == nil {
		t.Fatal("expected stored credentials")
	}
	if creds.Provider != "openai" {
		t.Fatalf("expected default provider openai, got %q", creds.Provider)
	}
	if creds.APIKey != "test-key" {
		t.Fatalf("expected api key to round-trip, got %q", creds.APIKey)
	}

	path, err := CredentialsPath()
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("expected 0600 credentials file, got %o", info.Mode().Perm())
	}
	if filepath.Dir(path) != filepath.Join(configRoot, "flogo-agent") {
		t.Fatalf("unexpected credentials path %q", path)
	}
}

func TestLoadIntoEnvDoesNotOverrideExistingValue(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)
	t.Setenv("OPENAI_API_KEY", "existing")

	if err := SaveStoredCredentials("openai", "stored-key"); err != nil {
		t.Fatal(err)
	}
	if err := LoadIntoEnv(); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("OPENAI_API_KEY"); got != "existing" {
		t.Fatalf("expected existing env to win, got %q", got)
	}
}
