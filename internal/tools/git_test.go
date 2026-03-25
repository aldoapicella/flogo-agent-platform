package tools

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
)

func TestGitClientDiffCreateBranchAndCommit(t *testing.T) {
	ctx := context.Background()
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

	client := NewGitClient(sandbox.NewLocalRunner(filepath.Join(root, "artifacts")))
	if result, err := client.CommitAll(ctx, repoPath, "initial commit"); err != nil {
		t.Fatal(err)
	} else if result.ExitCode != 0 {
		t.Fatalf("expected commit success, got %+v", result)
	}

	if err := os.WriteFile(filepath.Join(repoPath, "README.md"), []byte("hello\nworld\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	diff, err := client.Diff(ctx, repoPath, false)
	if err != nil {
		t.Fatal(err)
	}
	if diff.ExitCode != 0 {
		t.Fatalf("expected diff success, got %+v", diff)
	}
	stdout, err := os.ReadFile(diff.StdoutPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(stdout), "+world") {
		t.Fatalf("expected diff output, got %q", string(stdout))
	}

	branch, err := client.CreateBranch(ctx, repoPath, "feature/test", true)
	if err != nil {
		t.Fatal(err)
	}
	if branch.ExitCode != 0 {
		t.Fatalf("expected branch creation success, got %+v", branch)
	}

	current, err := client.CurrentBranch(ctx, repoPath)
	if err != nil {
		t.Fatal(err)
	}
	if current.ExitCode != 0 {
		t.Fatalf("expected current branch success, got %+v", current)
	}
	name, err := os.ReadFile(current.StdoutPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(name)) != "feature/test" {
		t.Fatalf("expected feature/test, got %q", string(name))
	}
}

func runGit(t *testing.T, repoPath string, args ...string) {
	t.Helper()
	client := NewGitClient(sandbox.NewLocalRunner(filepath.Join(repoPath, ".artifacts")))
	result, err := client.run(context.Background(), repoPath, args...)
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 0 {
		stderr, _ := os.ReadFile(result.StderrPath)
		t.Fatalf("git %v failed: %s", args, strings.TrimSpace(string(stderr)))
	}
}
