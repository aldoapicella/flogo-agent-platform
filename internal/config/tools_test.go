package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestManagedToolPathUsesConfigHome(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	path, err := ManagedToolPath("flogo")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(configHome, "flogo-agent", "bin", "flogo")
	if path != want {
		t.Fatalf("expected managed tool path %q, got %q", want, path)
	}
}

func TestSaveAndLoadManagedToolInstall(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	record := ManagedToolInstall{
		Name:    "flogo",
		Path:    filepath.Join(configHome, "flogo-agent", "bin", "flogo"),
		Source:  "github.com/project-flogo/cli/...@latest",
		Version: "latest",
	}
	if err := SaveManagedToolInstall(record); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(record.Path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(record.Path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	loaded, err := LoadManagedToolInstall("flogo")
	if err != nil {
		t.Fatal(err)
	}
	if loaded == nil {
		t.Fatal("expected managed tool install record")
	}
	if loaded.Path != record.Path {
		t.Fatalf("expected path %q, got %q", record.Path, loaded.Path)
	}
	if loaded.Source != record.Source {
		t.Fatalf("expected source %q, got %q", record.Source, loaded.Source)
	}
}
