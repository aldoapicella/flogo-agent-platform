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
	if len(snapshot.Messages) < 4 {
		t.Fatalf("expected transcript to include approval turn, got %+v", snapshot.Messages)
	}
	foundApprovalMessage := false
	for _, message := range snapshot.Messages {
		if message.Role == contracts.RoleUser && strings.Contains(message.Content, "approve pending patch") {
			foundApprovalMessage = true
			break
		}
	}
	if !foundApprovalMessage {
		t.Fatalf("expected transcript to record explicit user approval, got %+v", snapshot.Messages)
	}

	contents, err := os.ReadFile(filepath.Join(repoPath, "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "res://flow:main") || !strings.Contains(string(contents), "=$.content") {
		t.Fatalf("expected repaired flogo.json, got %s", string(contents))
	}
}

func TestManagerCreationApprovalFlow(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	manifestPath, repoPath := writeEmptyRuntimeFixture(t, root, true)

	manager, err := NewManager(ctx, root, filepath.Join(root, "state"), manifestPath, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	snapshot, err := manager.CreateSession(ctx, contracts.SessionRequest{
		RepoPath: repoPath,
		Goal:     "create a Flogo app",
		Mode:     contracts.ModeReview,
		ApprovalPolicy: contracts.ApprovalPolicy{
			RequireWriteApproval: true,
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err = manager.SendMessage(ctx, snapshot.ID, "create a minimal flogo app")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Status != contracts.SessionStatusWaitingApproval {
		t.Fatalf("expected waiting approval, got %s", snapshot.Status)
	}
	if snapshot.PendingApproval == nil || len(snapshot.PendingApproval.Writes) != 1 {
		t.Fatalf("expected pending bootstrap write, got %+v", snapshot.PendingApproval)
	}
	if snapshot.LastTurnKind != "creation" {
		t.Fatalf("expected creation turn kind, got %s", snapshot.LastTurnKind)
	}

	if _, err := os.Stat(filepath.Join(repoPath, "flogo.json")); !os.IsNotExist(err) {
		t.Fatalf("expected review mode creation to avoid writing flogo.json before approval, err=%v", err)
	}

	snapshot, err = manager.Approve(ctx, snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Status != contracts.SessionStatusCompleted {
		t.Fatalf("expected completed status, got %s", snapshot.Status)
	}
	if snapshot.LastReport == nil || snapshot.LastReport.Outcome != contracts.RunOutcomeApplied {
		t.Fatalf("expected applied report, got %+v", snapshot.LastReport)
	}

	contents, err := os.ReadFile(filepath.Join(repoPath, "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "\"flowURI\": \"res://flow:main\"") {
		t.Fatalf("expected created flogo.json, got %s", string(contents))
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

func TestManagerUndoRestoresApprovedRepair(t *testing.T) {
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
	snapshot, err = manager.Approve(ctx, snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.UndoStack) == 0 {
		t.Fatal("expected an undo entry after approval")
	}

	snapshot, err = manager.Undo(snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.UndoStack) != 0 {
		t.Fatalf("expected undo stack to be empty, got %d", len(snapshot.UndoStack))
	}
	if snapshot.Status != contracts.SessionStatusActive {
		t.Fatalf("expected active status after undo, got %s", snapshot.Status)
	}
	if snapshot.LastReport != nil {
		t.Fatalf("expected last report to be cleared after undo, got %+v", snapshot.LastReport)
	}

	contents, err := os.ReadFile(filepath.Join(repoPath, "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(contents)
	if !strings.Contains(text, "\"flowURI\": \"main\"") || !strings.Contains(text, "\"message\": \"$flow.body\"") {
		t.Fatalf("expected original invalid descriptor to be restored, got %s", text)
	}
}

func TestManagerUndoRemovesCreatedBootstrap(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	manifestPath, repoPath := writeEmptyRuntimeFixture(t, root, true)

	manager, err := NewManager(ctx, root, filepath.Join(root, "state"), manifestPath, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	snapshot, err := manager.CreateSession(ctx, contracts.SessionRequest{
		RepoPath: repoPath,
		Goal:     "create a Flogo app",
		Mode:     contracts.ModeReview,
		ApprovalPolicy: contracts.ApprovalPolicy{
			RequireWriteApproval: true,
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err = manager.SendMessage(ctx, snapshot.ID, "create a minimal flogo app")
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err = manager.Approve(ctx, snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err = manager.Undo(snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repoPath, "flogo.json")); !os.IsNotExist(err) {
		t.Fatalf("expected undo to remove bootstrapped flogo.json, err=%v", err)
	}
}

func TestManagerAnswersLocalTestingQuestionWithGroundedFacts(t *testing.T) {
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
	snapshot, err = manager.Approve(ctx, snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}

	snapshot, err = manager.SendMessage(ctx, snapshot.ID, "How do I test this locally?")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.LastTurnKind != "inspection" {
		t.Fatalf("expected inspection turn kind, got %s", snapshot.LastTurnKind)
	}
	if len(snapshot.LastStepResults) == 0 || snapshot.LastStepResults[len(snapshot.LastStepResults)-1].Type != contracts.TurnStepPlanLocalTesting {
		t.Fatalf("expected local testing step results, got %+v", snapshot.LastStepResults)
	}
	last := snapshot.Messages[len(snapshot.Messages)-1]
	if last.Role != contracts.RoleAssistant {
		t.Fatalf("expected assistant reply, got %+v", last)
	}
	if !strings.Contains(last.Content, "curl -i http://127.0.0.1:8888/test") {
		t.Fatalf("expected curl guidance, got %q", last.Content)
	}
	if !strings.Contains(last.Content, "/bin/sample-app") {
		t.Fatalf("expected executable path guidance, got %q", last.Content)
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

func writeEmptyRuntimeFixture(t *testing.T, root string, installFakeFlogo bool) (string, string) {
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

	if err := os.WriteFile(filepath.Join(root, "docs", "reference.md"), []byte("# Flogo\nUse res://flow:<id> for flowURI values.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(root, "docs", "sources", "manifest.json")
	if err := os.WriteFile(manifestPath, []byte(`{"sources":[{"id":"reference","title":"Reference","type":"local_file","location":"docs/reference.md","tags":["official","flowuri"]}]}`), 0o644); err != nil {
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
