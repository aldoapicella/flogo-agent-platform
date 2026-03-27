//go:build integration

package tools

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
)

func TestFlogoCLIIntegrationCreateAndBuild(t *testing.T) {
	if os.Getenv("FLOGO_INTEGRATION") != "1" {
		t.Skip("set FLOGO_INTEGRATION=1 to run flogo CLI integration tests")
	}
	if _, err := exec.LookPath("flogo"); err != nil {
		t.Skip("flogo binary not found in PATH")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	fixtureRoot := filepath.Join("..", "..", "testdata", "benchmarks", "official-core")
	repoRoot := t.TempDir()
	if err := copyFile(filepath.Join(fixtureRoot, "flogo.json"), filepath.Join(repoRoot, "flogo.json")); err != nil {
		t.Fatal(err)
	}

	client := NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(repoRoot, "artifacts")))

	appPath := filepath.Join(repoRoot, "myapp")
	createResult, err := client.CreateSource(ctx, repoRoot, appPath)
	if err != nil {
		t.Fatal(err)
	}
	if createResult.ExitCode != 0 {
		t.Fatalf("flogo create failed: %s", describeToolResult(createResult))
	}
	if _, err := os.Stat(appPath); err != nil {
		t.Fatalf("expected created app at %s: %v", appPath, err)
	}

	orphaned, err := client.ListOrphaned(ctx, appPath)
	if err != nil {
		t.Fatal(err)
	}
	if orphaned.ExitCode != 0 {
		t.Fatalf("orphaned refs check failed: %s", describeToolResult(orphaned))
	}

	buildResult, err := client.Build(ctx, appPath)
	if err != nil {
		t.Fatal(err)
	}
	if buildResult.ExitCode != 0 {
		t.Fatalf("flogo build failed: %s", describeToolResult(buildResult))
	}
	if _, err := os.Stat(filepath.Join(appPath, "bin")); err != nil {
		t.Fatalf("expected build output under %s/bin: %v", appPath, err)
	}
}

func copyFile(src string, dst string) error {
	contents, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, contents, 0o644)
}

func describeToolResult(result contracts.ToolResult) string {
	return fmt.Sprintf("%+v", result)
}
