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

	flogoScript := filepath.Join(root, "bin", "flogo")
	script := `#!/bin/sh
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
