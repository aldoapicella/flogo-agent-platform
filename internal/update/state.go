package update

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/config"
)

type State struct {
	LastCheckedAt      string `json:"last_checked_at,omitempty"`
	LastSeenVersion    string `json:"last_seen_version,omitempty"`
	LastPublishedAt    string `json:"last_published_at,omitempty"`
	LastReleaseURL     string `json:"last_release_url,omitempty"`
	SkippedVersion     string `json:"skipped_version,omitempty"`
	LastAppliedAt      string `json:"last_applied_at,omitempty"`
	LastAppliedVersion string `json:"last_applied_version,omitempty"`
	LastError          string `json:"last_error,omitempty"`
}

func LoadState() (*State, error) {
	path, err := statePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &State{}, nil
		}
		return nil, err
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	state.LastSeenVersion = strings.TrimSpace(state.LastSeenVersion)
	state.SkippedVersion = strings.TrimSpace(state.SkippedVersion)
	state.LastError = strings.TrimSpace(state.LastError)
	return &state, nil
}

func SaveState(state State) error {
	path, err := statePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o600)
}

func MarkChecked(state *State, info *ReleaseInfo, checkErr error) State {
	next := State{}
	if state != nil {
		next = *state
	}
	next.LastCheckedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if info != nil {
		next.LastSeenVersion = strings.TrimSpace(info.Version)
		next.LastPublishedAt = strings.TrimSpace(info.PublishedAt)
		next.LastReleaseURL = strings.TrimSpace(info.HTMLURL)
	}
	if checkErr != nil {
		next.LastError = strings.TrimSpace(checkErr.Error())
	} else {
		next.LastError = ""
	}
	return next
}

func statePath() (string, error) {
	root, err := config.ConfigRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "updater.json"), nil
}
