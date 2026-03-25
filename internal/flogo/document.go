package flogo

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Document struct {
	Path     string
	Original []byte
	Raw      map[string]any
}

type Import struct {
	Raw     string   `json:"raw"`
	Ref     string   `json:"ref"`
	Alias   string   `json:"alias"`
	Aliases []string `json:"aliases"`
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
		switch typed := item.(type) {
		case string:
			out = append(out, newImport(typed, ""))
		case map[string]any:
			ref := asString(typed["ref"])
			alias := asString(typed["alias"])
			if ref == "" {
				continue
			}
			out = append(out, newImport(ref, alias))
		}
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

func newImport(raw string, explicitAlias string) Import {
	aliases := deriveAliases(raw)
	alias := explicitAlias
	if alias == "" && len(aliases) > 0 {
		alias = aliases[0]
	}
	return Import{
		Raw:     raw,
		Ref:     normalizeImportRef(raw),
		Alias:   alias,
		Aliases: aliases,
	}
}

func normalizeImportRef(raw string) string {
	if raw == "" {
		return ""
	}
	ref := raw
	if idx := strings.Index(ref, "@"); idx != -1 {
		end := idx
		for end < len(ref) && ref[end] != ':' && ref[end] != '/' {
			end++
		}
		ref = ref[:idx] + ref[end:]
	}
	ref = strings.ReplaceAll(ref, ":/", "/")
	return ref
}

func deriveAliases(raw string) []string {
	ref := normalizeImportRef(raw)
	if ref == "" {
		return nil
	}
	last := ref
	if idx := strings.LastIndex(ref, "/"); idx >= 0 && idx+1 < len(ref) {
		last = ref[idx+1:]
	}
	if last == "" {
		return nil
	}
	return []string{last}
}
