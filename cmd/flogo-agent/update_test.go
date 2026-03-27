package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/update"
)

func TestCheckLatestReleaseSavesState(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name":     "v0.2.0",
			"published_at": "2026-03-27T00:00:00Z",
			"body":         "Summary\n\n## What's Changed\n- Added startup updates",
			"html_url":     "https://example.invalid/releases/v0.2.0",
			"assets":       []map[string]any{},
		})
	}))
	defer server.Close()

	oldVersion := version
	defer func() { version = oldVersion }()
	version = "v0.1.0"
	t.Setenv("FLOGO_AGENT_RELEASE_API_URL", server.URL)

	result, err := checkLatestRelease(context.Background(), true)
	if err != nil {
		t.Fatal(err)
	}
	if result.Info == nil || result.Info.Version != "v0.2.0" {
		t.Fatalf("unexpected release info: %+v", result.Info)
	}
	if result.State.LastSeenVersion != "v0.2.0" {
		t.Fatalf("expected state to persist latest version, got %+v", result.State)
	}
}

func TestApplyReleaseUpdateInstallsBinary(t *testing.T) {
	root := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", root)
	info, server := startFakeAgentReleaseServer(t)
	defer server.Close()

	target := filepath.Join(root, "bin", "flogo-agent")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}

	oldVersion := version
	oldExecutablePath := executablePath
	oldInstallManaged := installManagedReleaseTool
	defer func() {
		version = oldVersion
		executablePath = oldExecutablePath
		installManagedReleaseTool = oldInstallManaged
	}()
	version = "v0.1.0"
	executablePath = func() (string, error) { return target, nil }
	installManagedReleaseTool = func(toolName string, binaryName string, releaseVersion string, assetURL string, checksumURL string) error {
		return nil
	}

	applied, err := applyReleaseUpdate(context.Background(), info, updateApplyOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !applied {
		t.Fatal("expected update to apply")
	}
	contents, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "new-agent") {
		t.Fatalf("expected updated binary contents, got %q", string(contents))
	}
}

func TestHandleUpdateDecisionSkipPersistsVersion(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	result := latestReleaseResult{
		Info:  &update.ReleaseInfo{Version: "v0.2.0"},
		State: update.State{},
	}
	handled, err := handleUpdateDecision(context.Background(), string(updateDecisionSkip), result, updateApplyOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if handled {
		t.Fatal("skip should not report an applied update")
	}
	state, err := update.LoadState()
	if err != nil {
		t.Fatal(err)
	}
	if state.SkippedVersion != "v0.2.0" {
		t.Fatalf("expected skipped version to persist, got %+v", state)
	}
}

func startFakeAgentReleaseServer(t *testing.T) (*update.ReleaseInfo, *httptest.Server) {
	t.Helper()
	root := t.TempDir()
	agentAssetName := update.AssetArchiveName("flogo-agent")
	archivePath := filepath.Join(root, agentAssetName)
	writeFakeTarGz(t, archivePath, "flogo-agent", []byte("#!/bin/sh\necho new-agent\n"))
	sum := sha256.Sum256(mustReadFile(t, archivePath))
	checksumLine := fmt.Sprintf("%x  %s\n", sum, agentAssetName)
	if err := os.WriteFile(filepath.Join(root, update.ChecksumAssetName), []byte(checksumLine), 0o644); err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/asset/" + agentAssetName:
			http.ServeFile(w, r, archivePath)
		case "/asset/" + update.ChecksumAssetName:
			http.ServeFile(w, r, filepath.Join(root, update.ChecksumAssetName))
		default:
			http.NotFound(w, r)
		}
	}))

	info := &update.ReleaseInfo{
		Version:     "v0.2.0",
		PublishedAt: "2026-03-27T00:00:00Z",
		Body:        "Summary\n\n## What's Changed\n- Added updater",
		HTMLURL:     "https://example.invalid/releases/v0.2.0",
		Assets: []update.ReleaseAsset{
			{Name: agentAssetName, URL: server.URL + "/asset/" + agentAssetName},
			{Name: update.ChecksumAssetName, URL: server.URL + "/asset/" + update.ChecksumAssetName},
		},
	}
	return info, server
}
