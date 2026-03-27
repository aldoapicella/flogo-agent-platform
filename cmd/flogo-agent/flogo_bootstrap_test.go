package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/config"
	"github.com/aldoapicella/flogo-agent-platform/internal/update"
)

func TestEnsureFlogoCLIFailsWithoutTTY(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "test-key")
	t.Setenv("PATH", "")
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	oldTTY := stdioIsTerminal
	oldLookPath := lookPath
	defer func() {
		stdioIsTerminal = oldTTY
		lookPath = oldLookPath
	}()

	stdioIsTerminal = func() bool { return false }
	lookPath = func(file string) (string, error) {
		return "", os.ErrNotExist
	}

	err := ensureFlogoCLICLI()
	if err == nil {
		t.Fatal("expected missing flogo cli error")
	}
}

func TestSetupFlogoCLIInstallsManagedBinary(t *testing.T) {
	root := t.TempDir()
	configHome := filepath.Join(root, "config")
	t.Setenv("XDG_CONFIG_HOME", configHome)
	server, assetName := startFakeReleaseServer(t)
	t.Setenv("FLOGO_AGENT_BASE_URL", server.URL)
	oldVersion := version
	defer func() { version = oldVersion }()
	version = "v9.9.9-test"

	if err := setupFlogoCLI(); err != nil {
		t.Fatal(err)
	}

	path, ok := resolveAvailableFlogoBinary()
	if !ok {
		t.Fatal("expected flogo binary to be available after setup")
	}
	if filepath.Base(path) != "flogo" {
		t.Fatalf("expected flogo binary, got %q", path)
	}
	record, err := config.LoadManagedToolInstall("flogo")
	if err != nil {
		t.Fatal(err)
	}
	if record == nil || record.Source != "release-download" || record.Version != "v9.9.9-test" {
		t.Fatalf("expected release-download record, got %+v", record)
	}
	if !strings.Contains(assetName, "flogo_linux_amd64") {
		t.Fatalf("expected linux asset name, got %q", assetName)
	}
}

func TestEnsureFlogoCLIPromptsAndInstallsDeveloperFallback(t *testing.T) {
	root := t.TempDir()
	configHome := filepath.Join(root, "config")
	binDir := filepath.Join(root, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	goScript := filepath.Join(binDir, "go")
	if err := os.WriteFile(goScript, []byte("#!/bin/sh\nmkdir -p \"$GOBIN\"\nprintf '#!/bin/sh\\nexit 0\\n' > \"$GOBIN/flogo\"\nchmod +x \"$GOBIN/flogo\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	oldTTY := stdioIsTerminal
	oldPrompt := promptForFlogoInstallTTY
	oldVersion := version
	defer func() {
		stdioIsTerminal = oldTTY
		promptForFlogoInstallTTY = oldPrompt
		version = oldVersion
	}()
	stdioIsTerminal = func() bool { return true }
	promptForFlogoInstallTTY = func() (bool, error) { return true, nil }
	version = "dev"

	if err := ensureFlogoCLICLI(); err != nil {
		t.Fatal(err)
	}

	path, err := config.ManagedToolPath("flogo")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected managed flogo install, got %v", err)
	}
	record, err := config.LoadManagedToolInstall("flogo")
	if err != nil {
		t.Fatal(err)
	}
	if record == nil || record.Source != "developer-go-install" {
		t.Fatalf("expected developer fallback source, got %+v", record)
	}
}

func TestDescribeFlogoBinaryManagedSource(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	path, err := config.ManagedToolPath("flogo")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := config.SaveManagedToolInstall(config.ManagedToolInstall{
		Name:    "flogo",
		Path:    path,
		Source:  "release-download",
		Version: "v1.2.3",
	}); err != nil {
		t.Fatal(err)
	}

	text := describeFlogoBinary(t.TempDir(), path)
	if !strings.Contains(text, "managed install") || !strings.Contains(text, "release-download") || !strings.Contains(text, "v1.2.3") {
		t.Fatalf("unexpected managed description: %q", text)
	}
}

func TestDescribeFlogoBinaryRepoLocalSource(t *testing.T) {
	repo := t.TempDir()
	path := filepath.Join(repo, ".tools", "bin", "flogo")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	text := describeFlogoBinary(repo, path)
	if !strings.Contains(text, "repo-local binary") {
		t.Fatalf("unexpected repo-local description: %q", text)
	}
}

func startFakeReleaseServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	root := t.TempDir()
	assetName := update.AssetArchiveName("flogo")
	archivePath := filepath.Join(root, assetName)
	writeFakeTarGz(t, archivePath, "flogo", []byte("#!/bin/sh\nexit 0\n"))
	sum := sha256.Sum256(mustReadFile(t, archivePath))
	checksumLine := fmt.Sprintf("%x  %s\n", sum, assetName)
	if err := os.WriteFile(filepath.Join(root, update.ChecksumAssetName), []byte(checksumLine), 0o644); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.FileServer(http.Dir(root)))
	t.Cleanup(server.Close)
	return server, assetName
}

func writeFakeTarGz(t *testing.T, path string, name string, contents []byte) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	gzw := gzip.NewWriter(file)
	defer gzw.Close()
	tw := tar.NewWriter(gzw)
	defer tw.Close()
	if err := tw.WriteHeader(&tar.Header{
		Name: name,
		Mode: 0o755,
		Size: int64(len(contents)),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(contents); err != nil {
		t.Fatal(err)
	}
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
