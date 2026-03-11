package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type diagnostic struct {
	Code     string         `json:"code"`
	Message  string         `json:"message"`
	Severity string         `json:"severity"`
	Path     string         `json:"path,omitempty"`
	Details  map[string]any `json:"details,omitempty"`
}

type contribField struct {
	Name        string `json:"name"`
	Type        string `json:"type,omitempty"`
	Required    bool   `json:"required"`
	Description string `json:"description,omitempty"`
}

type contribDescriptor struct {
	Ref                string         `json:"ref"`
	Alias              string         `json:"alias,omitempty"`
	Type               string         `json:"type"`
	Name               string         `json:"name"`
	Version            string         `json:"version,omitempty"`
	Title              string         `json:"title,omitempty"`
	Settings           []contribField `json:"settings"`
	Inputs             []contribField `json:"inputs"`
	Outputs            []contribField `json:"outputs"`
	Examples           []string       `json:"examples"`
	CompatibilityNotes []string       `json:"compatibilityNotes"`
	Source             string         `json:"source,omitempty"`
}

type contribCatalog struct {
	AppName     string              `json:"appName,omitempty"`
	Entries     []contribDescriptor `json:"entries"`
	Diagnostics []diagnostic        `json:"diagnostics"`
}

type contribDescriptorResponse struct {
	Descriptor  contribDescriptor `json:"descriptor"`
	Diagnostics []diagnostic      `json:"diagnostics"`
}

type mappingPreviewContext struct {
	Flow     map[string]any            `json:"flow"`
	Activity map[string]map[string]any `json:"activity"`
	Env      map[string]any            `json:"env"`
	Property map[string]any            `json:"property"`
	Trigger  map[string]any            `json:"trigger"`
}

type mappingPreviewField struct {
	Path        string       `json:"path"`
	Kind        string       `json:"kind"`
	Expression  string       `json:"expression,omitempty"`
	References  []string     `json:"references"`
	Resolved    any          `json:"resolved,omitempty"`
	Diagnostics []diagnostic `json:"diagnostics"`
}

type mappingPreviewResult struct {
	NodeID             string                `json:"nodeId"`
	FlowID             string                `json:"flowId,omitempty"`
	Fields             []mappingPreviewField `json:"fields"`
	SuggestedCoercions []diagnostic          `json:"suggestedCoercions"`
	Diagnostics        []diagnostic          `json:"diagnostics"`
}

type flogoImport struct {
	Alias   string
	Ref     string
	Version string
}

type flogoHandler struct {
	ActionRef string
	Settings  map[string]any
}

type flogoTrigger struct {
	ID       string
	Ref      string
	Settings map[string]any
	Handlers []flogoHandler
}

type flogoTask struct {
	ID          string
	Name        string
	ActivityRef string
	Input       map[string]any
	Output      map[string]any
	Settings    map[string]any
}

type flogoFlow struct {
	ID             string
	Name           string
	MetadataInput  []map[string]any
	MetadataOutput []map[string]any
	Tasks          []flogoTask
}

type flogoApp struct {
	Name       string
	Type       string
	AppModel   string
	Imports    []flogoImport
	Properties []map[string]any
	Triggers   []flogoTrigger
	Resources  []flogoFlow
}

var resolverPattern = regexp.MustCompile(`\$(activity\[[^\]]+\](?:\.[A-Za-z0-9_.-]+)?|flow(?:\.[A-Za-z0-9_.-]+)?|env(?:\.[A-Za-z0-9_.-]+)?|property(?:\.[A-Za-z0-9_.-]+)?|trigger(?:\.[A-Za-z0-9_.-]+)?)`)

var knownRegistry = map[string]contribDescriptor{
	"rest": {
		Type:  "trigger",
		Name:  "rest",
		Title: "REST Trigger",
		Settings: []contribField{
			{Name: "port", Type: "integer", Required: true},
		},
		Inputs: []contribField{
			{Name: "pathParams", Type: "object", Required: false},
			{Name: "queryParams", Type: "object", Required: false},
			{Name: "headers", Type: "object", Required: false},
			{Name: "content", Type: "object", Required: false},
		},
		Outputs: []contribField{
			{Name: "code", Type: "integer", Required: false},
			{Name: "data", Type: "object", Required: false},
			{Name: "headers", Type: "object", Required: false},
			{Name: "cookies", Type: "object", Required: false},
		},
		Examples:           []string{"Bind a reusable flow to GET /resource/{id}"},
		CompatibilityNotes: []string{"Works as a trigger adapter for HTTP-facing flows"},
		Source:             "registry",
	},
	"log": {
		Type:               "activity",
		Name:               "log",
		Title:              "Log Activity",
		Inputs:             []contribField{{Name: "message", Type: "string", Required: true}},
		Outputs:            []contribField{},
		Examples:           []string{"Log trigger input before calling downstream activity"},
		CompatibilityNotes: []string{"Useful for trace and debugging instrumentation"},
		Source:             "registry",
	},
	"timer": {
		Type:               "trigger",
		Name:               "timer",
		Title:              "Timer Trigger",
		Settings:           []contribField{{Name: "interval", Type: "string", Required: true}},
		Outputs:            []contribField{{Name: "tick", Type: "string", Required: false}},
		Examples:           []string{"Run a flow on a fixed interval"},
		CompatibilityNotes: []string{"Use for batch and scheduled flows"},
		Source:             "registry",
	},
	"cli": {
		Type:               "trigger",
		Name:               "cli",
		Title:              "CLI Trigger",
		Inputs:             []contribField{{Name: "args", Type: "array", Required: false}},
		Outputs:            []contribField{{Name: "stdout", Type: "string", Required: false}},
		Examples:           []string{"Run a flow as a one-shot CLI command"},
		CompatibilityNotes: []string{"Useful for command and batch profiles"},
		Source:             "registry",
	},
	"channel": {
		Type:  "trigger",
		Name:  "channel",
		Title: "Channel Trigger",
		Settings: []contribField{
			{Name: "name", Type: "string", Required: true},
		},
		Inputs:             []contribField{{Name: "message", Type: "object", Required: false}},
		Outputs:            []contribField{{Name: "reply", Type: "object", Required: false}},
		Examples:           []string{"Run a flow from an internal engine channel"},
		CompatibilityNotes: []string{"Useful for internal worker topologies"},
		Source:             "registry",
	},
}

func main() {
	if len(os.Args) < 3 {
		fail("expected a command such as 'catalog contribs', 'inspect descriptor', or 'preview mapping'")
	}

	command := strings.Join(os.Args[1:3], " ")
	appPath := lookupFlag("--app")
	if appPath == "" {
		fail("missing required --app flag")
	}

	app := loadApp(appPath)

	switch command {
	case "catalog contribs":
		encode(buildContribCatalog(app, appPath))
	case "inspect descriptor":
		ref := lookupFlag("--ref")
		if ref == "" {
			fail("missing required --ref flag")
		}
		descriptor, diagnostics, ok := introspectContrib(app, appPath, ref)
		if !ok {
			fail(fmt.Sprintf("descriptor %q was not found", ref))
		}
		encode(contribDescriptorResponse{
			Descriptor:  descriptor,
			Diagnostics: diagnostics,
		})
	case "preview mapping":
		nodeID := lookupFlag("--node")
		if nodeID == "" {
			fail("missing required --node flag")
		}
		context := loadPreviewContext(lookupFlag("--input"))
		encode(previewMapping(app, nodeID, context))
	default:
		fail(fmt.Sprintf("unsupported command %q", command))
	}
}

func loadApp(appPath string) flogoApp {
	contents, err := os.ReadFile(appPath)
	if err != nil {
		fail(err.Error())
	}

	var raw map[string]any
	if err := json.Unmarshal(contents, &raw); err != nil {
		fail(err.Error())
	}

	return normalizeApp(raw)
}

func loadPreviewContext(inputPath string) mappingPreviewContext {
	context := mappingPreviewContext{
		Flow:     map[string]any{},
		Activity: map[string]map[string]any{},
		Env:      map[string]any{},
		Property: map[string]any{},
		Trigger:  map[string]any{},
	}

	if inputPath == "" {
		return context
	}

	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	if len(contents) == 0 {
		return context
	}

	if err := json.Unmarshal(contents, &context); err != nil {
		fail(err.Error())
	}

	if context.Flow == nil {
		context.Flow = map[string]any{}
	}
	if context.Activity == nil {
		context.Activity = map[string]map[string]any{}
	}
	if context.Env == nil {
		context.Env = map[string]any{}
	}
	if context.Property == nil {
		context.Property = map[string]any{}
	}
	if context.Trigger == nil {
		context.Trigger = map[string]any{}
	}

	return context
}

func normalizeApp(raw map[string]any) flogoApp {
	app := flogoApp{
		Name:       stringValue(raw["name"]),
		Type:       stringValue(raw["type"]),
		AppModel:   stringValue(raw["appModel"]),
		Imports:    normalizeImports(raw["imports"]),
		Properties: normalizeProperties(raw["properties"]),
		Triggers:   normalizeTriggers(raw["triggers"]),
		Resources:  normalizeResources(raw["resources"]),
	}

	return app
}

func normalizeImports(value any) []flogoImport {
	items, ok := value.([]any)
	if !ok {
		return []flogoImport{}
	}

	imports := make([]flogoImport, 0, len(items))
	for _, item := range items {
		record, ok := item.(map[string]any)
		if !ok {
			continue
		}
		imports = append(imports, flogoImport{
			Alias:   stringValue(record["alias"]),
			Ref:     stringValue(record["ref"]),
			Version: stringValue(record["version"]),
		})
	}

	return imports
}

func normalizeProperties(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return []map[string]any{}
	}

	properties := make([]map[string]any, 0, len(items))
	for _, item := range items {
		record, ok := item.(map[string]any)
		if ok {
			properties = append(properties, record)
		}
	}

	return properties
}

func normalizeTriggers(value any) []flogoTrigger {
	items, ok := value.([]any)
	if !ok {
		return []flogoTrigger{}
	}

	triggers := make([]flogoTrigger, 0, len(items))
	for _, item := range items {
		record, ok := item.(map[string]any)
		if !ok {
			continue
		}

		handlers := []flogoHandler{}
		handlerItems, _ := record["handlers"].([]any)
		for _, handlerItem := range handlerItems {
			handlerRecord, ok := handlerItem.(map[string]any)
			if !ok {
				continue
			}
			actionRef := ""
			if action, ok := handlerRecord["action"].(map[string]any); ok {
				actionRef = stringValue(action["ref"])
				if strings.HasPrefix(actionRef, "flow:") {
					actionRef = "#" + actionRef
				}
			}
			handlers = append(handlers, flogoHandler{
				ActionRef: actionRef,
				Settings:  mapValue(handlerRecord["settings"]),
			})
		}

		triggers = append(triggers, flogoTrigger{
			ID:       stringValue(record["id"]),
			Ref:      stringValue(record["ref"]),
			Settings: mapValue(record["settings"]),
			Handlers: handlers,
		})
	}

	return triggers
}

func normalizeResources(value any) []flogoFlow {
	switch typed := value.(type) {
	case []any:
		flows := make([]flogoFlow, 0, len(typed))
		for index, item := range typed {
			record, ok := item.(map[string]any)
			if !ok {
				continue
			}
			flows = append(flows, normalizeFlow(record, fmt.Sprintf("resource_%d", index)))
		}
		return flows
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		flows := make([]flogoFlow, 0, len(keys))
		for _, key := range keys {
			record, ok := typed[key].(map[string]any)
			if !ok {
				continue
			}
			flows = append(flows, normalizeFlow(record, key))
		}
		return flows
	default:
		return []flogoFlow{}
	}
}

func normalizeFlow(record map[string]any, fallbackID string) flogoFlow {
	data := mapValue(record["data"])
	metadata := mapValue(data["metadata"])

	flow := flogoFlow{
		ID:             valueOrFallback(stringValue(record["id"]), fallbackID),
		Name:           stringValue(data["name"]),
		MetadataInput:  normalizeMetadataFields(metadata["input"]),
		MetadataOutput: normalizeMetadataFields(metadata["output"]),
		Tasks:          normalizeTasks(data["tasks"]),
	}

	return flow
}

func normalizeMetadataFields(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return []map[string]any{}
	}

	fields := make([]map[string]any, 0, len(items))
	for _, item := range items {
		switch typed := item.(type) {
		case string:
			fields = append(fields, map[string]any{"name": typed})
		case map[string]any:
			fields = append(fields, typed)
		}
	}

	return fields
}

func normalizeTasks(value any) []flogoTask {
	items, ok := value.([]any)
	if !ok {
		return []flogoTask{}
	}

	tasks := make([]flogoTask, 0, len(items))
	for _, item := range items {
		record, ok := item.(map[string]any)
		if !ok {
			continue
		}

		activityRef := stringValue(record["activityRef"])
		if activityRef == "" {
			if activity, ok := record["activity"].(map[string]any); ok {
				activityRef = stringValue(activity["ref"])
			}
		}

		tasks = append(tasks, flogoTask{
			ID:          stringValue(record["id"]),
			Name:        stringValue(record["name"]),
			ActivityRef: activityRef,
			Input:       mapValue(record["input"]),
			Output:      mapValue(record["output"]),
			Settings:    mapValue(record["settings"]),
		})
	}

	return tasks
}

func buildContribCatalog(app flogoApp, appPath string) contribCatalog {
	entries := map[string]contribDescriptor{}
	diagnostics := []diagnostic{}
	upsert := func(descriptor contribDescriptor) {
		key := descriptor.Type + ":" + valueOrFallback(descriptor.Alias, descriptor.Ref)
		entries[key] = descriptor
	}

	for _, entry := range app.Imports {
		descriptor, entryDiagnostics := buildDescriptorForApp(app, appPath, entry.Ref, entry.Alias, entry.Version, "")
		upsert(descriptor)
		diagnostics = append(diagnostics, entryDiagnostics...)
	}

	for _, trigger := range app.Triggers {
		descriptor, entryDiagnostics := buildDescriptorForApp(app, appPath, trigger.Ref, inferAlias(trigger.Ref), "", "trigger")
		upsert(descriptor)
		diagnostics = append(diagnostics, entryDiagnostics...)
	}

	for _, flow := range app.Resources {
		upsert(contribDescriptor{
			Ref:   "#flow:" + flow.ID,
			Alias: "flow",
			Type:  "action",
			Name:  valueOrFallback(flow.Name, flow.ID),
			Title: valueOrFallback(flow.Name, flow.ID),
			Settings: []contribField{},
			Inputs:   metadataFieldsToContrib(flow.MetadataInput, "input"),
			Outputs:  metadataFieldsToContrib(flow.MetadataOutput, "output"),
			Examples: []string{"Invoke reusable flow " + flow.ID},
			CompatibilityNotes: []string{
				"Flow resources behave like reusable actions",
			},
			Source: "flow-resource",
		})

		for _, task := range flow.Tasks {
			if task.ActivityRef != "" {
				descriptor, entryDiagnostics := buildDescriptorForApp(app, appPath, task.ActivityRef, inferAlias(task.ActivityRef), "", "")
				upsert(descriptor)
				diagnostics = append(diagnostics, entryDiagnostics...)
			}
		}
	}

	sorted := make([]contribDescriptor, 0, len(entries))
	for _, entry := range entries {
		sorted = append(sorted, entry)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Name < sorted[j].Name
	})

	return contribCatalog{
		AppName:     app.Name,
		Entries:     sorted,
		Diagnostics: dedupeDiagnostics(diagnostics),
	}
}

func metadataFieldsToContrib(fields []map[string]any, prefix string) []contribField {
	result := make([]contribField, 0, len(fields))
	for index, item := range fields {
		name := stringValue(item["name"])
		if name == "" {
			name = fmt.Sprintf("%s_%d", prefix, index)
		}
		result = append(result, contribField{
			Name:     name,
			Type:     stringValue(item["type"]),
			Required: boolValue(item["required"]),
		})
	}
	return result
}

func introspectContrib(app flogoApp, appPath string, refOrAlias string) (contribDescriptor, []diagnostic, bool) {
	if strings.HasPrefix(refOrAlias, "#flow:") {
		flowID := strings.TrimPrefix(refOrAlias, "#flow:")
		for _, flow := range app.Resources {
			if flow.ID == flowID {
				return contribDescriptor{
					Ref:   "#flow:" + flow.ID,
					Alias: "flow",
					Type:  "action",
					Name:  valueOrFallback(flow.Name, flow.ID),
					Title: valueOrFallback(flow.Name, flow.ID),
					Inputs:  metadataFieldsToContrib(flow.MetadataInput, "input"),
					Outputs: metadataFieldsToContrib(flow.MetadataOutput, "output"),
					Examples: []string{"Invoke reusable flow " + flow.ID},
					CompatibilityNotes: []string{"Flow resources behave like reusable actions"},
					Source: "flow-resource",
				}, []diagnostic{}, true
			}
		}
	}

	ref, alias, version, forcedType, ok := resolveAppRef(app, refOrAlias)
	if !ok {
		return contribDescriptor{}, []diagnostic{}, false
	}

	descriptor, diagnostics := buildDescriptorForApp(app, appPath, ref, alias, version, forcedType)
	return descriptor, diagnostics, true
}

func previewMapping(app flogoApp, nodeID string, context mappingPreviewContext) mappingPreviewResult {
	flowID, task, ok := locateTask(app, nodeID)
	if !ok {
		return mappingPreviewResult{
			NodeID:             nodeID,
			Fields:             []mappingPreviewField{},
			SuggestedCoercions: []diagnostic{},
			Diagnostics: []diagnostic{
				{Code: "flogo.mapping.node_not_found", Message: fmt.Sprintf("Unable to locate node %q", nodeID), Severity: "error", Path: nodeID},
			},
		}
	}

	fields := []mappingPreviewField{}
	fields = append(fields, collectMappingFields("input", task.Input, context)...)
	fields = append(fields, collectMappingFields("settings", task.Settings, context)...)
	fields = append(fields, collectMappingFields("output", task.Output, context)...)

	diagnostics := []diagnostic{}
	for _, field := range fields {
		diagnostics = append(diagnostics, field.Diagnostics...)
	}

	return mappingPreviewResult{
		NodeID:             nodeID,
		FlowID:             flowID,
		Fields:             fields,
		SuggestedCoercions: []diagnostic{},
		Diagnostics:        diagnostics,
	}
}

func locateTask(app flogoApp, nodeID string) (string, flogoTask, bool) {
	for _, flow := range app.Resources {
		for _, task := range flow.Tasks {
			if task.ID == nodeID {
				return flow.ID, task, true
			}
		}
	}
	return "", flogoTask{}, false
}

func collectMappingFields(prefix string, value any, context mappingPreviewContext) []mappingPreviewField {
	if value == nil {
		return []mappingPreviewField{}
	}

	switch typed := value.(type) {
	case []any:
		fields := []mappingPreviewField{
			{
				Path:        prefix,
				Kind:        "array",
				References:  collectResolverReferences(toJSONString(typed)),
				Resolved:    resolveValue(typed, context),
				Diagnostics: []diagnostic{},
			},
		}
		for index, item := range typed {
			fields = append(fields, collectMappingFields(fmt.Sprintf("%s[%d]", prefix, index), item, context)...)
		}
		return fields
	case map[string]any:
		fields := []mappingPreviewField{
			{
				Path:        prefix,
				Kind:        "object",
				References:  collectResolverReferences(toJSONString(typed)),
				Resolved:    resolveValue(typed, context),
				Diagnostics: []diagnostic{},
			},
		}
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			fields = append(fields, collectMappingFields(prefix+"."+key, typed[key], context)...)
		}
		return fields
	case string:
		references := collectResolverReferences(typed)
		resolved, diagnostics := resolveString(typed, context, prefix)
		field := mappingPreviewField{
			Path:        prefix,
			Kind:        classifyValue(typed),
			Expression:  typed,
			References:  references,
			Resolved:    resolved,
			Diagnostics: diagnostics,
		}
		return []mappingPreviewField{field}
	default:
		return []mappingPreviewField{
			{
				Path:        prefix,
				Kind:        classifyValue(typed),
				References:  []string{},
				Resolved:    typed,
				Diagnostics: []diagnostic{},
			},
		}
	}
}

func classifyValue(value any) string {
	switch typed := value.(type) {
	case []any:
		return "array"
	case map[string]any:
		return "object"
	case string:
		if strings.Contains(typed, "$") {
			return "expression"
		}
		return "literal"
	default:
		return "literal"
	}
}

func collectResolverReferences(value string) []string {
	matches := resolverPattern.FindAllStringSubmatch(value, -1)
	seen := map[string]bool{}
	references := []string{}
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		reference := "$" + match[1]
		if !seen[reference] {
			seen[reference] = true
			references = append(references, reference)
		}
	}
	return references
}

func resolveValue(value any, context mappingPreviewContext) any {
	switch typed := value.(type) {
	case []any:
		resolved := make([]any, 0, len(typed))
		for _, item := range typed {
			resolved = append(resolved, resolveValue(item, context))
		}
		return resolved
	case map[string]any:
		resolved := map[string]any{}
		for key, item := range typed {
			resolved[key] = resolveValue(item, context)
		}
		return resolved
	case string:
		resolved, _ := resolveString(typed, context, "")
		return resolved
	default:
		return typed
	}
}

func resolveString(value string, context mappingPreviewContext, path string) (any, []diagnostic) {
	references := collectResolverReferences(value)
	if len(references) == 0 {
		return value, []diagnostic{}
	}

	diagnostics := []diagnostic{}
	if len(references) == 1 && references[0] == value {
		resolved, ok := resolveReference(references[0], context)
		if !ok {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.mapping.unresolved_reference",
				Message:  fmt.Sprintf("Unable to resolve reference %s", references[0]),
				Severity: "warning",
				Path:     path,
			})
		}
		return resolved, diagnostics
	}

	resolved := value
	for _, reference := range references {
		replacement, ok := resolveReference(reference, context)
		if !ok {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.mapping.unresolved_reference",
				Message:  fmt.Sprintf("Unable to resolve reference %s", reference),
				Severity: "warning",
				Path:     path,
			})
			replacement = ""
		}
		resolved = strings.ReplaceAll(resolved, reference, fmt.Sprint(replacement))
	}

	return resolved, diagnostics
}

func resolveReference(reference string, context mappingPreviewContext) (any, bool) {
	switch {
	case strings.HasPrefix(reference, "$activity["):
		pattern := regexp.MustCompile(`^\$activity\[([^\]]+)\](?:\.(.+))?$`)
		match := pattern.FindStringSubmatch(reference)
		if len(match) == 0 {
			return nil, false
		}
		activityID := match[1]
		path := ""
		if len(match) > 2 {
			path = match[2]
		}
		value, ok := resolveByPath(toAnyMap(context.Activity[activityID]), path)
		return value, ok
	case strings.HasPrefix(reference, "$flow"):
		return resolveByPath(context.Flow, strings.TrimPrefix(strings.TrimPrefix(reference, "$flow"), "."))
	case strings.HasPrefix(reference, "$env"):
		return resolveByPath(context.Env, strings.TrimPrefix(strings.TrimPrefix(reference, "$env"), "."))
	case strings.HasPrefix(reference, "$property"):
		return resolveByPath(context.Property, strings.TrimPrefix(strings.TrimPrefix(reference, "$property"), "."))
	case strings.HasPrefix(reference, "$trigger"):
		return resolveByPath(context.Trigger, strings.TrimPrefix(strings.TrimPrefix(reference, "$trigger"), "."))
	default:
		return nil, false
	}
}

func resolveByPath(value map[string]any, path string) (any, bool) {
	if path == "" {
		if value == nil {
			return nil, false
		}
		return value, true
	}

	current := any(value)
	segments := strings.Split(path, ".")
	for _, segment := range segments {
		record, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		next, ok := record[segment]
		if !ok {
			return nil, false
		}
		current = next
	}

	return current, true
}

func buildDescriptorForApp(
	app flogoApp,
	appPath string,
	ref string,
	alias string,
	version string,
	forcedType string,
) (contribDescriptor, []diagnostic) {
	resolvedRef := resolveImportRef(app, ref, alias)
	normalizedAlias := alias
	if normalizedAlias == "" {
		normalizedAlias = inferAlias(resolvedRef)
	}

	descriptorPath := findDescriptorFile(appPath, resolvedRef)
	if descriptorPath != "" {
		return parseDescriptorFile(descriptorPath, resolvedRef, normalizedAlias, version, forcedType), []diagnostic{}
	}

	descriptor := buildDescriptor(resolvedRef, normalizedAlias, version, forcedType)
	code := "flogo.contrib.registry_fallback"
	message := fmt.Sprintf("Descriptor metadata for %q was not found on disk; using registry fallback metadata", resolvedRef)
	severity := "info"
	if descriptor.Source == "inferred" {
		code = "flogo.contrib.inferred_metadata"
		message = fmt.Sprintf("Descriptor metadata for %q was not found on disk; using inferred metadata", resolvedRef)
		severity = "warning"
	}

	return descriptor, []diagnostic{
		{
			Code:     code,
			Message:  message,
			Severity: severity,
			Path:     normalizedAlias,
		},
	}
}

func resolveAppRef(app flogoApp, refOrAlias string) (string, string, string, string, bool) {
	normalized := normalizeAlias(refOrAlias)
	for _, entry := range app.Imports {
		if entry.Alias == normalized || entry.Ref == refOrAlias || entry.Ref == normalized {
			return entry.Ref, entry.Alias, entry.Version, "", true
		}
	}

	for _, trigger := range app.Triggers {
		if trigger.Ref == refOrAlias || normalizeAlias(trigger.Ref) == normalized {
			return resolveImportRef(app, trigger.Ref, inferAlias(trigger.Ref)), inferAlias(trigger.Ref), "", "trigger", true
		}
	}

	for _, flow := range app.Resources {
		for _, task := range flow.Tasks {
			if task.ActivityRef != "" && (task.ActivityRef == refOrAlias || normalizeAlias(task.ActivityRef) == normalized) {
				return resolveImportRef(app, task.ActivityRef, inferAlias(task.ActivityRef)), inferAlias(task.ActivityRef), "", "", true
			}
		}
	}

	if strings.HasPrefix(refOrAlias, "#") || refOrAlias != "" {
		return resolveImportRef(app, refOrAlias, normalized), normalized, "", "", true
	}

	return "", "", "", "", false
}

func resolveImportRef(app flogoApp, ref string, alias string) string {
	if !strings.HasPrefix(ref, "#") {
		return ref
	}
	normalizedAlias := normalizeAlias(alias)
	for _, entry := range app.Imports {
		if entry.Alias == normalizedAlias {
			return entry.Ref
		}
	}
	return ref
}

func findDescriptorFile(appPath string, ref string) string {
	normalizedRef := strings.TrimPrefix(ref, "#")
	normalizedRef = strings.ReplaceAll(normalizedRef, "\\", "/")
	roots := buildSearchRoots(appPath)
	refBase := filepath.Base(normalizedRef)

	for _, root := range roots {
		candidates := []string{
			filepath.Join(root, filepath.FromSlash(normalizedRef), "descriptor.json"),
			filepath.Join(root, "vendor", filepath.FromSlash(normalizedRef), "descriptor.json"),
			filepath.Join(root, ".flogo", "descriptors", filepath.FromSlash(normalizedRef), "descriptor.json"),
			filepath.Join(root, "descriptors", filepath.FromSlash(normalizedRef), "descriptor.json"),
		}
		if refBase != "" {
			candidates = append(candidates,
				filepath.Join(root, refBase, "descriptor.json"),
				filepath.Join(root, "descriptors", refBase, "descriptor.json"),
			)
		}

		for _, candidate := range candidates {
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
		}
	}

	return ""
}

func buildSearchRoots(appPath string) []string {
	roots := map[string]struct{}{}
	cwd, err := os.Getwd()
	if err == nil {
		roots[cwd] = struct{}{}
	}

	if appPath != "" {
		appDir := filepath.Dir(appPath)
		roots[appDir] = struct{}{}
		roots[filepath.Dir(appDir)] = struct{}{}
	}

	for _, root := range strings.Split(os.Getenv("FLOGO_DESCRIPTOR_SEARCH_PATHS"), string(os.PathListSeparator)) {
		trimmed := strings.TrimSpace(root)
		if trimmed != "" {
			roots[trimmed] = struct{}{}
		}
	}

	result := make([]string, 0, len(roots))
	for root := range roots {
		result = append(result, root)
	}
	sort.Strings(result)
	return result
}

func parseDescriptorFile(descriptorPath string, ref string, alias string, version string, forcedType string) contribDescriptor {
	contents, err := os.ReadFile(descriptorPath)
	if err != nil {
		fail(err.Error())
	}

	var raw map[string]any
	if err := json.Unmarshal(contents, &raw); err != nil {
		fail(err.Error())
	}

	descriptorType := normalizeDescriptorType(raw["type"])
	if descriptorType == "" {
		descriptorType = forcedType
	}
	if descriptorType == "" {
		descriptorType = inferContribType(ref)
	}

	return contribDescriptor{
		Ref:                ref,
		Alias:              alias,
		Type:               descriptorType,
		Name:               valueOrFallback(stringValue(raw["name"]), valueOrFallback(alias, inferAlias(ref))),
		Version:            valueOrFallback(stringValue(raw["version"]), version),
		Title:              stringValue(raw["title"]),
		Settings:           normalizeDescriptorFields(raw["settings"]),
		Inputs:             normalizeDescriptorFields(firstNonNil(raw["input"], raw["inputs"])),
		Outputs:            normalizeDescriptorFields(firstNonNil(raw["output"], raw["outputs"])),
		Examples:           normalizeStringArray(raw["examples"]),
		CompatibilityNotes: normalizeStringArray(raw["compatibilityNotes"]),
		Source:             "descriptor",
	}
}

func normalizeDescriptorType(value any) string {
	if typed, ok := value.(string); ok && (typed == "trigger" || typed == "activity" || typed == "action") {
		return typed
	}
	return ""
}

func normalizeDescriptorFields(value any) []contribField {
	items, ok := value.([]any)
	if !ok {
		return []contribField{}
	}

	fields := make([]contribField, 0, len(items))
	for index, item := range items {
		switch typed := item.(type) {
		case string:
			fields = append(fields, contribField{Name: typed, Required: false})
		case map[string]any:
			name := stringValue(typed["name"])
			if name == "" {
				name = fmt.Sprintf("field_%d", index)
			}
			fields = append(fields, contribField{
				Name:        name,
				Type:        stringValue(typed["type"]),
				Required:    boolValue(typed["required"]),
				Description: stringValue(typed["description"]),
			})
		}
	}

	return fields
}

func normalizeStringArray(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return []string{}
	}

	result := make([]string, 0, len(items))
	for _, item := range items {
		if typed, ok := item.(string); ok {
			result = append(result, typed)
		}
	}
	return result
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func dedupeDiagnostics(items []diagnostic) []diagnostic {
	seen := map[string]bool{}
	result := make([]diagnostic, 0, len(items))
	for _, item := range items {
		key := item.Code + ":" + item.Path + ":" + item.Message
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	return result
}

func buildDescriptor(ref string, alias string, version string, forcedType string) contribDescriptor {
	normalizedAlias := alias
	if normalizedAlias == "" {
		normalizedAlias = inferAlias(ref)
	}
	registry, ok := knownRegistry[normalizeAlias(normalizedAlias)]
	descriptor := contribDescriptor{
		Ref:     ref,
		Alias:   normalizedAlias,
		Type:    inferContribType(ref),
		Name:    valueOrFallback(normalizedAlias, ref),
		Version: version,
		Title:   valueOrFallback(normalizedAlias, ref),
		Settings: []contribField{},
		Inputs:   []contribField{},
		Outputs:  []contribField{},
		Examples: []string{},
		CompatibilityNotes: []string{},
		Source: "inferred",
	}

	if ok {
		descriptor.Type = registry.Type
		descriptor.Name = registry.Name
		descriptor.Title = registry.Title
		descriptor.Settings = registry.Settings
		descriptor.Inputs = registry.Inputs
		descriptor.Outputs = registry.Outputs
		descriptor.Examples = registry.Examples
		descriptor.CompatibilityNotes = registry.CompatibilityNotes
		descriptor.Source = registry.Source
	}

	if forcedType != "" {
		descriptor.Type = forcedType
	}

	return descriptor
}

func inferContribType(ref string) string {
	switch {
	case strings.Contains(ref, "/trigger/"), strings.HasPrefix(ref, "#rest"), strings.HasPrefix(ref, "#timer"), strings.HasPrefix(ref, "#cli"), strings.HasPrefix(ref, "#channel"):
		return "trigger"
	case strings.Contains(ref, "/activity/"), strings.HasPrefix(ref, "#log"):
		return "activity"
	default:
		return "action"
	}
}

func inferAlias(ref string) string {
	if strings.HasPrefix(ref, "#flow:") {
		return "flow"
	}
	if strings.HasPrefix(ref, "#") {
		trimmed := strings.TrimPrefix(ref, "#")
		parts := strings.Split(trimmed, ".")
		return normalizeAlias(parts[0])
	}
	parts := strings.Split(ref, "/")
	if len(parts) == 0 {
		return ""
	}
	return normalizeAlias(parts[len(parts)-1])
}

func normalizeAlias(alias string) string {
	return strings.TrimSpace(strings.TrimPrefix(alias, "#"))
}

func mapValue(value any) map[string]any {
	if record, ok := value.(map[string]any); ok {
		return record
	}
	return map[string]any{}
}

func toAnyMap(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return value
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func boolValue(value any) bool {
	typed, ok := value.(bool)
	return ok && typed
}

func valueOrFallback(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func toJSONString(value any) string {
	bytes, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(bytes)
}

func encode(value any) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		fail(err.Error())
	}
}

func lookupFlag(name string) string {
	for index := 3; index < len(os.Args); index++ {
		if os.Args[index] == name && index+1 < len(os.Args) {
			return os.Args[index+1]
		}
	}
	return ""
}

func fail(message string) {
	_, _ = fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
