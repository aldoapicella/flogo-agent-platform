package tools

import (
	"context"
	"errors"
	"os/exec"
	"path/filepath"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
)

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
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "flogo",
		Args:      []string{"build", "-e"},
		WorkDir:   appPath,
		EnvPolicy: "default",
	})
}

func (c *FlogoClient) CreateSource(ctx context.Context, repoPath string, outputPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "flogo",
		Args:      []string{"create", "-f", filepath.Join(repoPath, "flogo.json"), outputPath},
		WorkDir:   repoPath,
		EnvPolicy: "default",
	})
}

func (c *FlogoClient) ListOrphaned(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "flogo",
		Args:      []string{"list", "--orphaned"},
		WorkDir:   repoPath,
		EnvPolicy: "default",
	})
}

func (c *FlogoClient) RunFlowTests(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "flogo",
		Args:      []string{"test"},
		WorkDir:   repoPath,
		EnvPolicy: "default",
	})
}

func (c *FlogoClient) RunUnitTests(ctx context.Context, repoPath string) (contracts.ToolResult, error) {
	if !c.Available() {
		return missingBinaryResult("flogo"), nil
	}
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "flogo",
		Args:      []string{"test", "--test", ".flogotest"},
		WorkDir:   repoPath,
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
	return c.runner.Run(ctx, contracts.ToolInvocation{
		ToolName:  "git",
		Args:      []string{"status", "--short"},
		WorkDir:   repoPath,
		EnvPolicy: "local",
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
