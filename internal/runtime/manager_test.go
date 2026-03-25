package runtime

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestManagerRepairApprovalFlow(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	manifestPath, repoPath := writeRuntimeFixture(t, root, true)

	manager, err := NewManager(ctx, root, filepath.Join(root, "state"), manifestPath, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	snapshot, err := manager.CreateSession(ctx, contracts.SessionRequest{
		RepoPath: repoPath,
		Goal:     "repair the Flogo app",
		Mode:     contracts.ModeReview,
		ApprovalPolicy: contracts.ApprovalPolicy{
			RequireWriteApproval: true,
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err = manager.SendMessage(ctx, snapshot.ID, "repair and verify the app")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Status != contracts.SessionStatusWaitingApproval {
		t.Fatalf("expected waiting approval, got %s", snapshot.Status)
	}
	if snapshot.PendingApproval == nil || snapshot.PendingApproval.PatchPlan == nil {
		t.Fatalf("expected pending patch approval, got %+v", snapshot.PendingApproval)
	}

	snapshot, err = manager.Approve(ctx, snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Status != contracts.SessionStatusCompleted {
		t.Fatalf("expected completed status, got %s", snapshot.Status)
	}
	if snapshot.PendingApproval != nil {
		t.Fatalf("expected pending approval to be cleared, got %+v", snapshot.PendingApproval)
	}
	if snapshot.LastReport == nil || snapshot.LastReport.Outcome != contracts.RunOutcomeApplied {
		t.Fatalf("expected applied report, got %+v", snapshot.LastReport)
	}

	contents, err := os.ReadFile(filepath.Join(repoPath, "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "res://flow:main") || !strings.Contains(string(contents), "=$flow.body") {
		t.Fatalf("expected repaired flogo.json, got %s", string(contents))
	}
}

func TestManagerReloadsPersistedSessions(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	manifestPath, repoPath := writeRuntimeFixture(t, root, false)
	stateDir := filepath.Join(root, "state")

	manager, err := NewManager(ctx, root, stateDir, manifestPath, Options{})
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err := manager.CreateSession(ctx, contracts.SessionRequest{
		RepoPath: repoPath,
		Goal:     "inspect the Flogo app",
		Mode:     contracts.ModeReview,
	})
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err = manager.SendMessage(ctx, snapshot.ID, "inspect the app")
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}

	reloaded, err := NewManager(ctx, root, stateDir, manifestPath, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer reloaded.Close()

	snapshot, err = reloaded.GetSession(snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Messages) < 3 {
		t.Fatalf("expected persisted transcript, got %+v", snapshot.Messages)
	}
	if snapshot.LastReport == nil {
		t.Fatalf("expected persisted last report, got %+v", snapshot)
	}
}

func writeRuntimeFixture(t *testing.T, root string, installFakeFlogo bool) (string, string) {
	t.Helper()

	for _, dir := range []string{
		filepath.Join(root, "docs", "sources"),
		filepath.Join(root, "repo"),
		filepath.Join(root, "bin"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	if err := os.WriteFile(filepath.Join(root, "docs", "reference.md"), []byte("# Flogo\nUse res://flow:<id> for flowURI values.\nMapping expressions should start with =.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(root, "docs", "sources", "manifest.json")
	if err := os.WriteFile(manifestPath, []byte(`{"sources":[{"id":"reference","title":"Reference","type":"local_file","location":"docs/reference.md","tags":["official","mapping","flowuri"]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(root, "repo", "flogo.json"), []byte(`{
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
  "triggers": [
    {
      "id": "receive_http_message",
      "ref": "#rest",
      "settings": {"port": "8888"},
      "handlers": [
        {
          "settings": {"method": "GET", "path": "/test"},
          "action": {
            "ref": "#flow",
            "settings": {"flowURI": "main"},
            "input": {"message": "$flow.body"}
          }
        }
      ]
    }
  ],
  "appModel": "1.1.0",
  "resources": [{"id": "flow:main", "data": {"metadata": {"input": [{"name": "message", "type": "string"}]}, "tasks": [], "links": []}}],
  "actions": []
}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if installFakeFlogo {
		flogoScript := filepath.Join(root, "bin", "flogo")
		script := `#!/bin/sh
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
  cat > "$PWD/bin/sample-app" <<'EOF'
#!/bin/sh
if [ "$1" = "-test" ] && [ "$2" = "-flows" ]; then
  printf 'main\n'
  exit 0
fi
if [ "$1" = "-test" ] && [ "$2" = "-flowdata" ]; then
  printf '{}\n' > "$PWD/sample-app_main_input.json"
  exit 0
fi
if [ "$1" = "-test" ] && [ "$2" = "-flowin" ]; then
  printf '{}\n' > "$4"
  exit 0
fi
exit 0
EOF
  chmod +x "$PWD/bin/sample-app"
  exit 0
fi
exit 0
`
		if err := os.WriteFile(flogoScript, []byte(script), 0o755); err != nil {
			t.Fatal(err)
		}
		t.Setenv("PATH", filepath.Join(root, "bin")+":"+os.Getenv("PATH"))
	}

	return manifestPath, filepath.Join(root, "repo")
}
