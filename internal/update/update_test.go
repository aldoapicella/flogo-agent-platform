package update

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestFetchLatestParsesRelease(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name":     "v1.2.3",
			"published_at": "2026-03-27T00:00:00Z",
			"body":         "manual summary\n\n## What's Changed\n- item",
			"html_url":     "https://example.invalid/release/v1.2.3",
			"assets": []map[string]any{
				{"name": "flogo-agent_linux_amd64.tar.gz", "browser_download_url": "https://example.invalid/agent.tgz"},
				{"name": ChecksumAssetName, "browser_download_url": "https://example.invalid/checksums.txt"},
			},
		})
	}))
	defer server.Close()

	t.Setenv("FLOGO_AGENT_RELEASE_API_URL", server.URL)
	info, err := FetchLatest(context.Background(), "ignored/repo")
	if err != nil {
		t.Fatal(err)
	}
	if info.Version != "v1.2.3" {
		t.Fatalf("expected version v1.2.3, got %q", info.Version)
	}
	if _, ok := info.Asset("flogo-agent_linux_amd64.tar.gz"); !ok {
		t.Fatal("expected agent asset to be available")
	}
}

func TestIsUpdateAvailable(t *testing.T) {
	if !IsUpdateAvailable("v1.0.0", "v1.1.0") {
		t.Fatal("expected newer semver release to be available")
	}
	if IsUpdateAvailable("v1.1.0", "v1.1.0") {
		t.Fatal("did not expect same version to be treated as newer")
	}
	if IsUpdateAvailable("dev", "v1.1.0") {
		t.Fatal("did not expect dev builds to auto-update")
	}
}

func TestLoadAndSaveState(t *testing.T) {
	root := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", root)
	state := State{
		LastSeenVersion: "v1.2.3",
		SkippedVersion:  "v1.2.2",
	}
	if err := SaveState(state); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadState()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.LastSeenVersion != "v1.2.3" || loaded.SkippedVersion != "v1.2.2" {
		t.Fatalf("unexpected state: %+v", loaded)
	}
	path := filepath.Join(root, "flogo-agent", "updater.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected updater state at %s: %v", path, err)
	}
}
