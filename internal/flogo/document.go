package flogo

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Document struct {
	Path     string
	Original []byte
	Raw      map[string]any
}

type Import struct {
	Ref   string `json:"ref"`
	Alias string `json:"alias"`
}

type Resource struct {
	ID   string `json:"id"`
	Data any    `json:"data"`
}

func LoadDocument(repoPath string) (*Document, error) {
	path := filepath.Join(repoPath, "flogo.json")
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read flogo.json: %w", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(contents, &raw); err != nil {
		return nil, fmt.Errorf("parse flogo.json: %w", err)
	}

	return &Document{
		Path:     path,
		Original: contents,
		Raw:      raw,
	}, nil
}

func (d *Document) PrettyJSON() ([]byte, error) {
	return json.MarshalIndent(d.Raw, "", "  ")
}

func (d *Document) Imports() []Import {
	items := asSlice(d.Raw["imports"])
	out := make([]Import, 0, len(items))
	for _, item := range items {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, Import{
			Ref:   asString(obj["ref"]),
			Alias: asString(obj["alias"]),
		})
	}
	return out
}

func (d *Document) ResourceIDs() []string {
	items := asSlice(d.Raw["resources"])
	ids := make([]string, 0, len(items))
	for _, item := range items {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id := asString(obj["id"])
		if id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}

func asSlice(v any) []any {
	s, _ := v.([]any)
	return s
}
