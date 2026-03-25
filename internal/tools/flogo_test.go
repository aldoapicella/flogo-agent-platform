package tools

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

func TestFlogoClientCreateSourceUsesParentDirectoryForAbsoluteOutputPath(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	script := filepath.Join(binDir, "flogo")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nprintf '%s|%s' \"$PWD\" \"$*\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", binDir+":"+os.Getenv("PATH"))

	client := NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts")))
	outputPath := filepath.Join(root, "generated-app")
	result, err := client.CreateSource(ctx, root, outputPath)
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
	text := string(stdout)
	if !strings.Contains(text, root+"|") || !strings.Contains(text, " create -f ") && !strings.Contains(text, "create -f") {
		t.Fatalf("unexpected create invocation %q", text)
	}
	if !strings.Contains(text, filepath.Join(root, "flogo.json")) {
		t.Fatalf("expected absolute app file path in create invocation, got %q", text)
	}
	if !strings.Contains(text, filepath.Base(outputPath)) {
		t.Fatalf("expected basename output path, got %q", text)
	}
}

func TestFlogoClientRunUnitTestsCapturesTestResultArtifacts(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	executable := filepath.Join(root, "app")
	outputDir := filepath.Join(root, "test-results")

	script := "#!/bin/sh\nmkdir -p \"$7\"\nprintf 'ok' > \"$7/$9\"\nprintf '%s' \"$*\"\n"
	if err := os.WriteFile(executable, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	client := NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts")))
	result, err := client.RunUnitTests(ctx, executable, root, UnitTestOptions{
		AppFile:        filepath.Join(root, "flogo.json"),
		TestFile:       filepath.Join(root, ".flogotest"),
		OutputDir:      outputDir,
		ResultFilename: "suite.testresult",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected success, got %+v", result)
	}

	found := false
	for _, artifact := range result.ArtifactPaths {
		if artifact.Kind == "test-result" && strings.HasSuffix(artifact.Path, "suite.testresult") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected .testresult artifact, got %+v", result.ArtifactPaths)
	}
}

func TestFlogoClientCreateSourceSetsGOPATHForCLI(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	script := filepath.Join(binDir, "flogo")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nprintf '%s' \"$GOPATH\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", binDir+":"+os.Getenv("PATH"))
	t.Setenv("GOPATH", "")

	expectedGOPATHBytes, err := exec.Command("go", "env", "GOPATH").Output()
	if err != nil {
		t.Fatal(err)
	}
	expectedGOPATH := strings.TrimSpace(string(expectedGOPATHBytes))

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
	if strings.TrimSpace(string(stdout)) != expectedGOPATH {
		t.Fatalf("expected GOPATH %q, got %q", expectedGOPATH, strings.TrimSpace(string(stdout)))
	}
}

func TestFlogoClientStartupSmokeTreatsTimeoutAsSuccess(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	executable := filepath.Join(root, "app")

	script := "#!/bin/sh\nsleep 5\n"
	if err := os.WriteFile(executable, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	client := NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts")))
	result, err := client.StartupSmoke(ctx, executable, root, 100*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected timeout-normalized success, got %+v", result)
	}
}

func TestFlogoClientStartupSmokePreservesImmediateFailure(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	executable := filepath.Join(root, "app")

	script := "#!/bin/sh\nexit 1\n"
	if err := os.WriteFile(executable, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	client := NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts")))
	result, err := client.StartupSmoke(ctx, executable, root, 250*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode == 0 {
		t.Fatalf("expected immediate failure to be preserved, got %+v", result)
	}
}
