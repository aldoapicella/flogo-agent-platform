package sandbox

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestDockerRunnerShapesContainerCommand(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	binDir := filepath.Join(root, "bin")
	workDir := filepath.Join(root, "workspace")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(workDir, "bin"), 0o755); err != nil {
		t.Fatal(err)
	}

	dockerScript := filepath.Join(binDir, "docker")
	if err := os.WriteFile(dockerScript, []byte("#!/bin/sh\nprintf '%s' \"$*\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir+":"+os.Getenv("PATH"))

	runner := NewDockerRunner(filepath.Join(root, "artifacts"), "golang:1.25", "runsc", "none")
	result, err := runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  filepath.Join(workDir, "bin", "app"),
		Args:      []string{"-test", "-flows"},
		WorkDir:   workDir,
		EnvPolicy: "default",
		Env: map[string]string{
			"FLOGO_ENV": "1",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected docker wrapper success, got %+v", result)
	}

	stdout, err := os.ReadFile(result.StdoutPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(stdout)
	for _, expected := range []string{
		"run --rm",
		"--runtime runsc",
		"--network none",
		"-e FLOGO_ENV=1",
		"-v " + workDir + ":/workspace",
		"/workspace/bin/app -test -flows",
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("expected %q in docker command, got %q", expected, text)
		}
	}
}
