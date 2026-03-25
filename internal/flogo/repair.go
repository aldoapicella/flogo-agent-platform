package flogo

import (
	"bytes"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/pmezard/go-difflib/difflib"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

var canonicalImportsByAlias = map[string]string{
	"flow": "github.com/project-flogo/flow",
	"rest": "github.com/project-flogo/contrib/trigger/rest",
	"log":  "github.com/project-flogo/contrib/activity/log",
}

func BuildSafePatchPlan(doc *Document, citations []contracts.SourceCitation) (*contracts.PatchPlan, []string, error) {
	changed := false
	notes := make([]string, 0, 4)
	resourceSet := make(map[string]struct{}, len(doc.ResourceIDs()))
	for _, id := range doc.ResourceIDs() {
		resourceSet[id] = struct{}{}
		if strings.HasPrefix(id, "flow:") {
			resourceSet[strings.TrimPrefix(id, "flow:")] = struct{}{}
		}
	}

	if repairMissingImports(doc, &notes) {
		changed = true
	}
	if repairFlowInputMappings(doc, &notes) {
		changed = true
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

func repairMissingImports(doc *Document, notes *[]string) bool {
	catalog := buildImportCatalog(doc.Imports())
	missingByRef := map[string]string{}
	walkJSON(doc.Raw, "$", func(path string, key string, value any, inMapping bool) {
		if key != "ref" {
			return
		}
		text, ok := value.(string)
		if !ok || !strings.HasPrefix(text, "#") || catalog.resolve(text) {
			return
		}
		alias := strings.TrimPrefix(text, "#")
		ref, ok := canonicalImportsByAlias[alias]
		if !ok {
			return
		}
		if _, exists := catalog.byRef[ref]; exists {
			return
		}
		missingByRef[ref] = alias
	})

	if len(missingByRef) == 0 {
		return false
	}

	imports := asSlice(doc.Raw["imports"])
	if imports == nil {
		imports = []any{}
	}

	refs := make([]string, 0, len(missingByRef))
	for ref := range missingByRef {
		refs = append(refs, ref)
	}
	sort.Strings(refs)
	for _, ref := range refs {
		imports = append(imports, ref)
		*notes = append(*notes, fmt.Sprintf("added canonical import %q for alias #%s", ref, missingByRef[ref]))
	}
	doc.Raw["imports"] = imports
	return true
}

func repairFlowInputMappings(doc *Document, notes *[]string) bool {
	flows := collectFlowResources(doc)
	changed := false
	forEachHandlerActionMap(doc, func(action map[string]any, path string) {
		settings, _ := action["settings"].(map[string]any)
		flowURI := asString(settings["flowURI"])
		if flowURI == "" {
			return
		}
		flowID := strings.TrimPrefix(flowURI, "res://flow:")
		if !strings.HasPrefix(flowURI, "res://flow:") {
			flowID = strings.TrimPrefix(flowURI, "flow:")
		}
		flow, ok := flows[flowID]
		if !ok {
			return
		}

		input, _ := action["input"].(map[string]any)
		if input == nil {
			return
		}

		var undefined []string
		for key := range input {
			if !flow.hasInput(key) {
				undefined = append(undefined, key)
			}
		}
		var missing []string
		for _, param := range flow.InputOrder {
			if param.HasDefault {
				continue
			}
			if _, ok := input[param.Name]; !ok {
				missing = append(missing, param.Name)
			}
		}

		if len(undefined) != 1 || len(missing) != 1 {
			return
		}
		from := undefined[0]
		to := missing[0]
		if from == to {
			return
		}
		if _, exists := input[to]; exists {
			return
		}

		input[to] = input[from]
		delete(input, from)
		*notes = append(*notes, fmt.Sprintf("renamed flow input mapping %q to %q at %s.input", from, to, path))
		changed = true
	})
	return changed
}

func forEachHandlerActionMap(doc *Document, fn func(action map[string]any, path string)) {
	triggers := asSlice(doc.Raw["triggers"])
	for triggerIdx, triggerItem := range triggers {
		trigger, ok := triggerItem.(map[string]any)
		if !ok {
			continue
		}
		handlers := asSlice(trigger["handlers"])
		for handlerIdx, handlerItem := range handlers {
			handler, ok := handlerItem.(map[string]any)
			if !ok {
				continue
			}
			basePath := fmt.Sprintf("$.triggers[%d].handlers[%d]", triggerIdx, handlerIdx)
			if action, ok := handler["action"].(map[string]any); ok {
				fn(action, basePath+".action")
			}
			for actionIdx, actionItem := range asSlice(handler["actions"]) {
				action, ok := actionItem.(map[string]any)
				if !ok {
					continue
				}
				fn(action, fmt.Sprintf("%s.actions[%d]", basePath, actionIdx))
			}
		}
	}
}
