package session

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestServiceRunAppliesSafeRepairs(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()

	for _, dir := range []string{
		filepath.Join(root, "docs", "sources"),
		filepath.Join(root, "repo"),
		filepath.Join(root, "bin"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	if err := os.WriteFile(filepath.Join(root, "docs", "research.md"), []byte("# Mapping\nExpressions should start with '='.\n# flowURI\nUse res://flow:<id>.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "sources", "manifest.json"), []byte(`{"sources":[{"id":"research","title":"Research","type":"local_file","location":"docs/research.md","tags":["mapping","flowuri"]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "repo", "flogo.json"), []byte(`{
  "name": "demo",
  "type": "flogo:app",
  "version": "1.0.0",
  "description": "demo",
  "imports": [],
  "properties": [],
  "channels": [],
  "triggers": [
    {
      "handlers": [
        {
          "settings": {"flowURI": "main"},
          "input": {"message": "$flow.body"}
        }
      ]
    }
  ],
  "resources": [{"id": "flow:main"}],
  "actions": []
}`), 0o644); err != nil {
		t.Fatal(err)
	}

	flogoScript := filepath.Join(root, "bin", "flogo")
	if err := os.WriteFile(flogoScript, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", filepath.Join(root, "bin")+":"+os.Getenv("PATH"))

	service, err := NewService(ctx, root, filepath.Join(root, "state"), filepath.Join(root, "docs", "sources", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()

	report, err := service.Run(ctx, contracts.SessionRequest{
		RepoPath: filepath.Join(root, "repo"),
		Goal:     "repair flogo.json",
		Mode:     contracts.ModeApply,
	})
	if err != nil {
		t.Fatal(err)
	}
	if report.Outcome != contracts.RunOutcomeApplied {
		t.Fatalf("expected applied outcome, got %+v", report)
	}

	updated, err := os.ReadFile(filepath.Join(root, "repo", "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(updated)
	if !containsAll(text, "res://flow:main", "=$flow.body") {
		t.Fatalf("expected repaired file, got %s", text)
	}
}

func containsAll(text string, items ...string) bool {
	for _, item := range items {
		if !strings.Contains(text, item) {
			return false
		}
	}
	return true
}
