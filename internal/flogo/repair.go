package flogo

import (
	"bytes"
	"fmt"
	"os"
	"strings"

	"github.com/pmezard/go-difflib/difflib"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func BuildSafePatchPlan(doc *Document, citations []contracts.SourceCitation) (*contracts.PatchPlan, []string, error) {
	changed := false
	notes := make([]string, 0, 2)
	resourceSet := make(map[string]struct{}, len(doc.ResourceIDs()))
	for _, id := range doc.ResourceIDs() {
		resourceSet[id] = struct{}{}
		if strings.HasPrefix(id, "flow:") {
			resourceSet[strings.TrimPrefix(id, "flow:")] = struct{}{}
		}
	}

	walkAndMutate(doc.Raw, "$", false, func(path string, key string, current any, inMapping bool) (any, bool) {
		text, ok := current.(string)
		if !ok {
			return current, false
		}

		if key == "flowURI" && !strings.HasPrefix(text, "res://flow:") {
			candidate := strings.TrimPrefix(text, "flow:")
			if _, ok := resourceSet[candidate]; ok {
				notes = append(notes, fmt.Sprintf("normalized flowURI at %s", path))
				return "res://flow:" + candidate, true
			}
		}

		if inMapping && !strings.HasPrefix(text, "=") {
			if strings.HasPrefix(text, "$flow.") || strings.HasPrefix(text, "$env.") || strings.HasPrefix(text, "$trigger.") || strings.HasPrefix(text, "$activity.") {
				notes = append(notes, fmt.Sprintf("prefixed mapping expression at %s", path))
				return "=" + text, true
			}
		}
		return current, false
	}, &changed)

	if !changed {
		return nil, nil, nil
	}

	updated, err := doc.PrettyJSON()
	if err != nil {
		return nil, nil, fmt.Errorf("marshal repaired document: %w", err)
	}
	diff, err := unifiedDiff(doc.Original, updated)
	if err != nil {
		return nil, nil, err
	}

	return &contracts.PatchPlan{
		TargetFiles: []string{doc.Path},
		UnifiedDiff: diff,
		Rationale:   strings.Join(notes, "; "),
		Citations:   citations,
		Safe:        true,
	}, notes, nil
}

func ApplyPatchPlan(doc *Document) error {
	updated, err := doc.PrettyJSON()
	if err != nil {
		return fmt.Errorf("marshal repaired document: %w", err)
	}
	updated = append(updated, '\n')
	return os.WriteFile(doc.Path, updated, 0o644)
}

func walkAndMutate(value any, path string, inMapping bool, fn func(path string, key string, current any, inMapping bool) (any, bool), changed *bool) {
	switch current := value.(type) {
	case map[string]any:
		mappingContext := inMapping || strings.HasSuffix(path, ".input") || strings.HasSuffix(path, ".output") || strings.Contains(path, ".mappings")
		for key, item := range current {
			childPath := path + "." + key
			next, mutated := fn(childPath, key, item, mappingContext)
			if mutated {
				current[key] = next
				item = next
				*changed = true
			}
			walkAndMutate(item, childPath, mappingContext, fn, changed)
		}
	case []any:
		for idx, item := range current {
			childPath := fmt.Sprintf("%s[%d]", path, idx)
			next, mutated := fn(childPath, "", item, inMapping)
			if mutated {
				current[idx] = next
				item = next
				*changed = true
			}
			walkAndMutate(item, childPath, inMapping, fn, changed)
		}
	}
}

func unifiedDiff(original []byte, updated []byte) (string, error) {
	diff := difflib.UnifiedDiff{
		A:        difflib.SplitLines(string(bytes.TrimSpace(original)) + "\n"),
		B:        difflib.SplitLines(string(bytes.TrimSpace(updated)) + "\n"),
		FromFile: "before/flogo.json",
		ToFile:   "after/flogo.json",
		Context:  3,
	}
	return difflib.GetUnifiedDiffString(diff)
}
