package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

func TestRootCommandNoArgsLaunchesInteractive(t *testing.T) {
	called := false
	cmd := newRootCommandWithLaunch(func(opts interactiveOptions) error {
		called = true
		if opts.repoPath != "." {
			t.Fatalf("expected default repo path '.', got %q", opts.repoPath)
		}
		return nil
	})
	cmd.SetArgs(nil)

	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("expected root command to launch interactive mode")
	}
}

func TestTUICommandUsesInteractiveLauncher(t *testing.T) {
	called := false
	cmd := newRootCommandWithLaunch(func(opts interactiveOptions) error {
		called = true
		if opts.repoPath != "/tmp/repo" {
			t.Fatalf("expected repo path to be forwarded, got %q", opts.repoPath)
		}
		return nil
	})
	cmd.SetArgs([]string{"tui", "--repo", "/tmp/repo"})

	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("expected tui command to use interactive launcher")
	}
}

func TestLoadDotEnvFilesDoesNotOverrideExistingEnv(t *testing.T) {
	root := t.TempDir()
	cwd := filepath.Join(root, "cwd")
	repo := filepath.Join(root, "repo")
	for _, dir := range []string{cwd, repo} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	if err := os.WriteFile(filepath.Join(cwd, ".env"), []byte("OPENAI_MODEL=gpt-from-cwd\nKEEP_ME=from-cwd\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, ".env"), []byte("REPO_ONLY=repo-value\nKEEP_ME=from-repo\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("KEEP_ME", "existing")

	if err := loadDotEnvFiles(cwd, repo); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("OPENAI_MODEL"); got != "gpt-from-cwd" {
		t.Fatalf("expected OPENAI_MODEL from cwd .env, got %q", got)
	}
	if got := os.Getenv("REPO_ONLY"); got != "repo-value" {
		t.Fatalf("expected REPO_ONLY from repo .env, got %q", got)
	}
	if got := os.Getenv("KEEP_ME"); got != "existing" {
		t.Fatalf("expected existing env to win, got %q", got)
	}
}

func TestEnsureToolPathPrependsRepoLocalToolsBin(t *testing.T) {
	root := t.TempDir()
	cwd := filepath.Join(root, "cwd")
	repo := filepath.Join(root, "repo")
	toolDir := filepath.Join(repo, ".tools", "bin")
	for _, dir := range []string{cwd, toolDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(toolDir, "flogo"), []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", filepath.Join(root, "empty-bin"))
	t.Setenv("GOPATH", "")

	ensureToolPath(cwd, repo)

	parts := strings.Split(os.Getenv("PATH"), string(os.PathListSeparator))
	if len(parts) == 0 || parts[0] != toolDir {
		t.Fatalf("expected repo-local .tools/bin to be prepended, got %q", os.Getenv("PATH"))
	}
}

func TestRequireAgentModelFailsWithoutAPIKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")

	_, err := requireAgentModel()
	if !errors.Is(err, model.ErrMissingOpenAIAPIKey) {
		t.Fatalf("expected missing api key error, got %v", err)
	}
}

func TestRequireAgentModelBuildsOpenAIClient(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "test-key")
	t.Setenv("OPENAI_MODEL", "gpt-5.2")

	client, err := requireAgentModel()
	if err != nil {
		t.Fatal(err)
	}
	if client.ProviderName() != "openai" {
		t.Fatalf("expected openai provider, got %q", client.ProviderName())
	}
}
