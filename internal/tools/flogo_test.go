package tools

import (
	"context"
	"os"
	"path/filepath"
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
}
