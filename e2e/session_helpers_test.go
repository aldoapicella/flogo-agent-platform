package e2e

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	agentruntime "github.com/aldoapicella/flogo-agent-platform/internal/runtime"
)

func fetchSessionSnapshot(t *testing.T, client *agentruntime.Client, sessionID string) *contracts.SessionSnapshot {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	snapshot, err := client.GetSession(ctx, sessionID)
	if err != nil {
		t.Fatalf("fetch session snapshot %s: %v", sessionID, err)
	}
	return snapshot
}

type transcriptExpectation struct {
	Role     contracts.MessageRole
	Contains string
}

func assertTranscriptSequence(t *testing.T, messages []contracts.ChatMessage, expected []transcriptExpectation) {
	t.Helper()
	if len(expected) == 0 {
		return
	}
	index := 0
	for _, message := range messages {
		if index >= len(expected) {
			return
		}
		want := expected[index]
		if message.Role != want.Role {
			continue
		}
		if !strings.Contains(strings.ToLower(message.Content), strings.ToLower(want.Contains)) {
			continue
		}
		index++
	}
	if index != len(expected) {
		t.Fatalf("expected transcript sequence %+v, got %+v", expected, messages)
	}
}

func realToolEnv(t *testing.T) []string {
	t.Helper()
	candidates := []string{
		filepath.Join(repoRoot(t), ".tools", "bin"),
	}
	path := os.Getenv("PATH")
	for _, candidate := range candidates {
		if info, err := os.Stat(filepath.Join(candidate, "flogo")); err == nil && !info.IsDir() {
			path = candidate + string(os.PathListSeparator) + path
			break
		}
	}
	return []string{"PATH=" + path}
}
