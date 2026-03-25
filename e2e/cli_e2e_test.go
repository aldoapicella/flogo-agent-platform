package e2e

import (
	"bytes"
	"net"
	"net/http"
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
