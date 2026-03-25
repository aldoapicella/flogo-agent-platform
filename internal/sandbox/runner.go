package sandbox

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

type Profile string

const (
	ProfileLocal    Profile = "local"
	ProfileIsolated Profile = "isolated"
)

type Runner interface {
	Run(context.Context, contracts.ToolInvocation) (contracts.ToolResult, error)
}

type LocalRunner struct {
	artifactRoot string
}

func NewLocalRunner(artifactRoot string) *LocalRunner {
	return &LocalRunner{artifactRoot: artifactRoot}
}

func (r *LocalRunner) Run(ctx context.Context, invocation contracts.ToolInvocation) (contracts.ToolResult, error) {
	command := exec.CommandContext(ctx, invocation.ToolName, invocation.Args...)
	command.Dir = invocation.WorkDir

	env := os.Environ()
	for key, value := range invocation.Env {
		env = append(env, key+"="+value)
	}
	command.Env = env

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	result := contracts.ToolResult{
		ToolName: invocation.ToolName,
		Command:  strings.Join(append([]string{invocation.ToolName}, invocation.Args...), " "),
		ExitCode: -1,
	}

	runID := fmt.Sprintf("%d", time.Now().UnixNano())
	dir := filepath.Join(r.artifactRoot, runID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return result, err
	}

	err := command.Run()
	stdoutPath := filepath.Join(dir, "stdout.log")
	stderrPath := filepath.Join(dir, "stderr.log")
	if writeErr := os.WriteFile(stdoutPath, stdout.Bytes(), 0o644); writeErr != nil {
		return result, writeErr
	}
	if writeErr := os.WriteFile(stderrPath, stderr.Bytes(), 0o644); writeErr != nil {
		return result, writeErr
	}

	result.StdoutPath = stdoutPath
	result.StderrPath = stderrPath
	result.ArtifactPaths = []contracts.Artifact{
		{Kind: "stdout", Path: stdoutPath},
		{Kind: "stderr", Path: stderrPath},
	}

	if err == nil {
		result.ExitCode = 0
		return result, nil
	}

	if exitErr, ok := err.(*exec.ExitError); ok {
		result.ExitCode = exitErr.ExitCode()
		result.Error = exitErr.Error()
		return result, nil
	}
	result.Error = err.Error()
	return result, err
}

type DockerRunner struct {
	local        *LocalRunner
	artifactRoot string
	Image        string
	Runtime      string
}

func NewDockerRunner(artifactRoot string, image string, runtime string) *DockerRunner {
	return &DockerRunner{
		local:        NewLocalRunner(artifactRoot),
		artifactRoot: artifactRoot,
		Image:        image,
		Runtime:      runtime,
	}
}

func (r *DockerRunner) Run(ctx context.Context, invocation contracts.ToolInvocation) (contracts.ToolResult, error) {
	if r.Image == "" {
		return contracts.ToolResult{
			ToolName: invocation.ToolName,
			Command:  invocation.ToolName,
			ExitCode: -1,
			Error:    "isolated runner requires a container image",
		}, nil
	}

	args := []string{"run", "--rm"}
	if r.Runtime != "" {
		args = append(args, "--runtime", r.Runtime)
	}
	args = append(args, "-v", invocation.WorkDir+":/workspace", "-w", "/workspace", r.Image, invocation.ToolName)
	args = append(args, invocation.Args...)
	return r.local.Run(ctx, contracts.ToolInvocation{
		ToolName:  "docker",
		Args:      args,
		WorkDir:   invocation.WorkDir,
		EnvPolicy: invocation.EnvPolicy,
		Env:       invocation.Env,
	})
}
