//go:build !windows

package e2e

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/creack/pty"

	"github.com/aldoapicella/flogo-agent-platform/internal/config"
)

func TestDaemonWithoutAPIKeyFailsNonInteractiveE2E(t *testing.T) {
	root := t.TempDir()
	stateDir := filepath.Join(root, "state")
	addr := freeAddress(t)

	stdout, stderr, err := runAgent(t, root, []string{
		"OPENAI_API_KEY=",
		"XDG_CONFIG_HOME=" + filepath.Join(root, "config"),
	}, "daemon", "--listen", addr, "--state-dir", stateDir)
	if err == nil {
		t.Fatal("expected daemon startup without api key to fail in non-interactive mode")
	}
	combined := stdout + stderr
	if !strings.Contains(combined, "OPENAI_API_KEY is required for agent commands") {
		t.Fatalf("expected missing api key error, got:\n%s", combined)
	}
}

func TestRootCommandShowsModelAPIKeyPromptOnTTYE2E(t *testing.T) {
	root := t.TempDir()
	repoPath := writeEmptyRepo(t, root)
	configHome := filepath.Join(root, "config")

	proc := startAgentPTY(t, root, []string{
		"OPENAI_API_KEY=",
		"XDG_CONFIG_HOME=" + configHome,
	}, "--repo", repoPath)
	defer stopAgentPTY(t, proc, false)

	waitForPTYOutput(t, proc, "Model API Key", 5*time.Second)
	_, _ = proc.tty.Write([]byte{3})
	time.Sleep(200 * time.Millisecond)
	path, err := configPathForTest(configHome)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected no stored credentials after cancel, err=%v", err)
	}
}

func TestDaemonPromptsForAPIKeyOnTTYAndPersistsE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	stateDir := filepath.Join(root, "state")
	addr := freeAddress(t)
	configHome := filepath.Join(root, "config")
	fakePath := writeFakeFlogoBinary(t, root)
	t.Setenv("XDG_CONFIG_HOME", configHome)

	proc := startAgentPTY(t, root, []string{
		"OPENAI_API_KEY=",
		"PATH=" + fakePath + string(os.PathListSeparator) + os.Getenv("PATH"),
		"XDG_CONFIG_HOME=" + configHome,
	}, "daemon", "--listen", addr, "--state-dir", stateDir, "--sources", manifest)
	defer stopAgentPTY(t, proc, false)

	waitForPTYOutput(t, proc, "Model API Key", 5*time.Second)
	if _, err := proc.tty.Write([]byte("prompted-key\n")); err != nil {
		t.Fatalf("write api key to prompt: %v", err)
	}
	waitForPTYHealth(t, "http://"+addr, proc, 10*time.Second)

	creds, err := config.LoadStoredCredentials()
	if err != nil {
		t.Fatal(err)
	}
	if creds == nil || creds.APIKey != "prompted-key" {
		t.Fatalf("expected persisted prompted key, got %+v", creds)
	}
}

func TestStoredCredentialsAllowNonInteractiveDaemonStartE2E(t *testing.T) {
	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	stateDir := filepath.Join(root, "state")
	addr := freeAddress(t)
	configHome := filepath.Join(root, "config")
	fakePath := writeFakeFlogoBinary(t, root)
	t.Setenv("XDG_CONFIG_HOME", configHome)

	if err := config.SaveStoredCredentials("openai", "stored-key"); err != nil {
		t.Fatal(err)
	}

	daemon, daemonStdout, daemonStderr := startDaemon(t, root, []string{
		"OPENAI_API_KEY=",
		"PATH=" + fakePath + string(os.PathListSeparator) + os.Getenv("PATH"),
		"XDG_CONFIG_HOME=" + configHome,
	}, addr, stateDir, manifest)
	defer stopDaemon(t, daemon, daemonStdout, daemonStderr)
}

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

type ptyProcess struct {
	cmd    *exec.Cmd
	tty    *os.File
	output *syncBuffer
}

func startAgentPTY(t *testing.T, workdir string, extraEnv []string, args ...string) *ptyProcess {
	t.Helper()
	cmd := exec.Command(agentBinary(t), args...)
	cmd.Dir = workdir
	env := mergeEnv(os.Environ(), extraEnv)
	if !envContainsKey(env, "TERM") || strings.TrimSpace(envValue(env, "TERM")) == "" {
		env = mergeEnv(env, []string{"TERM=xterm-256color"})
	}
	cmd.Env = env
	tty, err := pty.Start(cmd)
	if err != nil {
		t.Fatalf("start PTY process: %v", err)
	}
	buffer := &syncBuffer{}
	go func() {
		_, _ = io.Copy(buffer, tty)
	}()
	return &ptyProcess{cmd: cmd, tty: tty, output: buffer}
}

func envContainsKey(env []string, key string) bool {
	for _, item := range env {
		parts := strings.SplitN(item, "=", 2)
		if parts[0] == key {
			return true
		}
	}
	return false
}

func envValue(env []string, key string) string {
	for _, item := range env {
		parts := strings.SplitN(item, "=", 2)
		if parts[0] == key {
			if len(parts) == 2 {
				return parts[1]
			}
			return ""
		}
	}
	return ""
}

func waitForPTYOutput(t *testing.T, proc *ptyProcess, want string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if strings.Contains(proc.output.String(), want) {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	_ = proc.cmd.Process.Kill()
	t.Fatalf("expected PTY output %q, got:\n%s", want, proc.output.String())
}

func waitForPTYHealth(t *testing.T, baseURL string, proc *ptyProcess, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := http.Get(baseURL + "/healthz")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	_ = proc.cmd.Process.Kill()
	t.Fatalf("daemon did not become healthy\npty output:\n%s", proc.output.String())
}

func stopAgentPTY(t *testing.T, proc *ptyProcess, requireCleanExit bool) {
	t.Helper()
	if proc == nil || proc.cmd == nil || proc.cmd.Process == nil {
		return
	}
	_ = proc.cmd.Process.Signal(os.Interrupt)
	done := make(chan error, 1)
	go func() {
		done <- proc.cmd.Wait()
	}()
	select {
	case err := <-done:
		if requireCleanExit && err != nil {
			t.Fatalf("pty process exited with error: %v\npty output:\n%s", err, proc.output.String())
		}
	case <-time.After(5 * time.Second):
		_ = proc.cmd.Process.Kill()
		<-done
		if requireCleanExit {
			t.Fatalf("timed out waiting for PTY process shutdown\npty output:\n%s", proc.output.String())
		}
	}
	_ = proc.tty.Close()
}

func configPathForTest(configHome string) (string, error) {
	old, had := os.LookupEnv("XDG_CONFIG_HOME")
	defer func() {
		if had {
			_ = os.Setenv("XDG_CONFIG_HOME", old)
		} else {
			_ = os.Unsetenv("XDG_CONFIG_HOME")
		}
	}()
	if err := os.Setenv("XDG_CONFIG_HOME", configHome); err != nil {
		return "", err
	}
	return config.CredentialsPath()
}

func writeFakeFlogoBinary(t *testing.T, root string) string {
	t.Helper()
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(binDir, "flogo")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return binDir
}
