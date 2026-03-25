package flogo

import (
	"fmt"
	"sort"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

func ValidateSemantics(doc *Document) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	issues = append(issues, validateFlowURIs(doc)...)
	issues = append(issues, validateMappings(doc)...)
	issues = append(issues, validateOrphanedImports(doc)...)
	sort.Slice(issues, func(i, j int) bool {
		if issues[i].RuleID == issues[j].RuleID {
			return issues[i].JSONPath < issues[j].JSONPath
		}
		return issues[i].RuleID < issues[j].RuleID
	})
	return issues
}

func validateFlowURIs(doc *Document) []contracts.ValidationIssue {
	resourceIDs := doc.ResourceIDs()
	resourceSet := make(map[string]struct{}, len(resourceIDs))
	for _, id := range resourceIDs {
		resourceSet[id] = struct{}{}
		if strings.HasPrefix(id, "flow:") {
			resourceSet[strings.TrimPrefix(id, "flow:")] = struct{}{}
		}
	}

	var issues []contracts.ValidationIssue
	walkJSON(doc.Raw, "$", func(path string, key string, value any, inMapping bool) {
		if key != "flowURI" {
			return
		}
		flowURI, ok := value.(string)
		if !ok || flowURI == "" {
			return
		}
		if !strings.HasPrefix(flowURI, "res://flow:") {
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "flow.uri.prefix",
				Message:  fmt.Sprintf("flowURI %q should use res://flow:<id>", flowURI),
				File:     doc.Path,
				JSONPath: path,
			})
			return
		}
		target := strings.TrimPrefix(flowURI, "res://flow:")
		if _, ok := resourceSet[target]; !ok {
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "flow.uri.target",
				Message:  fmt.Sprintf("flowURI %q does not match a known resource", flowURI),
				File:     doc.Path,
				JSONPath: path,
			})
		}
	})
	return issues
}

func validateMappings(doc *Document) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	walkJSON(doc.Raw, "$", func(path string, key string, value any, inMapping bool) {
		if !inMapping {
			return
		}
		text, ok := value.(string)
		if !ok {
			return
		}
		if strings.HasPrefix(text, "=") {
			return
		}
		if strings.HasPrefix(text, "$flow.") || strings.HasPrefix(text, "$env.") || strings.HasPrefix(text, "$trigger.") || strings.HasPrefix(text, "$activity.") {
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "mapping.expression_prefix",
				Message:  fmt.Sprintf("mapping expression %q should start with '='", text),
				File:     doc.Path,
				JSONPath: path,
			})
		}
	})
	return issues
}

func validateOrphanedImports(doc *Document) []contracts.ValidationIssue {
	imports := doc.Imports()
	if len(imports) == 0 {
		return nil
	}

	used := make(map[string]bool, len(imports))
	walkJSON(doc.Raw, "$", func(path string, key string, value any, inMapping bool) {
		text, ok := value.(string)
		if !ok {
			return
		}
		for _, imp := range imports {
			if imp.Ref != "" && strings.Contains(text, imp.Ref) {
				used[imp.Ref] = true
			}
			if imp.Alias != "" && strings.Contains(text, imp.Alias) {
				used[imp.Ref] = true
			}
		}
	})

	var issues []contracts.ValidationIssue
	for idx, imp := range imports {
		if imp.Ref == "" || used[imp.Ref] {
			continue
		}
		issues = append(issues, contracts.ValidationIssue{
			Severity: "warning",
			RuleID:   "imports.orphaned",
			Message:  fmt.Sprintf("import %q does not appear to be referenced", imp.Ref),
			File:     doc.Path,
			JSONPath: fmt.Sprintf("$.imports[%d]", idx),
		})
	}
	return issues
}

func walkJSON(value any, path string, fn func(path string, key string, value any, inMapping bool)) {
	walkJSONWithContext(value, path, false, fn)
}

func walkJSONWithContext(value any, path string, inMapping bool, fn func(path string, key string, value any, inMapping bool)) {
	switch current := value.(type) {
	case map[string]any:
		mappingContext := inMapping || strings.HasSuffix(path, ".input") || strings.HasSuffix(path, ".output") || strings.Contains(path, ".mappings")
		for key, item := range current {
			childPath := path + "." + key
			fn(childPath, key, item, mappingContext)
			walkJSONWithContext(item, childPath, mappingContext, fn)
		}
	case []any:
		for idx, item := range current {
			childPath := fmt.Sprintf("%s[%d]", path, idx)
			walkJSONWithContext(item, childPath, inMapping, fn)
		}
	}
}
