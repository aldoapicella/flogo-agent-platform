package tools

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
)

func TestFlogoClientBuildUsesRunner(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	script := filepath.Join(binDir, "flogo")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nprintf '%s' \"$*\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", binDir+":"+os.Getenv("PATH"))

	client := NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts")))
	result, err := client.Build(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected success, got %+v", result)
	}

	stdout, err := os.ReadFile(result.StdoutPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(stdout), "build -e") {
		t.Fatalf("expected build command, got %q", string(stdout))
	}
}

func TestFlogoClientCreateSourceUsesRunner(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	script := filepath.Join(binDir, "flogo")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nprintf '%s' \"$*\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", binDir+":"+os.Getenv("PATH"))

	client := NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts")))
	result, err := client.CreateSource(ctx, root, filepath.Join(root, "generated-app"))
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected success, got %+v", result)
	}

	stdout, err := os.ReadFile(result.StdoutPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(stdout), "create -f") || !strings.Contains(string(stdout), "generated-app") {
		t.Fatalf("expected create command, got %q", string(stdout))
	}
}
