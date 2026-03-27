package main

import (
	"bufio"
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/config"
	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	agentruntime "github.com/aldoapicella/flogo-agent-platform/internal/runtime"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
	"github.com/aldoapicella/flogo-agent-platform/internal/ui"
)

type interactiveOptions struct {
	repoPath      string
	goal          string
	mode          string
	stateDir      string
	sources       string
	daemonURL     string
	listenAddr    string
	sessionID     string
	sandboxConfig sandbox.Config
}

type daemonHandle struct {
	client  *agentruntime.Client
	cmd     *exec.Cmd
	logFile *os.File
	logPath string
	started bool
}

func launchInteractive(opts interactiveOptions) error {
	repoPath, err := resolveRepoPath(opts.repoPath)
	if err != nil {
		return err
	}
	if err := loadDefaultEnv(repoPath); err != nil {
		return err
	}

	if opts.stateDir == "" {
		opts.stateDir = filepath.Join(repoPath, ".flogo-agent")
	}
	if opts.sources == "" {
		opts.sources = resolveInteractiveSources(repoPath)
	}
	if opts.daemonURL == "" {
		opts.daemonURL = "http://" + opts.listenAddr
	}

	opts.repoPath = repoPath

	ctx := context.Background()
	if _, err := ensureAgentModelInteractive(); err != nil {
		return err
	}
	if err := ensureFlogoCLIInteractive(); err != nil {
		return err
	}
	if restarted, err := maybeApplyStartupUpdateInteractive(ctx, opts); err != nil {
		return err
	} else if restarted {
		return nil
	}
	handle, err := ensureDaemon(ctx, opts)
	if err != nil {
		return err
	}
	defer handle.Close()

	return ui.New(handle.client).Run(
		ctx,
		opts.repoPath,
		opts.goal,
		contracts.SessionMode(opts.mode),
		opts.stateDir,
		opts.sources,
		opts.sandboxConfig,
		opts.sessionID,
	)
}

func resolveRepoPath(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		path = "."
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	if err := session.EnsureRepoPath(absolute); err != nil {
		return "", err
	}
	return absolute, nil
}

func resolveInteractiveSources(repoPath string) string {
	candidates := []string{
		filepath.Join(repoPath, "docs", "sources", "manifest.json"),
		filepath.Join(mustRepoRoot(), "docs", "sources", "manifest.json"),
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return ""
}

func loadDefaultEnv(repoPath string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	if err := loadDotEnvFiles(cwd, repoPath); err != nil {
		return err
	}
	if err := config.LoadIntoEnv(); err != nil {
		return err
	}
	ensureToolPath(cwd, repoPath)
	return nil
}

func loadDotEnvFiles(dirs ...string) error {
	seen := map[string]struct{}{}
	for _, dir := range dirs {
		if strings.TrimSpace(dir) == "" {
			continue
		}
		absolute, err := filepath.Abs(dir)
		if err != nil {
			return err
		}
		if _, ok := seen[absolute]; ok {
			continue
		}
		seen[absolute] = struct{}{}
		if err := loadDotEnvFile(filepath.Join(absolute, ".env")); err != nil {
			return err
		}
	}
	return nil
}

func loadDotEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		if err := os.Setenv(key, value); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func ensureToolPath(dirs ...string) {
	if err := prependManagedToolPath(); err == nil {
		if _, err := exec.LookPath("flogo"); err == nil {
			return
		}
	}
	if _, err := exec.LookPath("flogo"); err == nil {
		return
	}

	candidates := make([]string, 0, len(dirs)+1)
	seen := map[string]struct{}{}
	addCandidate := func(dir string) {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			return
		}
		absolute, err := filepath.Abs(dir)
		if err != nil {
			return
		}
		toolDir := filepath.Join(absolute, ".tools", "bin")
		if _, ok := seen[toolDir]; ok {
			return
		}
		if info, err := os.Stat(filepath.Join(toolDir, "flogo")); err == nil && !info.IsDir() {
			seen[toolDir] = struct{}{}
			candidates = append(candidates, toolDir)
		}
	}

	for _, dir := range dirs {
		addCandidate(dir)
	}
	if gopathBin := goPathBin(); gopathBin != "" {
		if _, ok := seen[gopathBin]; !ok {
			if info, err := os.Stat(filepath.Join(gopathBin, "flogo")); err == nil && !info.IsDir() {
				seen[gopathBin] = struct{}{}
				candidates = append(candidates, gopathBin)
			}
		}
	}
	if len(candidates) == 0 {
		return
	}

	existing := os.Getenv("PATH")
	parts := make([]string, 0, len(candidates)+1)
	parts = append(parts, candidates...)
	if existing != "" {
		parts = append(parts, existing)
	}
	_ = os.Setenv("PATH", strings.Join(parts, string(os.PathListSeparator)))
}

func prependManagedToolPath() error {
	binDir, err := config.ManagedBinDir()
	if err != nil {
		return err
	}
	managedTool, err := config.ManagedToolPath("flogo")
	if err != nil {
		return err
	}
	if info, statErr := os.Stat(managedTool); statErr != nil || info.IsDir() {
		return nil
	}
	parts := strings.Split(os.Getenv("PATH"), string(os.PathListSeparator))
	for _, part := range parts {
		if samePath(part, binDir) {
			return nil
		}
	}
	if existing := os.Getenv("PATH"); existing != "" {
		return os.Setenv("PATH", binDir+string(os.PathListSeparator)+existing)
	}
	return os.Setenv("PATH", binDir)
}

func goPathBin() string {
	if value := strings.TrimSpace(os.Getenv("GOPATH")); value != "" {
		return filepath.Join(value, "bin")
	}
	output, err := exec.Command("go", "env", "GOPATH").Output()
	if err != nil {
		return ""
	}
	value := strings.TrimSpace(string(output))
	if value == "" {
		return ""
	}
	return filepath.Join(value, "bin")
}

func ensureDaemon(ctx context.Context, opts interactiveOptions) (*daemonHandle, error) {
	client := agentruntime.NewClient(opts.daemonURL)
	if err := client.Health(ctx); err == nil {
		return &daemonHandle{client: client}, nil
	}

	expectedURL := "http://" + strings.TrimSpace(opts.listenAddr)
	if !sameBaseURL(opts.daemonURL, expectedURL) {
		return nil, fmt.Errorf("daemon at %s is unreachable; automatic startup only supports local --daemon-url matching --listen (%s)", opts.daemonURL, expectedURL)
	}
	if _, err := ensureAgentModelInteractive(); err != nil {
		return nil, err
	}
	if err := ensureFlogoCLIInteractive(); err != nil {
		return nil, err
	}

	if err := os.MkdirAll(opts.stateDir, 0o755); err != nil {
		return nil, err
	}
	logPath := filepath.Join(opts.stateDir, "daemon.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}

	executable, err := os.Executable()
	if err != nil {
		_ = logFile.Close()
		return nil, err
	}

	args := []string{
		"daemon",
		"--listen", opts.listenAddr,
		"--state-dir", opts.stateDir,
		"--sources", opts.sources,
		"--sandbox", string(opts.sandboxConfig.Profile),
		"--sandbox-network", opts.sandboxConfig.Network,
	}
	if opts.sandboxConfig.Image != "" {
		args = append(args, "--sandbox-image", opts.sandboxConfig.Image)
	}
	if opts.sandboxConfig.Runtime != "" {
		args = append(args, "--sandbox-runtime", opts.sandboxConfig.Runtime)
	}

	cmd := exec.Command(executable, args...)
	cmd.Dir = opts.repoPath
	cmd.Env = os.Environ()
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		_ = logFile.Close()
		return nil, err
	}

	handle := &daemonHandle{
		client:  client,
		cmd:     cmd,
		logFile: logFile,
		logPath: logPath,
		started: true,
	}
	if err := waitForDaemon(ctx, client, cmd, logPath); err != nil {
		_ = handle.Close()
		return nil, err
	}
	return handle, nil
}

func sameBaseURL(left string, right string) bool {
	leftURL, leftErr := url.Parse(strings.TrimSpace(left))
	rightURL, rightErr := url.Parse(strings.TrimSpace(right))
	if leftErr != nil || rightErr != nil {
		return strings.TrimRight(strings.TrimSpace(left), "/") == strings.TrimRight(strings.TrimSpace(right), "/")
	}
	return strings.TrimRight(leftURL.String(), "/") == strings.TrimRight(rightURL.String(), "/")
}

func waitForDaemon(ctx context.Context, client *agentruntime.Client, cmd *exec.Cmd, logPath string) error {
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if err := client.Health(ctx); err == nil {
			return nil
		}
		if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
			return fmt.Errorf("daemon exited before becoming healthy; inspect %s", logPath)
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("daemon did not become healthy in time; inspect %s", logPath)
}

func (h *daemonHandle) Close() error {
	if h == nil {
		return nil
	}
	defer func() {
		if h.logFile != nil {
			_ = h.logFile.Close()
		}
	}()

	if !h.started || h.cmd == nil || h.cmd.Process == nil {
		return nil
	}

	_ = h.cmd.Process.Signal(os.Interrupt)
	done := make(chan error, 1)
	go func() {
		done <- h.cmd.Wait()
	}()

	select {
	case <-time.After(5 * time.Second):
		_ = h.cmd.Process.Kill()
		<-done
	case <-done:
	}
	return nil
}
