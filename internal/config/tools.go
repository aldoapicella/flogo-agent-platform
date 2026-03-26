package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type ManagedToolInstall struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Source      string `json:"source"`
	Version     string `json:"version,omitempty"`
	InstalledAt string `json:"installed_at"`
}

func ConfigRoot() (string, error) {
	return configRoot()
}

func ManagedBinDir() (string, error) {
	root, err := configRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "bin"), nil
}

func ManagedToolPath(name string) (string, error) {
	binDir, err := ManagedBinDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(binDir, executableName(name)), nil
}

func LoadManagedToolInstall(name string) (*ManagedToolInstall, error) {
	path, err := managedToolRecordPath(name)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var record ManagedToolInstall
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, err
	}
	record.Name = strings.TrimSpace(record.Name)
	record.Path = strings.TrimSpace(record.Path)
	record.Source = strings.TrimSpace(record.Source)
	record.Version = strings.TrimSpace(record.Version)
	if record.Name == "" || record.Path == "" {
		return nil, nil
	}
	if _, err := os.Stat(record.Path); err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	return &record, nil
}

func SaveManagedToolInstall(record ManagedToolInstall) error {
	record.Name = strings.TrimSpace(record.Name)
	record.Path = strings.TrimSpace(record.Path)
	record.Source = strings.TrimSpace(record.Source)
	record.Version = strings.TrimSpace(record.Version)
	if record.Name == "" || record.Path == "" {
		return nil
	}
	path, err := managedToolRecordPath(record.Name)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	record.InstalledAt = time.Now().UTC().Format(time.RFC3339Nano)
	payload, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o600)
}

func configRoot() (string, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "flogo-agent"), nil
}

func managedToolRecordPath(name string) (string, error) {
	root, err := configRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "tools", strings.TrimSpace(name)+".json"), nil
}

func executableName(name string) string {
	if runtime.GOOS == "windows" && !strings.HasSuffix(strings.ToLower(name), ".exe") {
		return name + ".exe"
	}
	return name
}
