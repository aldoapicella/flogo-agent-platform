package knowledge

import (
	"encoding/json"
	"fmt"
	"os"
)

type Source struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Type     string   `json:"type"`
	Location string   `json:"location"`
	Tags     []string `json:"tags"`
}

type Manifest struct {
	Sources []Source `json:"sources"`
}

func LoadManifest(path string) (*Manifest, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}

	var manifest Manifest
	if err := json.Unmarshal(contents, &manifest); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	return &manifest, nil
}
