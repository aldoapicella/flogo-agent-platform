package agents

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
	"github.com/aldoapicella/flogo-agent-platform/internal/tools"
)

func TestUnsupportedExecutableTestMode(t *testing.T) {
	root := t.TempDir()
	stderrPath := filepath.Join(root, "stderr.log")
	if err := os.WriteFile(stderrPath, []byte("flag provided but not defined: -test\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if !unsupportedExecutableTestMode(contracts.ToolResult{
		ExitCode:   2,
		StderrPath: stderrPath,
	}) {
		t.Fatal("expected unsupported executable test mode to be detected")
	}
}

func TestBuildAndTestBlocksOnStartupSmokeFailure(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	binDir := filepath.Join(root, "bin")
	workspaceRoot := filepath.Join(root, "workspace")
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(repoPath, "flogo.json"), []byte(`{
  "name": "demo",
  "type": "flogo:app",
  "version": "1.0.0",
  "description": "demo",
  "imports": [
    "github.com/project-flogo/contrib/trigger/rest",
    "github.com/project-flogo/flow"
  ],
  "properties": [],
  "channels": [],
  "triggers": [],
  "appModel": "1.1.0",
  "resources": [
    {
      "id": "flow:main",
      "data": {
        "metadata": {
          "input": []
        },
        "tasks": [],
        "links": []
      }
    }
  ],
  "actions": []
}`), 0o644); err != nil {
		t.Fatal(err)
	}

	flogoScript := filepath.Join(binDir, "flogo")
	script := `#!/bin/sh
set -eu
if [ "$1" = "list" ] && [ "$2" = "--orphaned" ]; then
  printf '[]\n'
  exit 0
fi
if [ "$1" = "create" ]; then
  mkdir -p "$4"
  cp "$3" "$4/flogo.json"
  exit 0
fi
if [ "$1" = "build" ]; then
  mkdir -p "$PWD/bin"
  cat > "$PWD/bin/demo" <<'EOF'
#!/bin/sh
exit 1
EOF
  chmod +x "$PWD/bin/demo"
  exit 0
fi
exit 0
`
	if err := os.WriteFile(flogoScript, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", binDir+":"+os.Getenv("PATH"))

	verifier := NewVerifier(tools.NewFlogoClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts"))))
	buildResult, results, err := verifier.BuildAndTest(ctx, repoPath, workspaceRoot)
	if err != nil {
		t.Fatal(err)
	}
	if buildResult == nil || buildResult.ExitCode != 0 {
		t.Fatalf("expected build to succeed before startup smoke failure, got %+v", buildResult)
	}
	if len(results) < 2 {
		t.Fatalf("expected orphaned-check and startup-smoke results, got %+v", results)
	}
	last := results[len(results)-1]
	if last.Name != "startup-smoke" {
		t.Fatalf("expected startup-smoke result, got %+v", last)
	}
	if last.Passed {
		t.Fatalf("expected startup-smoke failure, got %+v", last)
	}
	if !strings.Contains(last.Result.Command, filepath.Join(workspaceRoot, "bin")) {
		t.Fatalf("expected startup smoke to target built executable, got %+v", last.Result)
	}
}
