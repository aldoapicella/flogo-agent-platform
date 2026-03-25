package ui

import (
	"path/filepath"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestFindLatestSessionForRepoMatchesNormalizedPath(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "repo")

	items := []contracts.SessionSnapshot{
		{ID: "session-1", RepoPath: filepath.Join(root, "other")},
		{ID: "session-2", RepoPath: repo},
		{ID: "session-3", RepoPath: filepath.Join(repo, ".")},
	}

	match := findLatestSessionForRepo(items, filepath.Join(repo, "."))
	if match == nil {
		t.Fatal("expected a matching session")
	}
	if match.ID != "session-2" {
		t.Fatalf("expected first most-recent matching session, got %+v", match)
	}
}

func TestSameRepoPathNormalizesEquivalentPaths(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "repo")

	if !sameRepoPath(repo, filepath.Join(repo, ".")) {
		t.Fatal("expected equivalent repo paths to match")
	}
}
