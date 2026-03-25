package e2e

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

var (
	buildOnce   sync.Once
	binaryPath  string
	binaryBuild error
)

func TestRunReviewModeE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeInvalidMappingRepo(t, root)
	stateDir := filepath.Join(root, "state")

	stdout, stderr, err := runAgent(t, root, nil,
		"run",
		"--repo", repoPath,
		"--goal", "repair invalid mapping",
		"--mode", "review",
		"--state-dir", stateDir,
		"--sources", manifest,
	)
	if err != nil {
		t.Fatalf("run failed: %v\nstdout:\n%s\nstderr:\n%s", err, stdout, stderr)
	}
	if !strings.Contains(stdout, "Outcome: ready") {
		t.Fatalf("expected ready outcome, got stdout:\n%s", stdout)
	}
	if !strings.Contains(stdout, "\"flowURI\": \"res://flow:main\"") || !strings.Contains(stdout, "\"message\": \"=$flow.body\"") {
		t.Fatalf("expected repaired diff, got stdout:\n%s", stdout)
	}

	contents, err := os.ReadFile(filepath.Join(repoPath, "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(contents), "=$flow.body") {
		t.Fatalf("review mode should not have modified the file: %s", string(contents))
	}
}

func TestRunApplyModeFlowTestsE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeInvalidMappingRepo(t, root)
	stateDir := filepath.Join(root, "state")
	env := fakeToolEnv(t, root)

	stdout, stderr, err := runAgent(t, root, env,
		"run",
		"--repo", repoPath,
		"--goal", "repair and verify",
		"--mode", "apply",
		"--state-dir", stateDir,
		"--sources", manifest,
	)
	if err != nil {
		t.Fatalf("run failed: %v\nstdout:\n%s\nstderr:\n%s", err, stdout, stderr)
	}
	for _, expected := range []string{
		"Outcome: applied",
		"Test flow-list passed=true",
		"Test flow-generate-data passed=true",
		"Test flow-tests passed=true",
	} {
		if !strings.Contains(stdout, expected) {
			t.Fatalf("expected %q in stdout:\n%s", expected, stdout)
		}
	}

	contents, err := os.ReadFile(filepath.Join(repoPath, "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "res://flow:main") || !strings.Contains(string(contents), "=$flow.body") {
		t.Fatalf("expected repaired repo file, got %s", string(contents))
	}
}

func TestRunApplyModeUnitTestsE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeInvalidMappingRepo(t, root)
	if err := os.WriteFile(filepath.Join(repoPath, ".flogotest"), []byte("suite: demo\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	stateDir := filepath.Join(root, "state")
	env := fakeToolEnv(t, root)

	stdout, stderr, err := runAgent(t, root, env,
		"run",
		"--repo", repoPath,
		"--goal", "repair and verify unit tests",
		"--mode", "apply",
		"--state-dir", stateDir,
		"--sources", manifest,
	)
	if err != nil {
		t.Fatalf("run failed: %v\nstdout:\n%s\nstderr:\n%s", err, stdout, stderr)
	}
	if !strings.Contains(stdout, "Test unit-tests passed=true") {
		t.Fatalf("expected unit-test execution in stdout:\n%s", stdout)
	}

	matches, err := filepath.Glob(filepath.Join(stateDir, "workspaces", "*", "test-results", "*.testresult"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) == 0 {
		t.Fatal("expected .testresult artifact")
	}
}

func TestRepoCommandsE2E(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatal(err)
	}
	runGit(t, repoPath, "init")
	runGit(t, repoPath, "config", "user.name", "Codex")
	runGit(t, repoPath, "config", "user.email", "codex@example.com")
	if err := os.WriteFile(filepath.Join(repoPath, "README.md"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	statusOut, statusErr, err := runAgent(t, root, nil,
		"repo", "status",
		"--repo", repoPath,
		"--state-dir", filepath.Join(root, "state"),
	)
	if err != nil {
		t.Fatalf("status failed: %v\nstdout:\n%s\nstderr:\n%s", err, statusOut, statusErr)
	}
	if !strings.Contains(statusOut, "README.md") {
		t.Fatalf("expected README.md in status output: %s", statusOut)
	}

	if _, stderr, err := runAgent(t, root, nil,
		"repo", "commit",
		"--repo", repoPath,
		"--state-dir", filepath.Join(root, "state"),
		"-m", "initial commit",
	); err != nil {
		t.Fatalf("commit failed: %v\nstderr:\n%s", err, stderr)
	}

	if err := os.WriteFile(filepath.Join(repoPath, "README.md"), []byte("hello\nworld\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	diffOut, diffErr, err := runAgent(t, root, nil,
		"repo", "diff",
		"--repo", repoPath,
		"--state-dir", filepath.Join(root, "state"),
	)
	if err != nil {
		t.Fatalf("diff failed: %v\nstdout:\n%s\nstderr:\n%s", err, diffOut, diffErr)
	}
	if !strings.Contains(diffOut, "+world") {
		t.Fatalf("expected diff output, got:\n%s", diffOut)
	}

	if _, stderr, err := runAgent(t, root, nil,
		"repo", "branch", "feature/e2e",
		"--repo", repoPath,
		"--state-dir", filepath.Join(root, "state"),
		"--checkout",
	); err != nil {
		t.Fatalf("branch failed: %v\nstderr:\n%s", err, stderr)
	}
	currentBranch := runGitCapture(t, repoPath, "branch", "--show-current")
	if strings.TrimSpace(currentBranch) != "feature/e2e" {
		t.Fatalf("expected feature/e2e, got %q", currentBranch)
	}
}

func TestRunReviewModeModelFallbackE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeModelFallbackRepo(t, root)
	stateDir := filepath.Join(root, "state")

	responseJSON := map[string]any{
		"id":    "resp_model",
		"model": "gpt-5.2",
		"output": []any{
			map[string]any{
				"content": []any{
					map[string]any{
						"type": "output_text",
						"text": `{"name":"demo","type":"flogo:app","version":"1.0.0","appModel":"1.1.0","description":"demo","imports":["github.com/project-flogo/flow","github.com/project-flogo/contrib/activity/log"],"properties":[],"channels":[],"triggers":[],"actions":[],"resources":[{"id":"flow:main","data":{"metadata":{"input":[],"output":[]},"tasks":[{"id":"log_message","activity":{"ref":"github.com/project-flogo/contrib/activity/log"}}],"links":[]}}]}`,
					},
				},
			},
		},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/responses" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(responseJSON)
	}))
	defer server.Close()

	env := []string{
		"OPENAI_API_KEY=test-key",
		"OPENAI_BASE_URL=" + server.URL,
		"OPENAI_MODEL=gpt-5.2",
	}

	stdout, stderr, err := runAgent(t, root, env,
		"run",
		"--repo", repoPath,
		"--goal", "repair task activity",
		"--mode", "review",
		"--state-dir", stateDir,
		"--sources", manifest,
	)
	if err != nil {
		t.Fatalf("run failed: %v\nstdout:\n%s\nstderr:\n%s", err, stdout, stderr)
	}
	if !strings.Contains(stdout, "model-generated repair candidate via openai/gpt-5.2") {
		t.Fatalf("expected model-generated note in stdout:\n%s", stdout)
	}
	if !strings.Contains(stdout, "review the proposed patch before applying") {
		t.Fatalf("expected review flow in stdout:\n%s", stdout)
	}
	if !strings.Contains(stdout, "github.com/project-flogo/contrib/activity/log") {
		t.Fatalf("expected model diff in stdout:\n%s", stdout)
	}
}

func TestDaemonChatApprovalE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeInvalidMappingRepo(t, root)
	stateDir := filepath.Join(root, "state")
	env := fakeToolEnv(t, root)
	addr := freeAddress(t)

	daemon, daemonStdout, daemonStderr := startDaemon(t, root, env, addr, stateDir, manifest)
	defer stopDaemon(t, daemon, daemonStdout, daemonStderr)

	stdout, stderr, err := runAgent(t, root, env,
		"chat",
		"--daemon-url", "http://"+addr,
		"--repo", repoPath,
		"--goal", "repair and verify",
		"--mode", "review",
		"--state-dir", stateDir,
		"--sources", manifest,
		"--message", "repair and verify the app",
	)
	if err != nil {
		t.Fatalf("chat failed: %v\nstdout:\n%s\nstderr:\n%s", err, stdout, stderr)
	}
	if !strings.Contains(stdout, "Session: session-") {
		t.Fatalf("expected session id in stdout:\n%s", stdout)
	}
	if !strings.Contains(stdout, "Outcome: ready") {
		t.Fatalf("expected ready repair proposal in stdout:\n%s", stdout)
	}

	sessionID := parseSessionID(t, stdout)
	approveOut, approveErr, err := runAgent(t, root, env,
		"session", "approve", sessionID,
		"--daemon-url", "http://"+addr,
	)
	if err != nil {
		t.Fatalf("session approve failed: %v\nstdout:\n%s\nstderr:\n%s", err, approveOut, approveErr)
	}
	for _, expected := range []string{
		"status=completed",
		"Outcome: applied",
		"Test flow-tests passed=true",
	} {
		if !strings.Contains(approveOut, expected) {
			t.Fatalf("expected %q in approve output:\n%s", expected, approveOut)
		}
	}
}

func TestDaemonChatCreateApprovalE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeEmptyRepo(t, root)
	stateDir := filepath.Join(root, "state")
	env := fakeToolEnv(t, root)
	addr := freeAddress(t)

	daemon, daemonStdout, daemonStderr := startDaemon(t, root, env, addr, stateDir, manifest)
	defer stopDaemon(t, daemon, daemonStdout, daemonStderr)

	stdout, stderr, err := runAgent(t, root, env,
		"chat",
		"--daemon-url", "http://"+addr,
		"--repo", repoPath,
		"--goal", "create and verify",
		"--mode", "review",
		"--state-dir", stateDir,
		"--sources", manifest,
		"--message", "create a minimal flogo app",
	)
	if err != nil {
		t.Fatalf("chat failed: %v\nstdout:\n%s\nstderr:\n%s", err, stdout, stderr)
	}
	for _, expected := range []string{
		"Session: session-",
		"Turn kind: creation",
		"Prepared a minimal Flogo app bootstrap",
		"review the proposed bootstrap app before applying",
	} {
		if !strings.Contains(stdout, expected) {
			t.Fatalf("expected %q in create output:\n%s", expected, stdout)
		}
	}
	if _, err := os.Stat(filepath.Join(repoPath, "flogo.json")); !os.IsNotExist(err) {
		t.Fatalf("expected review mode create flow not to write flogo.json before approval, err=%v", err)
	}

	sessionID := parseSessionID(t, stdout)
	approveOut, approveErr, err := runAgent(t, root, env,
		"session", "approve", sessionID,
		"--daemon-url", "http://"+addr,
	)
	if err != nil {
		t.Fatalf("session approve failed: %v\nstdout:\n%s\nstderr:\n%s", err, approveOut, approveErr)
	}
	for _, expected := range []string{
		"status=completed",
		"Outcome: applied",
		"Test flow-tests passed=true",
	} {
		if !strings.Contains(approveOut, expected) {
			t.Fatalf("expected %q in approve output:\n%s", expected, approveOut)
		}
	}
	contents, err := os.ReadFile(filepath.Join(repoPath, "flogo.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "\"type\": \"flogo:app\"") || !strings.Contains(string(contents), "\"flowURI\": \"res://flow:main\"") {
		t.Fatalf("expected created flogo.json, got %s", string(contents))
	}
}

func runAgent(t *testing.T, workdir string, extraEnv []string, args ...string) (string, string, error) {
	t.Helper()
	cmd := exec.Command(agentBinary(t), args...)
	cmd.Dir = workdir
	cmd.Env = mergeEnv(os.Environ(), extraEnv)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

func mergeEnv(base []string, overrides []string) []string {
	values := map[string]string{}
	order := make([]string, 0, len(base)+len(overrides))
	for _, item := range append(base, overrides...) {
		parts := strings.SplitN(item, "=", 2)
		key := parts[0]
		value := ""
		if len(parts) == 2 {
			value = parts[1]
		}
		if _, exists := values[key]; !exists {
			order = append(order, key)
		}
		values[key] = value
	}
	env := make([]string, 0, len(order))
	for _, key := range order {
		env = append(env, key+"="+values[key])
	}
	return env
}

func agentBinary(t *testing.T) string {
	t.Helper()
	buildOnce.Do(func() {
		tempRoot, err := os.MkdirTemp("", "flogo-agent-e2e-*")
		if err != nil {
			binaryBuild = err
			return
		}
		binaryPath = filepath.Join(tempRoot, "flogo-agent")
		cmd := exec.Command("go", "build", "-o", binaryPath, "./cmd/flogo-agent")
		cmd.Dir = repoRoot(t)
		output, err := cmd.CombinedOutput()
		if err != nil {
			binaryBuild = execError("build agent binary", err, string(output))
		}
	})
	if binaryBuild != nil {
		t.Fatal(binaryBuild)
	}
	return binaryPath
}

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("failed to resolve repo root")
	}
	return filepath.Dir(filepath.Dir(file))
}

func freeAddress(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().String()
}

func startDaemon(t *testing.T, workdir string, extraEnv []string, addr string, stateDir string, manifest string) (*exec.Cmd, *bytes.Buffer, *bytes.Buffer) {
	t.Helper()
	cmd := exec.Command(agentBinary(t),
		"daemon",
		"--listen", addr,
		"--state-dir", stateDir,
		"--sources", manifest,
	)
	cmd.Dir = workdir
	cmd.Env = mergeEnv(os.Environ(), extraEnv)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatalf("failed to start daemon: %v", err)
	}
	waitForDaemon(t, "http://"+addr, cmd, &stdout, &stderr)
	return cmd, &stdout, &stderr
}

func waitForDaemon(t *testing.T, baseURL string, cmd *exec.Cmd, stdout *bytes.Buffer, stderr *bytes.Buffer) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
			t.Fatalf("daemon exited early\nstdout:\n%s\nstderr:\n%s", stdout.String(), stderr.String())
		}
		resp, err := http.Get(baseURL + "/healthz")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	_ = cmd.Process.Kill()
	t.Fatalf("daemon did not become healthy\nstdout:\n%s\nstderr:\n%s", stdout.String(), stderr.String())
}

func stopDaemon(t *testing.T, cmd *exec.Cmd, stdout *bytes.Buffer, stderr *bytes.Buffer) {
	t.Helper()
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Signal(os.Interrupt)
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("daemon exited with error: %v\nstdout:\n%s\nstderr:\n%s", err, stdout.String(), stderr.String())
		}
	case <-time.After(5 * time.Second):
		_ = cmd.Process.Kill()
		t.Fatalf("timed out waiting for daemon shutdown\nstdout:\n%s\nstderr:\n%s", stdout.String(), stderr.String())
	}
}

func parseSessionID(t *testing.T, output string) string {
	t.Helper()
	for _, line := range strings.Split(output, "\n") {
		if strings.HasPrefix(line, "Session: ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "Session: "))
		}
	}
	t.Fatalf("failed to parse session id from output:\n%s", output)
	return ""
}

func writeKnowledgeManifest(t *testing.T, root string) string {
	t.Helper()
	docsDir := filepath.Join(root, "docs", "sources")
	if err := os.MkdirAll(docsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "reference.md"), []byte(strings.TrimSpace(`
# Flogo Notes

- Use res://flow:<id> in flowURI settings.
- Mapping expressions should start with =.
- Task activities require a valid ref.
`)), 0o644); err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(docsDir, "manifest.json")
	manifest := `{"sources":[{"id":"reference","title":"Reference","type":"local_file","location":"docs/reference.md","tags":["official","flowuri","mapping","activity"]}]}`
	if err := os.WriteFile(manifestPath, []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	return manifestPath
}

func writeInvalidMappingRepo(t *testing.T, root string) string {
	t.Helper()
	repoPath := filepath.Join(root, "repo")
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatal(err)
	}
	contents := `{
  "name": "sample-app",
  "type": "flogo:app",
  "version": "1.0.0",
  "description": "benchmark fixture",
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
      "name": "rest",
      "settings": {
        "port": "8888"
      },
      "handlers": [
        {
          "settings": {
            "method": "GET",
            "path": "/test/:val"
          },
          "action": {
            "id": "runFlow",
            "ref": "#flow",
            "settings": {
              "flowURI": "main"
            },
            "input": {
              "message": "$flow.body"
            }
          }
        }
      ]
    }
  ],
  "appModel": "1.1.0",
  "resources": [
    {
      "id": "flow:main",
      "data": {
        "metadata": {
          "input": [
            {
              "name": "message",
              "type": "string"
            }
          ]
        },
        "tasks": [],
        "links": []
      }
    }
  ],
  "actions": []
}`
	if err := os.WriteFile(filepath.Join(repoPath, "flogo.json"), []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
	return repoPath
}

func writeEmptyRepo(t *testing.T, root string) string {
	t.Helper()
	repoPath := filepath.Join(root, "repo")
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatal(err)
	}
	return repoPath
}

func writeModelFallbackRepo(t *testing.T, root string) string {
	t.Helper()
	repoPath := filepath.Join(root, "repo")
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatal(err)
	}
	contents := `{
  "name": "demo",
  "type": "flogo:app",
  "version": "1.0.0",
  "appModel": "1.1.0",
  "description": "demo",
  "imports": [
    "github.com/project-flogo/flow",
    "github.com/project-flogo/contrib/activity/log"
  ],
  "properties": [],
  "channels": [],
  "triggers": [],
  "actions": [],
  "resources": [
    {
      "id": "flow:main",
      "data": {
        "metadata": {
          "input": [],
          "output": []
        },
        "tasks": [
          {
            "id": "log_message",
            "activity": {}
          }
        ],
        "links": []
      }
    }
  ]
}`
	if err := os.WriteFile(filepath.Join(repoPath, "flogo.json"), []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
	return repoPath
}

func fakeToolEnv(t *testing.T, root string) []string {
	t.Helper()
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	script := `#!/bin/sh
set -eu
cmd="${1:-}"
shift || true
case "$cmd" in
  list)
    if [ "${1:-}" = "--orphaned" ]; then
      printf '[]\n'
      exit 0
    fi
    exit 0
    ;;
  create)
    if [ "${1:-}" = "-f" ]; then
      src="$2"
      dst="$3"
      mkdir -p "$dst"
      cp "$src" "$dst/flogo.json"
      exit 0
    fi
    ;;
  build)
    mkdir -p "$PWD/bin"
    cat > "$PWD/bin/sample-app" <<'EOF'
#!/bin/sh
set -eu
if [ "${1:-}" = "-test" ] && [ "${2:-}" = "-flows" ]; then
  printf 'main\n'
  exit 0
fi
if [ "${1:-}" = "-test" ] && [ "${2:-}" = "-flowdata" ]; then
  printf '{}\n' > "$PWD/sample-app_main_input.json"
  exit 0
fi
output_dir=""
result_filename=""
flowout=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-dir)
      output_dir="$2"
      shift 2
      ;;
    --result-filename)
      result_filename="$2"
      shift 2
      ;;
    -flowout)
      flowout="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [ -n "$output_dir" ] && [ -n "$result_filename" ]; then
  mkdir -p "$output_dir"
  printf 'ok\n' > "$output_dir/$result_filename"
  exit 0
fi
if [ -n "$flowout" ]; then
  printf '{}\n' > "$flowout"
  exit 0
fi
exit 0
EOF
    chmod +x "$PWD/bin/sample-app"
    exit 0
    ;;
esac
printf 'unsupported fake flogo invocation: %s %s\n' "$cmd" "$*" >&2
exit 1
`
	scriptPath := filepath.Join(binDir, "flogo")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return []string{"PATH=" + binDir + ":" + os.Getenv("PATH")}
}

func runGit(t *testing.T, repoPath string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, string(output))
	}
}

func runGitCapture(t *testing.T, repoPath string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, string(output))
	}
	return string(output)
}

func execError(action string, err error, output string) error {
	return &commandError{action: action, err: err, output: output}
}

type commandError struct {
	action string
	err    error
	output string
}

func (e *commandError) Error() string {
	return e.action + ": " + e.err.Error() + "\n" + e.output
}
