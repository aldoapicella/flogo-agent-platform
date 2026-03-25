package runtime

import (
	"context"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func TestClientStreamSessionReceivesSnapshots(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	manifestPath, repoPath := writeRuntimeFixture(t, root, false)

	manager, err := NewManager(ctx, root, filepath.Join(root, "state"), manifestPath, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()

	server := NewServer("127.0.0.1:0", manager)
	httpServer := httptest.NewServer(server.server.Handler)
	defer httpServer.Close()

	client := NewClient(httpServer.URL)
	snapshot, err := client.CreateSession(ctx, contracts.SessionRequest{
		RepoPath: repoPath,
		Goal:     "inspect the Flogo app",
		Mode:     contracts.ModeReview,
	})
	if err != nil {
		t.Fatal(err)
	}

	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	events := make(chan contracts.SessionStreamEvent, 16)
	errs := make(chan error, 1)
	go func() {
		errs <- client.StreamSession(streamCtx, snapshot.ID, func(event contracts.SessionStreamEvent) error {
			events <- event
			return nil
		})
	}()

	select {
	case event := <-events:
		if event.Snapshot == nil || event.Snapshot.ID != snapshot.ID {
			t.Fatalf("expected initial snapshot for session %s, got %+v", snapshot.ID, event)
		}
	case err := <-errs:
		if err != nil {
			t.Fatalf("stream session returned error before first event: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for initial session snapshot")
	}

	if _, err := client.SendMessage(ctx, snapshot.ID, "inspect the app"); err != nil {
		t.Fatal(err)
	}

	deadline := time.After(5 * time.Second)
	receivedUpdate := false
	for !receivedUpdate {
		select {
		case event := <-events:
			if event.Snapshot != nil && len(event.Snapshot.Messages) >= 3 && event.Snapshot.LastTurnPlan != nil {
				receivedUpdate = true
			}
		case err := <-errs:
			if err != nil && err != context.Canceled {
				t.Fatalf("stream session returned error: %v", err)
			}
		case <-deadline:
			t.Fatal("timed out waiting for streamed session update")
		}
	}

	cancel()
	select {
	case err := <-errs:
		if err != nil && err != context.Canceled {
			t.Fatalf("expected canceled stream, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for stream shutdown")
	}
}
