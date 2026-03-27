package ui

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCaptureScriptedReviewWritesExpectedArtifacts(t *testing.T) {
	repoPath := t.TempDir()
	outDir := filepath.Join(t.TempDir(), "ui-review")

	captures, err := CaptureScriptedReview(context.Background(), outDir, repoPath, 110, 34)
	if err != nil {
		t.Fatal(err)
	}
	if len(captures) != 6 {
		t.Fatalf("expected 6 captures, got %d", len(captures))
	}

	byName := make(map[string]ReviewCapture, len(captures))
	for _, capture := range captures {
		byName[capture.Name] = capture
		if _, err := os.Stat(capture.Path); err != nil {
			t.Fatalf("expected screenshot %s to exist: %v", capture.Path, err)
		}
		metadataPath := filepath.Join(outDir, capture.Name+".json")
		if _, err := os.Stat(metadataPath); err != nil {
			t.Fatalf("expected metadata %s to exist: %v", metadataPath, err)
		}
	}

	if got := byName["startup-loading"].ScreenText; got == "" {
		t.Fatal("expected startup-loading screen text to be captured")
	}
	if got := byName["diff-view"].ScreenText; got == "" || !containsAll(got, "@@", "res://flow:main") {
		t.Fatalf("expected diff capture to include semantic diff excerpt, got %q", got)
	}
	if got := byName["session-picker"].ScreenText; got == "" || !containsAll(got, "Sessions", "ui-review-session") {
		t.Fatalf("expected session picker capture to include overlay text, got %q", got)
	}
}

func containsAll(text string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(text, part) {
			return false
		}
	}
	return true
}
