package flogo

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

var flowExprPattern = regexp.MustCompile(`\$flow\.([A-Za-z0-9_]+)`)

func ValidateSemantics(doc *Document) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	catalog := buildImportCatalog(doc.Imports())
	flows := collectFlowResources(doc)
	issues = append(issues, validateImportRefs(doc, catalog)...)
	issues = append(issues, validateOrphanedImports(doc.Path, catalog)...)
	issues = append(issues, validateFlowURIs(doc, catalog, flows)...)
	issues = append(issues, validateHandlerActions(doc)...)
	issues = append(issues, validateHandlerActionInputScopes(doc)...)
	issues = append(issues, validateFlowActionIO(doc, flows)...)
	issues = append(issues, validateFlowExpressions(doc, flows)...)
	issues = append(issues, validateFlowTasks(doc, catalog, flows)...)
	issues = append(issues, validateFlowLinks(doc, flows)...)
	issues = append(issues, validateMappings(doc)...)
	sort.Slice(issues, func(i, j int) bool {
		if issues[i].RuleID == issues[j].RuleID {
			return issues[i].JSONPath < issues[j].JSONPath
		}
		return issues[i].RuleID < issues[j].RuleID
	})
	return issues
}

func validateFlowURIs(doc *Document, catalog importCatalog, flows map[string]flowResource) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	for _, action := range collectHandlerActions(doc) {
		flowURI := action.FlowURI
		if flowURI == "" {
			continue
		}
		if !strings.HasPrefix(flowURI, "res://flow:") {
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "flow.uri.prefix",
				Message:  fmt.Sprintf("flowURI %q should use res://flow:<id>", flowURI),
				File:     doc.Path,
				JSONPath: action.FlowURIPath,
			})
		}

		target := strings.TrimPrefix(flowURI, "res://flow:")
		if _, ok := flows[target]; !ok {
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "flow.uri.target",
				Message:  fmt.Sprintf("flowURI %q does not match a known flow resource", flowURI),
				File:     doc.Path,
				JSONPath: action.FlowURIPath,
			})
		}

		if action.Ref != "" && !catalog.isFlowRef(action.Ref) {
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "flow.uri.ref",
				Message:  fmt.Sprintf("flowURI %q is attached to action ref %q, which does not resolve to the flow import", flowURI, action.Ref),
				File:     doc.Path,
				JSONPath: action.RefPath,
			})
		}
	}
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

func validateHandlerActions(doc *Document) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
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
			action, ok := handler["action"].(map[string]any)
			if !ok {
				continue
			}
			actionID := asString(action["id"])
			if actionID == "" {
				continue
			}
			settings, _ := action["settings"].(map[string]any)
			input, _ := action["input"].(map[string]any)
			output, _ := action["output"].(map[string]any)
			if asString(action["ref"]) == "" && len(settings) == 0 && len(input) == 0 && len(output) == 0 {
				continue
			}
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "handler.action.inline_id",
				Message:  fmt.Sprintf("inline handler action %q should not declare id when the action body is embedded", actionID),
				File:     doc.Path,
				JSONPath: fmt.Sprintf("$.triggers[%d].handlers[%d].action.id", triggerIdx, handlerIdx),
			})
		}
	}
	return issues
}

func validateHandlerActionInputScopes(doc *Document) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	for _, action := range collectHandlerActions(doc) {
		for key, value := range action.Input {
			text, ok := value.(string)
			if !ok {
				continue
			}
			resolver := invalidHandlerActionInputResolver(text)
			if resolver == "" {
				continue
			}
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "handler.action.input.invalid_scope",
				Message:  fmt.Sprintf("handler action input %q uses unsupported resolver %s before the flow executes; map from trigger data using $.<field> instead", key, resolver),
				File:     doc.Path,
				JSONPath: action.InputPath + "." + key,
			})
		}
	}
	return issues
}

func invalidHandlerActionInputResolver(text string) string {
	switch {
	case strings.Contains(text, "$flow."):
		return "$flow"
	case strings.Contains(text, "$trigger."):
		return "$trigger"
	case strings.Contains(text, "$activity[") || strings.Contains(text, "$activity."):
		return "$activity"
	case strings.Contains(text, "$iteration."):
		return "$iteration"
	default:
		return ""
	}
}

func validateImportRefs(doc *Document, catalog importCatalog) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	walkJSON(doc.Raw, "$", func(path string, key string, value any, inMapping bool) {
		if key != "ref" {
			return
		}
		text, ok := value.(string)
		if !ok || text == "" {
			return
		}
		if catalog.resolve(text) {
			return
		}
		if strings.HasPrefix(text, "#") || strings.Contains(text, "project-flogo") {
			issues = append(issues, contracts.ValidationIssue{
				Severity: "error",
				RuleID:   "imports.ref.unresolved",
				Message:  fmt.Sprintf("ref %q does not resolve to any known import", text),
				File:     doc.Path,
				JSONPath: path,
			})
		}
	})
	return issues
}

func validateOrphanedImports(path string, catalog importCatalog) []contracts.ValidationIssue {
	if len(catalog.imports) == 0 {
		return nil
	}

	var issues []contracts.ValidationIssue
	for idx, imp := range catalog.imports {
		if imp.Ref == "" || catalog.used[imp.Ref] {
			continue
		}
		issues = append(issues, contracts.ValidationIssue{
			Severity: "warning",
			RuleID:   "imports.orphaned",
			Message:  fmt.Sprintf("import %q does not appear to be referenced", imp.Ref),
			File:     path,
			JSONPath: fmt.Sprintf("$.imports[%d]", idx),
		})
	}
	return issues
}

func validateFlowActionIO(doc *Document, flows map[string]flowResource) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	for _, action := range collectHandlerActions(doc) {
		if action.FlowURI == "" || !strings.HasPrefix(action.FlowURI, "res://flow:") {
			continue
		}
		flowID := strings.TrimPrefix(action.FlowURI, "res://flow:")
		flow, ok := flows[flowID]
		if !ok {
			continue
		}

		for key := range action.Input {
			if !flow.hasInput(key) {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "flow.input.undefined",
					Message:  fmt.Sprintf("input mapping %q is not declared in flow %q metadata.input", key, flowID),
					File:     doc.Path,
					JSONPath: action.InputPath + "." + key,
				})
			}
		}

		for _, param := range flow.InputOrder {
			if _, ok := action.Input[param.Name]; ok {
				continue
			}
			if param.HasDefault {
				continue
			}
			issues = append(issues, contracts.ValidationIssue{
				Severity: "warning",
				RuleID:   "flow.input.missing_mapping",
				Message:  fmt.Sprintf("flow input %q in %q has no explicit trigger mapping", param.Name, flowID),
				File:     doc.Path,
				JSONPath: action.Path,
			})
		}

		for key := range action.Output {
			if !flow.hasOutput(key) {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "flow.output.undefined",
					Message:  fmt.Sprintf("output mapping %q is not declared in flow %q metadata.output", key, flowID),
					File:     doc.Path,
					JSONPath: action.OutputPath + "." + key,
				})
			}
		}

		for _, param := range flow.OutputOrder {
			if _, ok := action.Output[param.Name]; ok {
				continue
			}
			issues = append(issues, contracts.ValidationIssue{
				Severity: "warning",
				RuleID:   "flow.output.missing_mapping",
				Message:  fmt.Sprintf("flow output %q in %q has no trigger reply mapping", param.Name, flowID),
				File:     doc.Path,
				JSONPath: action.Path,
			})
		}
	}
	return issues
}

func validateFlowExpressions(doc *Document, flows map[string]flowResource) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	resources := asSlice(doc.Raw["resources"])
	for idx, item := range resources {
		resource, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id := asString(resource["id"])
		if !strings.HasPrefix(id, "flow:") {
			continue
		}
		flow, ok := flows[strings.TrimPrefix(id, "flow:")]
		if !ok {
			continue
		}
		data, ok := resource["data"].(map[string]any)
		if !ok {
			continue
		}
		basePath := fmt.Sprintf("$.resources[%d].data", idx)
		walkJSON(data, basePath, func(path string, key string, value any, inMapping bool) {
			text, ok := value.(string)
			if !ok {
				return
			}
			matches := flowExprPattern.FindAllStringSubmatch(text, -1)
			for _, match := range matches {
				if len(match) < 2 {
					continue
				}
				name := match[1]
				if flow.hasInput(name) || flow.hasOutput(name) {
					continue
				}
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "flow.expression.undefined",
					Message:  fmt.Sprintf("$flow.%s is not declared in flow %q metadata", name, flow.ID),
					File:     doc.Path,
					JSONPath: path,
				})
			}
		})
	}
	return issues
}

func validateFlowTasks(doc *Document, catalog importCatalog, flows map[string]flowResource) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	for _, flow := range flows {
		seen := map[string]string{}
		for _, task := range flow.Tasks {
			if task.ID == "" {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "task.id.missing",
					Message:  fmt.Sprintf("task %q in flow %q is missing an id", task.Name, flow.ID),
					File:     doc.Path,
					JSONPath: task.Path,
				})
			} else if prior, ok := seen[task.ID]; ok {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "task.id.duplicate",
					Message:  fmt.Sprintf("task id %q is duplicated in flow %q; first seen at %s", task.ID, flow.ID, prior),
					File:     doc.Path,
					JSONPath: task.Path + ".id",
				})
			} else {
				seen[task.ID] = task.Path + ".id"
			}

			if task.ActivityPath == "" {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "task.activity.missing",
					Message:  fmt.Sprintf("task %q in flow %q is missing an activity block", task.IDOrName(), flow.ID),
					File:     doc.Path,
					JSONPath: task.Path,
				})
				continue
			}
			if task.ActivityRef == "" {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "task.activity.ref.missing",
					Message:  fmt.Sprintf("task %q in flow %q is missing activity.ref", task.IDOrName(), flow.ID),
					File:     doc.Path,
					JSONPath: task.ActivityPath,
				})
				continue
			}
			if !catalog.resolve(task.ActivityRef) && (strings.HasPrefix(task.ActivityRef, "#") || strings.Contains(task.ActivityRef, "project-flogo")) {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "task.activity.ref.unresolved",
					Message:  fmt.Sprintf("task %q in flow %q references unresolved activity %q", task.IDOrName(), flow.ID, task.ActivityRef),
					File:     doc.Path,
					JSONPath: task.ActivityRefPath,
				})
			}
		}
	}
	return issues
}

func validateFlowLinks(doc *Document, flows map[string]flowResource) []contracts.ValidationIssue {
	var issues []contracts.ValidationIssue
	for _, flow := range flows {
		for _, link := range flow.Links {
			if link.From == "" {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "link.from.missing",
					Message:  fmt.Sprintf("link in flow %q is missing a from task id", flow.ID),
					File:     doc.Path,
					JSONPath: link.Path,
				})
			} else if !flow.hasTask(link.From) {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "link.from.unknown",
					Message:  fmt.Sprintf("link in flow %q references unknown from task %q", flow.ID, link.From),
					File:     doc.Path,
					JSONPath: link.Path + ".from",
				})
			}

			if link.To == "" {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "link.to.missing",
					Message:  fmt.Sprintf("link in flow %q is missing a to task id", flow.ID),
					File:     doc.Path,
					JSONPath: link.Path,
				})
			} else if !flow.hasTask(link.To) {
				issues = append(issues, contracts.ValidationIssue{
					Severity: "error",
					RuleID:   "link.to.unknown",
					Message:  fmt.Sprintf("link in flow %q references unknown to task %q", flow.ID, link.To),
					File:     doc.Path,
					JSONPath: link.Path + ".to",
				})
			}
		}
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

type importCatalog struct {
	imports []Import
	byAlias map[string]Import
	byRef   map[string]Import
	used    map[string]bool
}

func buildImportCatalog(imports []Import) importCatalog {
	catalog := importCatalog{
		imports: imports,
		byAlias: make(map[string]Import, len(imports)),
		byRef:   make(map[string]Import, len(imports)),
		used:    make(map[string]bool, len(imports)),
	}
	for _, imp := range imports {
		if imp.Ref != "" {
			catalog.byRef[imp.Ref] = imp
		}
		for _, alias := range imp.Aliases {
			if alias != "" {
				catalog.byAlias[alias] = imp
			}
		}
		if imp.Alias != "" {
			catalog.byAlias[imp.Alias] = imp
		}
	}
	return catalog
}

func (c importCatalog) resolve(ref string) bool {
	if ref == "" {
		return false
	}
	if strings.HasPrefix(ref, "#") {
		imp, ok := c.byAlias[strings.TrimPrefix(ref, "#")]
		if ok {
			c.used[imp.Ref] = true
		}
		return ok
	}
	normalized := normalizeImportRef(ref)
	imp, ok := c.byRef[normalized]
	if ok {
		c.used[imp.Ref] = true
	}
	return ok
}

func (c importCatalog) isFlowRef(ref string) bool {
	if strings.HasPrefix(ref, "#") {
		imp, ok := c.byAlias[strings.TrimPrefix(ref, "#")]
		if !ok {
			return false
		}
		return imp.Ref == "github.com/project-flogo/flow"
	}
	return normalizeImportRef(ref) == "github.com/project-flogo/flow"
}

type flowParam struct {
	Name       string
	HasDefault bool
}

type flowResource struct {
	ID          string
	InputOrder  []flowParam
	OutputOrder []flowParam
	Tasks       []flowTask
	Links       []flowLink
	inputs      map[string]flowParam
	outputs     map[string]flowParam
	tasks       map[string]flowTask
}

func (f flowResource) hasInput(name string) bool {
	_, ok := f.inputs[name]
	return ok
}

func (f flowResource) hasOutput(name string) bool {
	_, ok := f.outputs[name]
	return ok
}

func (f flowResource) hasTask(name string) bool {
	_, ok := f.tasks[name]
	return ok
}

func collectFlowResources(doc *Document) map[string]flowResource {
	out := map[string]flowResource{}
	for idx, item := range asSlice(doc.Raw["resources"]) {
		resource, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id := asString(resource["id"])
		if !strings.HasPrefix(id, "flow:") {
			continue
		}
		data, ok := resource["data"].(map[string]any)
		if !ok {
			continue
		}
		metadata, _ := data["metadata"].(map[string]any)
		inputs := parseFlowParams(metadata, "input")
		outputs := parseFlowParams(metadata, "output")
		basePath := fmt.Sprintf("$.resources[%d].data", idx)
		tasks := parseFlowTasks(data, basePath)
		links := parseFlowLinks(data, basePath)
		key := strings.TrimPrefix(id, "flow:")
		out[key] = flowResource{
			ID:          key,
			InputOrder:  inputs,
			OutputOrder: outputs,
			Tasks:       tasks,
			Links:       links,
			inputs:      indexFlowParams(inputs),
			outputs:     indexFlowParams(outputs),
			tasks:       indexFlowTasks(tasks),
		}
	}
	return out
}

func parseFlowParams(metadata map[string]any, field string) []flowParam {
	if metadata == nil {
		return nil
	}
	params := asSlice(metadata[field])
	out := make([]flowParam, 0, len(params))
	for _, item := range params {
		param, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name := asString(param["name"])
		if name == "" {
			continue
		}
		_, hasDefault := param["value"]
		out = append(out, flowParam{Name: name, HasDefault: hasDefault})
	}
	return out
}

func indexFlowParams(items []flowParam) map[string]flowParam {
	out := make(map[string]flowParam, len(items))
	for _, item := range items {
		out[item.Name] = item
	}
	return out
}

type flowTask struct {
	ID              string
	Name            string
	Path            string
	ActivityPath    string
	ActivityRef     string
	ActivityRefPath string
}

func (f flowTask) IDOrName() string {
	if f.ID != "" {
		return f.ID
	}
	if f.Name != "" {
		return f.Name
	}
	return "<unnamed>"
}

type flowLink struct {
	From string
	To   string
	Path string
}

func parseFlowTasks(data map[string]any, basePath string) []flowTask {
	items := asSlice(data["tasks"])
	out := make([]flowTask, 0, len(items))
	for idx, item := range items {
		task, ok := item.(map[string]any)
		if !ok {
			continue
		}
		path := fmt.Sprintf("%s.tasks[%d]", basePath, idx)
		activity, _ := task["activity"].(map[string]any)
		out = append(out, flowTask{
			ID:              asString(task["id"]),
			Name:            asString(task["name"]),
			Path:            path,
			ActivityPath:    path + ".activity",
			ActivityRef:     asString(activity["ref"]),
			ActivityRefPath: path + ".activity.ref",
		})
		if activity == nil {
			out[len(out)-1].ActivityPath = ""
			out[len(out)-1].ActivityRefPath = ""
		}
	}
	return out
}

func parseFlowLinks(data map[string]any, basePath string) []flowLink {
	items := asSlice(data["links"])
	out := make([]flowLink, 0, len(items))
	for idx, item := range items {
		link, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, flowLink{
			From: asString(link["from"]),
			To:   asString(link["to"]),
			Path: fmt.Sprintf("%s.links[%d]", basePath, idx),
		})
	}
	return out
}

func indexFlowTasks(items []flowTask) map[string]flowTask {
	out := make(map[string]flowTask, len(items))
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		if _, exists := out[item.ID]; exists {
			continue
		}
		out[item.ID] = item
	}
	return out
}

type handlerAction struct {
	Path        string
	RefPath     string
	FlowURIPath string
	InputPath   string
	OutputPath  string
	Ref         string
	FlowURI     string
	Input       map[string]any
	Output      map[string]any
}

func collectHandlerActions(doc *Document) []handlerAction {
	var out []handlerAction
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
				out = append(out, newHandlerAction(basePath+".action", action))
			}
			for actionIdx, actionItem := range asSlice(handler["actions"]) {
				action, ok := actionItem.(map[string]any)
				if !ok {
					continue
				}
				out = append(out, newHandlerAction(fmt.Sprintf("%s.actions[%d]", basePath, actionIdx), action))
			}
		}
	}
	return out
}

func newHandlerAction(path string, action map[string]any) handlerAction {
	settings, _ := action["settings"].(map[string]any)
	input, _ := action["input"].(map[string]any)
	output, _ := action["output"].(map[string]any)
	return handlerAction{
		Path:        path,
		RefPath:     path + ".ref",
		FlowURIPath: path + ".settings.flowURI",
		InputPath:   path + ".input",
		OutputPath:  path + ".output",
		Ref:         asString(action["ref"]),
		FlowURI:     asString(settings["flowURI"]),
		Input:       input,
		Output:      output,
	}
}
