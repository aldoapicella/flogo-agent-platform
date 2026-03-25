package tools

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
)

type BuildOptions struct {
	File        string
	Embed       bool
	Optimize    bool
	SyncImports bool
	Shim        string
}

type InstallOptions struct {
	File    string
	Replace string
}

type UpdateOptions struct {
	All bool
}

type UnitTestOptions struct {
	AppFile        string
	TestFile       string
	Suites         []string
	OutputDir      string
	ResultFilename string
}

type FlogoClient struct {
	runner sandbox.Runner
}

func NewFlogoClient(runner sandbox.Runner) *FlogoClient {
	return &FlogoClient{runner: runner}
}

func (c *FlogoClient) Available() bool {
	_, err := exec.LookPath("flogo")
	return err == nil
}

func (c *FlogoClient) Build(ctx context.Context, appPath string) (contracts.ToolResult, error) {
	return c.BuildWithOptions(ctx, appPath, BuildOptions{Embed: true})
}

func (c *FlogoClient) BuildWithOptions(ctx context.Context, appPath string, opts BuildOptions) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	args := []string{"build"}
	if opts.Embed {
		args = append(args, "-e")
	}
	if opts.Optimize {
		args = append(args, "-o")
	}
	if opts.SyncImports {
		args = append(args, "-s")
	}
	if opts.File != "" {
		args = append(args, "-f", opts.File)
	}
	if opts.Shim != "" {
		args = append(args, "--shim", opts.Shim)
	}

	result, err := c.runCLI(ctx, appPath, args...)
	if err != nil {
		return result, err
	}
	appendMatchingArtifacts(&result, "build-output", filepath.Join(appPath, "bin", "*"))
	return result, nil
}

func (c *FlogoClient) CreateSource(ctx context.Context, repoPath string, outputPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	workDir := repoPath
	target := outputPath
	if filepath.IsAbs(outputPath) {
		workDir = filepath.Dir(outputPath)
		target = filepath.Base(outputPath)
	}
	return c.runCLI(ctx, workDir, "create", "-f", filepath.Join(repoPath, "flogo.json"), target)
}

func (c *FlogoClient) ListContributions(ctx context.Context, repoPath string, filter string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	args := []string{"list", "-j"}
	if filter != "" {
		args = append(args, "--filter", filter)
	}
	return c.runCLI(ctx, repoPath, args...)
}

func (c *FlogoClient) ListOrphaned(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runCLI(ctx, repoPath, "list", "--orphaned", "-j")
}

func (c *FlogoClient) ImportsList(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runCLI(ctx, repoPath, "imports", "list")
}

func (c *FlogoClient) ImportsResolve(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runCLI(ctx, repoPath, "imports", "resolve")
}

func (c *FlogoClient) ImportsSync(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runCLI(ctx, repoPath, "imports", "sync")
}

func (c *FlogoClient) Install(ctx context.Context, repoPath string, dependency string, opts InstallOptions) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	args := []string{"install"}
	if opts.File != "" {
		args = append(args, "-f", opts.File)
	}
	if opts.Replace != "" {
		args = append(args, "-r", opts.Replace)
	}
	args = append(args, dependency)
	return c.runCLI(ctx, repoPath, args...)
}

func (c *FlogoClient) Update(ctx context.Context, repoPath string, dependency string, opts UpdateOptions) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	args := []string{"update"}
	if opts.All {
		args = append(args, "--all")
	} else if dependency != "" {
		args = append(args, dependency)
	}
	return c.runCLI(ctx, repoPath, args...)
}

func (c *FlogoClient) PluginInstall(ctx context.Context, repoPath string, source string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runCLI(ctx, repoPath, "plugin", "install", source)
}

func (c *FlogoClient) PluginList(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runCLI(ctx, repoPath, "plugin", "list")
}

func (c *FlogoClient) ListFlows(ctx context.Context, executablePath string, workDir string) (contracts.ToolResult, error) {
	return c.runExecutable(ctx, executablePath, workDir, "-test", "-flows")
}

func (c *FlogoClient) GenerateFlowData(ctx context.Context, executablePath string, workDir string, flowName string) (contracts.ToolResult, error) {
	result, err := c.runExecutable(ctx, executablePath, workDir, "-test", "-flowdata", flowName)
	if err != nil {
		return result, err
	}
	appendMatchingArtifacts(&result, "flow-input", filepath.Join(workDir, "*_input.json"))
	return result, nil
}

func (c *FlogoClient) RunFlowTest(ctx context.Context, executablePath string, workDir string, inputFile string, outputFile string) (contracts.ToolResult, error) {
	args := []string{"-test", "-flowin", inputFile}
	if outputFile != "" {
		args = append(args, "-flowout", outputFile)
	}
	result, err := c.runExecutable(ctx, executablePath, workDir, args...)
	if err != nil {
		return result, err
	}
	if outputFile != "" {
		appendExistingArtifact(&result, "flow-output", outputFile)
	}
	return result, nil
}

func (c *FlogoClient) RunUnitTests(ctx context.Context, executablePath string, workDir string, opts UnitTestOptions) (contracts.ToolResult, error) {
	args := []string{"-test"}
	if opts.AppFile != "" {
		args = append(args, "--app", opts.AppFile)
	}
	if opts.TestFile != "" {
		args = append(args, "--test-file", opts.TestFile)
	}
	if len(opts.Suites) > 0 {
		args = append(args, "--test-suites", strings.Join(opts.Suites, ","))
	}
	if opts.OutputDir != "" {
		args = append(args, "--output-dir", opts.OutputDir)
	}
	if opts.ResultFilename != "" {
		args = append(args, "--result-filename", opts.ResultFilename)
	}

	result, err := c.runExecutable(ctx, executablePath, workDir, args...)
	if err != nil {
		return result, err
	}
	if opts.OutputDir != "" {
		appendMatchingArtifacts(&result, "test-result", filepath.Join(opts.OutputDir, "*.testresult"))
	}
	return result, nil
}

func (c *FlogoClient) StartupSmoke(ctx context.Context, executablePath string, workDir string, timeout time.Duration) (contracts.ToolResult, error) {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}

	smokeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	result, err := c.runExecutable(smokeCtx, executablePath, workDir)
	if errors.Is(smokeCtx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
		result.ExitCode = 0
		result.Error = ""
		return result, nil
	}
	return result, err
}

func (c *FlogoClient) FindExecutable(appPath string) (string, error) {
	binDir := filepath.Join(appPath, "bin")
	entries, err := os.ReadDir(binDir)
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(binDir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			return "", err
		}
		if info.Mode()&0o111 != 0 || strings.HasSuffix(entry.Name(), ".exe") {
			return path, nil
		}
	}
	return "", errors.New("no built executable found under bin/")
}

func (c *FlogoClient) runCLI(ctx context.Context, repoPath string, args ...string) (contracts.ToolResult, error) {
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "flogo",
		Args:      args,
		WorkDir:   repoPath,
		EnvPolicy: "default",
		Env:       flogoEnv(),
	})
}

func (c *FlogoClient) runExecutable(ctx context.Context, executablePath string, workDir string, args ...string) (contracts.ToolResult, error) {
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  executablePath,
		Args:      args,
		WorkDir:   workDir,
		EnvPolicy: "default",
	})
}

type GitClient struct {
	runner sandbox.Runner
}

func NewGitClient(runner sandbox.Runner) *GitClient {
	return &GitClient{runner: runner}
}

func (c *GitClient) Status(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	return c.run(ctx, repoPath, "status", "--short")
}

func (c *GitClient) Diff(ctx context.Context, repoPath string, staged bool) (contracts.ToolResult, error) {
	args := []string{"diff", "--no-ext-diff"}
	if staged {
		args = append(args, "--cached")
	}
	return c.run(ctx, repoPath, args...)
}

func (c *GitClient) CurrentBranch(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	return c.run(ctx, repoPath, "rev-parse", "--abbrev-ref", "HEAD")
}

func (c *GitClient) CreateBranch(ctx context.Context, repoPath string, branch string, checkout bool) (contracts.ToolResult, error) {
	args := []string{"branch"}
	if checkout {
		args = []string{"checkout", "-b"}
	}
	args = append(args, branch)
	return c.run(ctx, repoPath, args...)
}

func (c *GitClient) CommitAll(ctx context.Context, repoPath string, message string) (contracts.ToolResult, error) {
	addResult, err := c.run(ctx, repoPath, "add", "-A")
	if err != nil {
		return contracts.ToolResult{}, err
	}
	if addResult.ExitCode != 0 {
		return addResult, nil
	}
	return c.run(ctx, repoPath, "commit", "-m", message)
}

func (c *GitClient) run(ctx context.Context, repoPath string, args ...string) (contracts.ToolResult, error) {
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "git",
		Args:      args,
		WorkDir:   repoPath,
		EnvPolicy: "local",
	})
}

func appendExistingArtifact(result *contracts.ToolResult, kind string, path string) {
	if path == "" {
		return
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return
	}
	appendArtifact(result, kind, path)
}

func appendMatchingArtifacts(result *contracts.ToolResult, kind string, pattern string) {
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return
	}
	for _, match := range matches {
		appendExistingArtifact(result, kind, match)
	}
}

func appendArtifact(result *contracts.ToolResult, kind string, path string) {
	for _, existing := range result.ArtifactPaths {
		if existing.Path == path {
			return
		}
	}
	result.ArtifactPaths = append(result.ArtifactPaths, contracts.Artifact{
		Kind: kind,
		Path: path,
	})
}

func missingBinaryResult(name string) contracts.ToolResult {
	return contracts.ToolResult{
		ToolName: name,
		Command:  name,
		ExitCode: -1,
		Error:    errors.New("required binary not found in PATH").Error(),
	}
}

func flogoEnv() map[string]string {
	env := map[string]string{}
	if value := strings.TrimSpace(os.Getenv("GOPATH")); value != "" {
		env["GOPATH"] = value
		return env
	}

	output, err := exec.Command("go", "env", "GOPATH").Output()
	if err != nil {
		return env
	}
	if value := strings.TrimSpace(string(output)); value != "" {
		env["GOPATH"] = value
	}
	return env
}
