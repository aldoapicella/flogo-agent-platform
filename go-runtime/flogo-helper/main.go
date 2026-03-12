package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
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
	Ref                string           `json:"ref"`
	Alias              string           `json:"alias,omitempty"`
	Type               string           `json:"type"`
	Name               string           `json:"name"`
	Version            string           `json:"version,omitempty"`
	Title              string           `json:"title,omitempty"`
	Settings           []contribField   `json:"settings"`
	Inputs             []contribField   `json:"inputs"`
	Outputs            []contribField   `json:"outputs"`
	Examples           []string         `json:"examples"`
	CompatibilityNotes []string         `json:"compatibilityNotes"`
	Source             string           `json:"source,omitempty"`
	Evidence           *contribEvidence `json:"evidence,omitempty"`
}

type contribCatalog struct {
	AppName     string              `json:"appName,omitempty"`
	Entries     []contribDescriptor `json:"entries"`
	Diagnostics []diagnostic        `json:"diagnostics"`
}

type contributionInventoryEntry struct {
	Ref                    string             `json:"ref"`
	Alias                  string             `json:"alias,omitempty"`
	Type                   string             `json:"type"`
	Name                   string             `json:"name"`
	Version                string             `json:"version,omitempty"`
	Title                  string             `json:"title,omitempty"`
	Source                 string             `json:"source"`
	DescriptorPath         string             `json:"descriptorPath,omitempty"`
	PackageRoot            string             `json:"packageRoot,omitempty"`
	ModulePath             string             `json:"modulePath,omitempty"`
	GoPackagePath          string             `json:"goPackagePath,omitempty"`
	Confidence             string             `json:"confidence"`
	DiscoveryReason        string             `json:"discoveryReason,omitempty"`
	PackageDescriptorFound bool               `json:"packageDescriptorFound"`
	PackageMetadataFound   bool               `json:"packageMetadataFound"`
	VersionSource          string             `json:"versionSource,omitempty"`
	SignatureCompleteness  string             `json:"signatureCompleteness"`
	Settings               []contribField     `json:"settings"`
	Inputs                 []contribField     `json:"inputs"`
	Outputs                []contribField     `json:"outputs"`
	Diagnostics            []diagnostic       `json:"diagnostics"`
	Descriptor             *contribDescriptor `json:"descriptor,omitempty"`
}

type contributionInventory struct {
	AppName     string                       `json:"appName,omitempty"`
	Entries     []contributionInventoryEntry `json:"entries"`
	Diagnostics []diagnostic                 `json:"diagnostics"`
}

type contribEvidence struct {
	Source                 string       `json:"source"`
	ResolvedRef            string       `json:"resolvedRef"`
	DescriptorPath         string       `json:"descriptorPath,omitempty"`
	PackageRoot            string       `json:"packageRoot,omitempty"`
	ModulePath             string       `json:"modulePath,omitempty"`
	GoPackagePath          string       `json:"goPackagePath,omitempty"`
	ImportAlias            string       `json:"importAlias,omitempty"`
	Version                string       `json:"version,omitempty"`
	Confidence             string       `json:"confidence"`
	PackageDescriptorFound bool         `json:"packageDescriptorFound"`
	PackageMetadataFound   bool         `json:"packageMetadataFound"`
	VersionSource          string       `json:"versionSource,omitempty"`
	SignatureCompleteness  string       `json:"signatureCompleteness"`
	Diagnostics            []diagnostic `json:"diagnostics"`
}

type contribDescriptorResponse struct {
	Descriptor  contribDescriptor `json:"descriptor"`
	Diagnostics []diagnostic      `json:"diagnostics"`
}

type contribEvidenceResponse struct {
	Evidence contributionInventoryEntry `json:"evidence"`
}

type aliasIssue struct {
	Kind     string `json:"kind"`
	Alias    string `json:"alias"`
	Ref      string `json:"ref,omitempty"`
	Path     string `json:"path"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}

type orphanedRef struct {
	Ref      string `json:"ref"`
	Kind     string `json:"kind"`
	Path     string `json:"path"`
	Reason   string `json:"reason"`
	Severity string `json:"severity"`
}

type versionFinding struct {
	Alias           string `json:"alias"`
	Ref             string `json:"ref"`
	DeclaredVersion string `json:"declaredVersion,omitempty"`
	Status          string `json:"status"`
	Message         string `json:"message"`
	Severity        string `json:"severity"`
}

type governanceReport struct {
	AppName          string           `json:"appName"`
	Ok               bool             `json:"ok"`
	AliasIssues      []aliasIssue     `json:"aliasIssues"`
	OrphanedRefs     []orphanedRef    `json:"orphanedRefs"`
	VersionFindings  []versionFinding `json:"versionFindings"`
	InventorySummary *struct {
		EntryCount         int `json:"entryCount"`
		PackageBackedCount int `json:"packageBackedCount"`
		FallbackCount      int `json:"fallbackCount"`
	} `json:"inventorySummary,omitempty"`
	UnresolvedPackages     []string     `json:"unresolvedPackages"`
	FallbackContribs       []string     `json:"fallbackContribs"`
	WeakEvidenceContribs   []string     `json:"weakEvidenceContribs"`
	PackageBackedContribs  []string     `json:"packageBackedContribs"`
	DescriptorOnlyContribs []string     `json:"descriptorOnlyContribs"`
	Diagnostics            []diagnostic `json:"diagnostics"`
}

type compositionDifference struct {
	Path     string `json:"path"`
	Kind     string `json:"kind"`
	Expected any    `json:"expected,omitempty"`
	Actual   any    `json:"actual,omitempty"`
	Severity string `json:"severity"`
}

type compositionCompareResult struct {
	AppName                string                  `json:"appName"`
	Ok                     bool                    `json:"ok"`
	CanonicalHash          string                  `json:"canonicalHash"`
	ProgrammaticHash       string                  `json:"programmaticHash"`
	ComparisonBasis        string                  `json:"comparisonBasis"`
	SignatureEvidenceLevel string                  `json:"signatureEvidenceLevel"`
	InventoryRefsUsed      []string                `json:"inventoryRefsUsed"`
	Differences            []compositionDifference `json:"differences"`
	Diagnostics            []diagnostic            `json:"diagnostics"`
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

type mappingPath struct {
	NodeID           string `json:"nodeId"`
	MappingKey       string `json:"mappingKey"`
	SourceExpression string `json:"sourceExpression,omitempty"`
	TargetPath       string `json:"targetPath"`
}

type mappingPreviewResult struct {
	NodeID              string                `json:"nodeId"`
	FlowID              string                `json:"flowId,omitempty"`
	Fields              []mappingPreviewField `json:"fields"`
	Paths               []mappingPath         `json:"paths"`
	ResolvedValues      map[string]any        `json:"resolvedValues"`
	ScopeDiagnostics    []diagnostic          `json:"scopeDiagnostics"`
	CoercionDiagnostics []diagnostic          `json:"coercionDiagnostics"`
	SuggestedCoercions  []diagnostic          `json:"suggestedCoercions"`
	Diagnostics         []diagnostic          `json:"diagnostics"`
}

type propertyPlanRecommendation struct {
	Source    string `json:"source"`
	Name      string `json:"name"`
	Rationale string `json:"rationale"`
}

type propertyDefinitionRecommendation struct {
	Name         string `json:"name"`
	Rationale    string `json:"rationale"`
	InferredType string `json:"inferredType,omitempty"`
}

type envRecommendation struct {
	Name      string `json:"name"`
	Rationale string `json:"rationale"`
}

type propertyPlan struct {
	DeclaredProperties    []string                           `json:"declaredProperties"`
	PropertyRefs          []string                           `json:"propertyRefs"`
	EnvRefs               []string                           `json:"envRefs"`
	UndefinedPropertyRefs []string                           `json:"undefinedPropertyRefs"`
	UnusedProperties      []string                           `json:"unusedProperties"`
	DeploymentProfile     string                             `json:"deploymentProfile"`
	Recommendations       []propertyPlanRecommendation       `json:"recommendations"`
	RecommendedProperties []propertyDefinitionRecommendation `json:"recommendedProperties"`
	RecommendedEnv        []envRecommendation                `json:"recommendedEnv"`
	RecommendedSecretEnv  []envRecommendation                `json:"recommendedSecretEnv"`
	RecommendedPlainEnv   []envRecommendation                `json:"recommendedPlainEnv"`
	DeploymentNotes       []string                           `json:"deploymentNotes"`
	ProfileSpecificNotes  []string                           `json:"profileSpecificNotes"`
	Diagnostics           []diagnostic                       `json:"diagnostics"`
}

type propertyPlanResponse struct {
	PropertyPlan propertyPlan `json:"propertyPlan"`
}

type mappingDifference struct {
	Path     string `json:"path"`
	Expected any    `json:"expected,omitempty"`
	Actual   any    `json:"actual,omitempty"`
	Message  string `json:"message"`
}

type mappingTestResult struct {
	Pass         bool                `json:"pass"`
	NodeID       string              `json:"nodeId"`
	ActualOutput map[string]any      `json:"actualOutput"`
	Differences  []mappingDifference `json:"differences"`
	Diagnostics  []diagnostic        `json:"diagnostics"`
}

type mappingTestResponse struct {
	Result       mappingTestResult `json:"result"`
	PropertyPlan propertyPlan      `json:"propertyPlan"`
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

type descriptorCandidate struct {
	DescriptorPath string
	PackageRoot    string
	ModulePath     string
	GoPackagePath  string
	PackageVersion string
	Source         string
}

type goModuleInfo struct {
	Root       string
	ModulePath string
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
	case "inventory contribs":
		encode(buildContributionInventory(app, appPath))
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
	case "evidence inspect":
		ref := lookupFlag("--ref")
		if ref == "" {
			fail("missing required --ref flag")
		}
		evidence, ok := inspectContribEvidence(app, appPath, ref)
		if !ok {
			fail(fmt.Sprintf("contribution evidence %q was not found", ref))
		}
		encode(contribEvidenceResponse{
			Evidence: evidence,
		})
	case "governance validate":
		encode(validateGovernance(app, appPath))
	case "compose compare":
		target := lookupFlag("--target")
		resourceID := lookupFlag("--resource")
		if target == "" {
			target = "app"
		}
		encode(compareComposition(app, appPath, target, resourceID))
	case "preview mapping":
		nodeID := lookupFlag("--node")
		if nodeID == "" {
			fail("missing required --node flag")
		}
		context := loadPreviewContext(lookupFlag("--input"))
		encode(previewMapping(app, appPath, nodeID, context))
	case "mapping test":
		nodeID := lookupFlag("--node")
		if nodeID == "" {
			fail("missing required --node flag")
		}
		context := loadPreviewContext(lookupFlag("--input"))
		expected := loadExpectedOutput(lookupFlag("--expected"))
		strict := lookupFlag("--strict") != "false"
		encode(runMappingTest(app, appPath, nodeID, context, expected, strict))
	case "properties plan":
		profile := lookupFlag("--profile")
		if profile == "" {
			profile = "rest_service"
		}
		encode(propertyPlanResponse{
			PropertyPlan: analyzePropertyUsage(app, profile),
		})
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

func loadExpectedOutput(inputPath string) map[string]any {
	if inputPath == "" {
		return map[string]any{}
	}

	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	if len(contents) == 0 {
		return map[string]any{}
	}

	var expected map[string]any
	if err := json.Unmarshal(contents, &expected); err != nil {
		fail(err.Error())
	}

	return expected
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

func buildContributionInventory(app flogoApp, appPath string) contributionInventory {
	entries := map[string]contributionInventoryEntry{}
	diagnostics := []diagnostic{}
	upsert := func(entry contributionInventoryEntry) {
		key := entry.Type + ":" + valueOrFallback(entry.Alias, entry.Ref)
		existing, ok := entries[key]
		if !ok || compareEvidenceStrength(entry.Source, existing.Source) >= 0 {
			entries[key] = entry
		}
	}

	for _, entry := range app.Imports {
		inventoryEntry, entryDiagnostics := buildInventoryEntryForApp(app, appPath, entry.Ref, entry.Alias, entry.Version, "")
		upsert(inventoryEntry)
		diagnostics = append(diagnostics, entryDiagnostics...)
	}

	for _, trigger := range app.Triggers {
		alias := inferAlias(trigger.Ref)
		if alias == "flow" {
			continue
		}
		inventoryEntry, entryDiagnostics := buildInventoryEntryForApp(app, appPath, trigger.Ref, alias, "", "trigger")
		upsert(inventoryEntry)
		diagnostics = append(diagnostics, entryDiagnostics...)
	}

	for _, flow := range app.Resources {
		upsert(buildFlowInventoryEntry(flow))
		for _, task := range flow.Tasks {
			if task.ActivityRef == "" {
				continue
			}
			alias := inferAlias(task.ActivityRef)
			if alias == "flow" {
				continue
			}
			inventoryEntry, entryDiagnostics := buildInventoryEntryForApp(app, appPath, task.ActivityRef, alias, "", "")
			upsert(inventoryEntry)
			diagnostics = append(diagnostics, entryDiagnostics...)
		}
	}

	sorted := make([]contributionInventoryEntry, 0, len(entries))
	for _, entry := range entries {
		sorted = append(sorted, entry)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Name < sorted[j].Name
	})

	return contributionInventory{
		AppName:     app.Name,
		Entries:     sorted,
		Diagnostics: dedupeDiagnostics(diagnostics),
	}
}

func buildContribCatalog(app flogoApp, appPath string) contribCatalog {
	inventory := buildContributionInventory(app, appPath)
	entries := map[string]contribDescriptor{}
	upsert := func(descriptor contribDescriptor) {
		key := descriptor.Type + ":" + valueOrFallback(descriptor.Alias, descriptor.Ref)
		entries[key] = descriptor
	}

	for _, entry := range inventory.Entries {
		upsert(inventoryEntryToDescriptor(entry))
	}

	for _, trigger := range app.Triggers {
		entry, _ := buildInventoryEntryForApp(app, appPath, trigger.Ref, inferAlias(trigger.Ref), "", "trigger")
		upsert(withCatalogRef(inventoryEntryToDescriptor(entry), trigger.Ref))
	}

	for _, flow := range app.Resources {
		upsert(inventoryEntryToDescriptor(buildFlowInventoryEntry(flow)))
		for _, task := range flow.Tasks {
			if task.ActivityRef == "" {
				continue
			}
			entry, _ := buildInventoryEntryForApp(app, appPath, task.ActivityRef, inferAlias(task.ActivityRef), "", "")
			upsert(withCatalogRef(inventoryEntryToDescriptor(entry), task.ActivityRef))
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
		Diagnostics: inventory.Diagnostics,
	}
}

func validateGovernance(app flogoApp, appPath string) governanceReport {
	inventory := buildContributionInventory(app, appPath)
	aliasIssues := []aliasIssue{}
	orphanedRefs := []orphanedRef{}
	versionFindings := []versionFinding{}
	diagnostics := []diagnostic{}
	importsByAlias := map[string][]flogoImport{}
	refToAliases := map[string]map[string]bool{}
	usedAliases := map[string]bool{}
	resourceIDs := map[string]bool{}
	inventoryByAlias := map[string]contributionInventoryEntry{}
	unresolvedPackages := []string{}
	fallbackContribs := []string{}
	weakEvidenceContribs := []string{}
	packageBackedContribs := []string{}
	descriptorOnlyContribs := []string{}

	for _, entry := range inventory.Entries {
		if entry.Alias != "" {
			inventoryByAlias[entry.Alias] = entry
		}
		if entry.Source == "inferred" {
			unresolvedPackages = append(unresolvedPackages, entry.Ref)
		}
		if entry.Source == "registry" || entry.Source == "inferred" {
			fallbackContribs = append(fallbackContribs, entry.Ref)
		}
		if entry.Confidence == "low" || entry.Source == "registry" {
			weakEvidenceContribs = append(weakEvidenceContribs, entry.Ref)
		}
		if entry.Source == "package_descriptor" || entry.Source == "package_source" {
			packageBackedContribs = append(packageBackedContribs, entry.Ref)
		}
		if entry.Source == "app_descriptor" || entry.Source == "workspace_descriptor" {
			descriptorOnlyContribs = append(descriptorOnlyContribs, entry.Ref)
		}
	}
	sort.Strings(unresolvedPackages)
	sort.Strings(fallbackContribs)
	sort.Strings(weakEvidenceContribs)
	sort.Strings(packageBackedContribs)
	sort.Strings(descriptorOnlyContribs)

	for _, resource := range app.Resources {
		resourceIDs[resource.ID] = true
	}

	for _, entry := range app.Imports {
		importsByAlias[entry.Alias] = append(importsByAlias[entry.Alias], entry)
		if refToAliases[entry.Ref] == nil {
			refToAliases[entry.Ref] = map[string]bool{}
		}
		refToAliases[entry.Ref][entry.Alias] = true
		if entry.Version == "" {
			versionFindings = append(versionFindings, versionFinding{
				Alias:    entry.Alias,
				Ref:      entry.Ref,
				Status:   "missing",
				Message:  fmt.Sprintf("Import alias %q does not declare a version", entry.Alias),
				Severity: "info",
			})
		}
		if inventoryEntry, ok := inventoryByAlias[entry.Alias]; ok {
			inventoryVersion := inventoryEntry.Version
			if inventoryEntry.Descriptor != nil && inventoryVersion == "" {
				inventoryVersion = inventoryEntry.Descriptor.Version
			}
			if inventoryEntry.Source == "inferred" {
				orphanedRefs = append(orphanedRefs, orphanedRef{
					Ref:      entry.Ref,
					Kind:     inferContribType(entry.Ref),
					Path:     "imports." + entry.Alias,
					Reason:   fmt.Sprintf("Import alias %q could not be resolved from workspace or package metadata", entry.Alias),
					Severity: "error",
				})
			}
			if inventoryEntry.Source == "registry" {
				versionFindings = append(versionFindings, versionFinding{
					Alias:    entry.Alias,
					Ref:      entry.Ref,
					Status:   "ok",
					Message:  fmt.Sprintf("Import alias %q is using registry fallback metadata", entry.Alias),
					Severity: "warning",
				})
			}
			if entry.Version != "" && inventoryVersion != "" && entry.Version != inventoryVersion {
				versionFindings = append(versionFindings, versionFinding{
					Alias:           entry.Alias,
					Ref:             entry.Ref,
					DeclaredVersion: entry.Version,
					Status:          "conflict",
					Message:         fmt.Sprintf("Import alias %q declares version %q but resolved metadata reports %q", entry.Alias, entry.Version, inventoryVersion),
					Severity:        "warning",
				})
			}
		}
	}

	for alias, entries := range importsByAlias {
		if len(entries) > 1 {
			aliasIssues = append(aliasIssues, aliasIssue{
				Kind:     "duplicate_alias",
				Alias:    alias,
				Ref:      entries[0].Ref,
				Path:     "imports." + alias,
				Message:  fmt.Sprintf("Import alias %q is defined %d times", alias, len(entries)),
				Severity: "error",
			})
			versionFindings = append(versionFindings, versionFinding{
				Alias:    alias,
				Ref:      entries[0].Ref,
				Status:   "duplicate_alias",
				Message:  fmt.Sprintf("Import alias %q is defined multiple times", alias),
				Severity: "warning",
			})
		}

		refs := map[string]bool{}
		versions := map[string]bool{}
		for _, entry := range entries {
			refs[entry.Ref] = true
			if entry.Version != "" {
				versions[entry.Version] = true
			}
		}
		if len(refs) > 1 {
			aliasIssues = append(aliasIssues, aliasIssue{
				Kind:     "alias_ref_mismatch",
				Alias:    alias,
				Path:     "imports." + alias,
				Message:  fmt.Sprintf("Import alias %q points to multiple refs", alias),
				Severity: "warning",
			})
		}
		if len(versions) > 1 {
			versionFindings = append(versionFindings, versionFinding{
				Alias:    alias,
				Ref:      entries[0].Ref,
				Status:   "conflict",
				Message:  fmt.Sprintf("Import alias %q declares conflicting versions", alias),
				Severity: "warning",
			})
		}
	}

	for ref, aliases := range refToAliases {
		if len(aliases) > 1 {
			aliasList := make([]string, 0, len(aliases))
			for alias := range aliases {
				aliasList = append(aliasList, alias)
			}
			sort.Strings(aliasList)
			versionFindings = append(versionFindings, versionFinding{
				Alias:    strings.Join(aliasList, ", "),
				Ref:      ref,
				Status:   "conflict",
				Message:  fmt.Sprintf("Contrib ref %q is imported under multiple aliases", ref),
				Severity: "warning",
			})
		}
	}

	trackUsage := func(ref string, path string, kind string, implicitOnMissing bool) {
		if strings.HasPrefix(ref, "#flow:") {
			flowID := strings.TrimPrefix(ref, "#flow:")
			if !resourceIDs[flowID] {
				orphanedRefs = append(orphanedRefs, orphanedRef{
					Ref:      ref,
					Kind:     "flow",
					Path:     path,
					Reason:   fmt.Sprintf("Flow resource %q does not exist", flowID),
					Severity: "error",
				})
			}
			return
		}

		if strings.HasPrefix(ref, "#") {
			alias := inferAlias(ref)
			if alias == "" || alias == "flow" {
				return
			}
			if _, ok := importsByAlias[alias]; ok {
				usedAliases[alias] = true
				return
			}

			issueKind := "missing_import"
			severity := "error"
			message := fmt.Sprintf("Reference %q cannot be resolved because alias %q is not imported", ref, alias)
			if implicitOnMissing {
				issueKind = "implicit_alias_use"
				severity = "warning"
				message = fmt.Sprintf("Reference %q uses alias %q without a declared import", ref, alias)
			}
			aliasIssues = append(aliasIssues, aliasIssue{
				Kind:     issueKind,
				Alias:    alias,
				Ref:      ref,
				Path:     path,
				Message:  message,
				Severity: severity,
			})
			orphanedRefs = append(orphanedRefs, orphanedRef{
				Ref:      ref,
				Kind:     kind,
				Path:     path,
				Reason:   fmt.Sprintf("Alias %q is not imported", alias),
				Severity: severity,
			})
			return
		}

		for _, entry := range app.Imports {
			if entry.Ref == ref {
				usedAliases[entry.Alias] = true
			}
		}
	}

	for _, trigger := range app.Triggers {
		trackUsage(trigger.Ref, "triggers."+trigger.ID+".ref", "trigger", true)
		for _, handler := range trigger.Handlers {
			trackUsage(handler.ActionRef, "triggers."+trigger.ID+".handlers.action", "action", false)
		}
	}

	for _, flow := range app.Resources {
		for _, task := range flow.Tasks {
			if task.ActivityRef == "" {
				orphanedRefs = append(orphanedRefs, orphanedRef{
					Ref:      task.ID,
					Kind:     "activity",
					Path:     "resources." + flow.ID + ".tasks." + task.ID,
					Reason:   "Task is missing an activity ref",
					Severity: "warning",
				})
				continue
			}
			trackUsage(task.ActivityRef, "resources."+flow.ID+".tasks."+task.ID+".activityRef", "activity", false)
		}
	}

	for _, entry := range app.Imports {
		if !usedAliases[entry.Alias] {
			orphanedRefs = append(orphanedRefs, orphanedRef{
				Ref:      entry.Ref,
				Kind:     inferContribType(entry.Ref),
				Path:     "imports." + entry.Alias,
				Reason:   fmt.Sprintf("Import alias %q is declared but not used by triggers or tasks", entry.Alias),
				Severity: "info",
			})
		}
	}

	for _, issue := range aliasIssues {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.governance." + issue.Kind,
			Message:  issue.Message,
			Severity: issue.Severity,
			Path:     issue.Path,
			Details: map[string]any{
				"alias": issue.Alias,
				"ref":   issue.Ref,
			},
		})
	}
	for _, orphan := range orphanedRefs {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.governance.orphaned_ref",
			Message:  orphan.Reason,
			Severity: orphan.Severity,
			Path:     orphan.Path,
			Details: map[string]any{
				"ref":  orphan.Ref,
				"kind": orphan.Kind,
			},
		})
	}
	for _, finding := range versionFindings {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.governance.version." + finding.Status,
			Message:  finding.Message,
			Severity: finding.Severity,
			Path:     "imports." + finding.Alias,
			Details: map[string]any{
				"ref":             finding.Ref,
				"declaredVersion": finding.DeclaredVersion,
			},
		})
	}
	diagnostics = append(diagnostics, inventory.Diagnostics...)
	diagnostics = dedupeDiagnostics(diagnostics)

	ok := true
	for _, entry := range diagnostics {
		if entry.Severity == "error" {
			ok = false
			break
		}
	}

	return governanceReport{
		AppName:         app.Name,
		Ok:              ok,
		AliasIssues:     aliasIssues,
		OrphanedRefs:    orphanedRefs,
		VersionFindings: versionFindings,
		InventorySummary: &struct {
			EntryCount         int `json:"entryCount"`
			PackageBackedCount int `json:"packageBackedCount"`
			FallbackCount      int `json:"fallbackCount"`
		}{
			EntryCount:         len(inventory.Entries),
			PackageBackedCount: countPackageBackedInventoryEntries(inventory.Entries),
			FallbackCount:      countFallbackInventoryEntries(inventory.Entries),
		},
		UnresolvedPackages:     unresolvedPackages,
		FallbackContribs:       fallbackContribs,
		WeakEvidenceContribs:   weakEvidenceContribs,
		PackageBackedContribs:  packageBackedContribs,
		DescriptorOnlyContribs: descriptorOnlyContribs,
		Diagnostics:            diagnostics,
	}
}

func compareComposition(app flogoApp, appPath string, target string, resourceID string) compositionCompareResult {
	inventory := buildContributionInventory(app, appPath)
	diagnostics := []diagnostic{}
	canonical := buildCanonicalProjection(app, target, resourceID)
	programmatic := buildProgrammaticProjection(app, target, resourceID, &diagnostics)
	differences := diffComposition("app", canonical, programmatic)
	canonicalHash := hashProjection(canonical)
	programmaticHash := hashProjection(programmatic)
	ok := true
	for _, entry := range diagnostics {
		if entry.Severity == "error" {
			ok = false
			break
		}
	}
	for _, entry := range differences {
		if entry.Severity == "error" {
			ok = false
			break
		}
	}

	return compositionCompareResult{
		AppName:                app.Name,
		Ok:                     ok,
		CanonicalHash:          canonicalHash,
		ProgrammaticHash:       programmaticHash,
		ComparisonBasis:        comparisonBasisForInventory(inventory.Entries),
		SignatureEvidenceLevel: signatureEvidenceLevelForInventory(inventory.Entries),
		InventoryRefsUsed:      collectInventoryRefs(inventory.Entries),
		Differences:            differences,
		Diagnostics:            diagnostics,
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

func buildFlowInventoryEntry(flow flogoFlow) contributionInventoryEntry {
	descriptor := contribDescriptor{
		Ref:      "#flow:" + flow.ID,
		Alias:    "flow",
		Type:     "action",
		Name:     valueOrFallback(flow.Name, flow.ID),
		Title:    valueOrFallback(flow.Name, flow.ID),
		Settings: []contribField{},
		Inputs:   metadataFieldsToContrib(flow.MetadataInput, "input"),
		Outputs:  metadataFieldsToContrib(flow.MetadataOutput, "output"),
		Examples: []string{"Invoke reusable flow " + flow.ID},
		CompatibilityNotes: []string{
			"Flow resources behave like reusable actions",
		},
		Source: "flow-resource",
		Evidence: createEvidence(
			"flow_resource",
			"#flow:"+flow.ID,
			"flow",
			"",
			"",
			"",
			"",
			"",
			nil,
			false,
			true,
			"unknown",
			inferSignatureCompleteness([]contribField{}, metadataFieldsToContrib(flow.MetadataInput, "input"), metadataFieldsToContrib(flow.MetadataOutput, "output")),
		),
	}
	return contributionInventoryEntry{
		Ref:             descriptor.Ref,
		Alias:           descriptor.Alias,
		Type:            descriptor.Type,
		Name:            descriptor.Name,
		Version:         descriptor.Version,
		Title:           descriptor.Title,
		Source:          "flow_resource",
		Confidence:      "high",
		DiscoveryReason: describeDiscoveryReason("flow_resource", descriptor.Ref, "", ""),
		Settings:        descriptor.Settings,
		Inputs:          descriptor.Inputs,
		Outputs:         descriptor.Outputs,
		Diagnostics:     []diagnostic{},
		Descriptor:      &descriptor,
	}
}

func inventoryEntryToDescriptor(entry contributionInventoryEntry) contribDescriptor {
	if entry.Descriptor != nil {
		return *entry.Descriptor
	}
	return contribDescriptor{
		Ref:      entry.Ref,
		Alias:    entry.Alias,
		Type:     entry.Type,
		Name:     entry.Name,
		Version:  entry.Version,
		Title:    entry.Title,
		Settings: entry.Settings,
		Inputs:   entry.Inputs,
		Outputs:  entry.Outputs,
		Source:   entry.Source,
		Evidence: createEvidence(
			entry.Source,
			entry.Ref,
			entry.Alias,
			entry.Version,
			entry.DescriptorPath,
			entry.PackageRoot,
			entry.ModulePath,
			entry.GoPackagePath,
			entry.Diagnostics,
			entry.PackageDescriptorFound,
			entry.PackageMetadataFound,
			entry.VersionSource,
			entry.SignatureCompleteness,
		),
	}
}

func withCatalogRef(descriptor contribDescriptor, ref string) contribDescriptor {
	if !strings.HasPrefix(ref, "#") {
		return descriptor
	}
	descriptor.Ref = ref
	return descriptor
}

func createEvidence(
	source string,
	resolvedRef string,
	importAlias string,
	version string,
	descriptorPath string,
	packageRoot string,
	modulePath string,
	goPackagePath string,
	diagnostics []diagnostic,
	packageDescriptorFound bool,
	packageMetadataFound bool,
	versionSource string,
	signatureCompleteness string,
) *contribEvidence {
	return &contribEvidence{
		Source:                 source,
		ResolvedRef:            resolvedRef,
		DescriptorPath:         descriptorPath,
		PackageRoot:            packageRoot,
		ModulePath:             modulePath,
		GoPackagePath:          goPackagePath,
		ImportAlias:            importAlias,
		Version:                version,
		Confidence:             deriveEvidenceConfidence(source),
		PackageDescriptorFound: packageDescriptorFound,
		PackageMetadataFound:   packageMetadataFound,
		VersionSource:          versionSource,
		SignatureCompleteness:  signatureCompleteness,
		Diagnostics:            diagnostics,
	}
}

func compareEvidenceStrength(left string, right string) int {
	rank := map[string]int{
		"flow_resource":        100,
		"app_descriptor":       90,
		"workspace_descriptor": 80,
		"package_descriptor":   70,
		"package_source":       60,
		"descriptor":           50,
		"registry":             40,
		"inferred":             30,
	}
	return rank[left] - rank[right]
}

func isPackageBackedSource(source string) bool {
	return source == "app_descriptor" || source == "workspace_descriptor" || source == "package_descriptor" || source == "package_source" || source == "descriptor"
}

func deriveEvidenceConfidence(source string) string {
	switch source {
	case "registry":
		return "medium"
	case "inferred":
		return "low"
	default:
		return "high"
	}
}

func describeDiscoveryReason(source string, resolvedRef string, descriptorPath string, packageRoot string) string {
	switch source {
	case "app_descriptor":
		return fmt.Sprintf("Resolved %s from an app-local descriptor%s.", resolvedRef, optionalPathSuffix(descriptorPath))
	case "workspace_descriptor":
		return fmt.Sprintf("Resolved %s from a workspace descriptor%s.", resolvedRef, optionalPathSuffix(descriptorPath))
	case "package_descriptor":
		return fmt.Sprintf("Resolved %s from a package descriptor%s.", resolvedRef, optionalPathSuffix(descriptorPath))
	case "package_source":
		if packageRoot != "" {
			return fmt.Sprintf("Resolved %s from discovered Go package files under %s.", resolvedRef, packageRoot)
		}
		return fmt.Sprintf("Resolved %s from discovered Go package files.", resolvedRef)
	case "registry":
		return fmt.Sprintf("Resolved %s from built-in registry metadata because stronger package evidence was not found.", resolvedRef)
	case "inferred":
		return fmt.Sprintf("Resolved %s from inferred metadata because no descriptor or package evidence was found.", resolvedRef)
	case "flow_resource":
		return fmt.Sprintf("Resolved %s from a local flow resource definition.", resolvedRef)
	default:
		return fmt.Sprintf("Resolved %s using %s evidence.", resolvedRef, source)
	}
}

func optionalPathSuffix(path string) string {
	if path == "" {
		return ""
	}
	return " at " + path
}

func countPackageBackedInventoryEntries(entries []contributionInventoryEntry) int {
	count := 0
	for _, entry := range entries {
		if isPackageBackedSource(entry.Source) {
			count++
		}
	}
	return count
}

func countFallbackInventoryEntries(entries []contributionInventoryEntry) int {
	count := 0
	for _, entry := range entries {
		if entry.Source == "registry" || entry.Source == "inferred" {
			count++
		}
	}
	return count
}

func collectInventoryRefs(entries []contributionInventoryEntry) []string {
	refs := make([]string, 0, len(entries))
	for _, entry := range entries {
		ref := entry.Ref
		if entry.Descriptor != nil && entry.Descriptor.Evidence != nil && entry.Descriptor.Evidence.ResolvedRef != "" {
			ref = entry.Descriptor.Evidence.ResolvedRef
		}
		refs = append(refs, ref)
	}
	sort.Strings(refs)
	return refs
}

func comparisonBasisForInventory(entries []contributionInventoryEntry) string {
	for _, entry := range entries {
		if isPackageBackedSource(entry.Source) || entry.Source == "registry" {
			return "inventory_backed"
		}
	}
	return "normalized_only"
}

func signatureEvidenceLevelForInventory(entries []contributionInventoryEntry) string {
	for _, entry := range entries {
		if entry.Source == "package_descriptor" || entry.Source == "package_source" {
			return "package_backed"
		}
	}
	for _, entry := range entries {
		if entry.Source == "app_descriptor" || entry.Source == "workspace_descriptor" {
			return "descriptor_backed"
		}
	}
	return "fallback_only"
}

func buildInventoryEntryForApp(
	app flogoApp,
	appPath string,
	ref string,
	alias string,
	version string,
	forcedType string,
) (contributionInventoryEntry, []diagnostic) {
	descriptor, diagnostics := buildDescriptorForApp(app, appPath, ref, alias, version, forcedType)
	resolvedRef := descriptor.Ref
	if descriptor.Evidence != nil && descriptor.Evidence.ResolvedRef != "" {
		resolvedRef = descriptor.Evidence.ResolvedRef
	}
	return contributionInventoryEntry{
		Ref:            resolvedRef,
		Alias:          descriptor.Alias,
		Type:           descriptor.Type,
		Name:           descriptor.Name,
		Version:        descriptor.Version,
		Title:          descriptor.Title,
		Source:         descriptor.Evidence.Source,
		DescriptorPath: descriptor.Evidence.DescriptorPath,
		PackageRoot:    descriptor.Evidence.PackageRoot,
		ModulePath:     descriptor.Evidence.ModulePath,
		GoPackagePath:  descriptor.Evidence.GoPackagePath,
		Confidence:     descriptor.Evidence.Confidence,
		DiscoveryReason: describeDiscoveryReason(
			descriptor.Evidence.Source,
			descriptor.Evidence.ResolvedRef,
			descriptor.Evidence.DescriptorPath,
			descriptor.Evidence.PackageRoot,
		),
		Settings:    descriptor.Settings,
		Inputs:      descriptor.Inputs,
		Outputs:     descriptor.Outputs,
		Diagnostics: dedupeDiagnostics(append(append([]diagnostic{}, descriptor.Evidence.Diagnostics...), diagnostics...)),
		Descriptor:  &descriptor,
	}, diagnostics
}

func findInventoryEntry(inventory contributionInventory, app flogoApp, refOrAlias string) (contributionInventoryEntry, bool) {
	ref, alias, _, _, hasResolvedRef := resolveAppRef(app, refOrAlias)
	normalized := normalizeAlias(refOrAlias)
	for _, entry := range inventory.Entries {
		resolvedRef := entry.Ref
		if entry.Descriptor != nil && entry.Descriptor.Evidence != nil && entry.Descriptor.Evidence.ResolvedRef != "" {
			resolvedRef = entry.Descriptor.Evidence.ResolvedRef
		}
		if entry.Ref == refOrAlias || resolvedRef == refOrAlias || normalizeAlias(entry.Ref) == normalized || normalizeAlias(resolvedRef) == normalized {
			return entry, true
		}
		if entry.Alias != "" && normalizeAlias(entry.Alias) == normalized {
			return entry, true
		}
		if hasResolvedRef {
			canonicalRef := resolveImportRef(app, ref, alias)
			if entry.Ref == canonicalRef || resolvedRef == canonicalRef {
				return entry, true
			}
		}
	}
	return contributionInventoryEntry{}, false
}

func inferDescriptorSource(appPath string, descriptorPath string, ref string) string {
	normalizedPath := strings.ReplaceAll(descriptorPath, "\\", "/")
	normalizedRef := strings.TrimPrefix(strings.ReplaceAll(ref, "\\", "/"), "#")
	appDir := ""
	if appPath != "" {
		appDir = strings.ReplaceAll(filepath.Dir(appPath), "\\", "/")
	}
	if appDir != "" && strings.HasPrefix(normalizedPath, appDir+"/") &&
		!strings.Contains(normalizedPath, "/.flogo/descriptors/") &&
		!strings.Contains(normalizedPath, "/descriptors/") &&
		!strings.Contains(normalizedPath, "/vendor/") {
		return "app_descriptor"
	}
	if strings.Contains(normalizedPath, "/vendor/"+normalizedRef+"/descriptor.json") {
		return "package_descriptor"
	}
	if strings.Contains(normalizedPath, "/.flogo/descriptors/"+normalizedRef+"/descriptor.json") ||
		strings.Contains(normalizedPath, "/descriptors/"+normalizedRef+"/descriptor.json") {
		return "workspace_descriptor"
	}

	return "workspace_descriptor"
}

func introspectContrib(app flogoApp, appPath string, refOrAlias string) (contribDescriptor, []diagnostic, bool) {
	inventory := buildContributionInventory(app, appPath)
	if entry, ok := findInventoryEntry(inventory, app, refOrAlias); ok {
		return inventoryEntryToDescriptor(entry), dedupeDiagnostics(entry.Diagnostics), true
	}

	if strings.HasPrefix(refOrAlias, "#flow:") {
		flowID := strings.TrimPrefix(refOrAlias, "#flow:")
		for _, flow := range app.Resources {
			if flow.ID == flowID {
				return contribDescriptor{
					Ref:                "#flow:" + flow.ID,
					Alias:              "flow",
					Type:               "action",
					Name:               valueOrFallback(flow.Name, flow.ID),
					Title:              valueOrFallback(flow.Name, flow.ID),
					Inputs:             metadataFieldsToContrib(flow.MetadataInput, "input"),
					Outputs:            metadataFieldsToContrib(flow.MetadataOutput, "output"),
					Examples:           []string{"Invoke reusable flow " + flow.ID},
					CompatibilityNotes: []string{"Flow resources behave like reusable actions"},
					Source:             "flow-resource",
					Evidence: createEvidence(
						"flow_resource",
						"#flow:"+flow.ID,
						"flow",
						"",
						"",
						"",
						"",
						"",
						nil,
						false,
						true,
						"unknown",
						inferSignatureCompleteness([]contribField{}, metadataFieldsToContrib(flow.MetadataInput, "input"), metadataFieldsToContrib(flow.MetadataOutput, "output")),
					),
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

func inspectContribEvidence(app flogoApp, appPath string, refOrAlias string) (contributionInventoryEntry, bool) {
	inventory := buildContributionInventory(app, appPath)
	return findInventoryEntry(inventory, app, refOrAlias)
}

func previewMapping(app flogoApp, appPath string, nodeID string, context mappingPreviewContext) mappingPreviewResult {
	flowID, task, ok := locateTask(app, nodeID)
	if !ok {
		return mappingPreviewResult{
			NodeID:              nodeID,
			Fields:              []mappingPreviewField{},
			Paths:               []mappingPath{},
			ResolvedValues:      map[string]any{},
			ScopeDiagnostics:    []diagnostic{},
			CoercionDiagnostics: []diagnostic{},
			SuggestedCoercions:  []diagnostic{},
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
	scopeDiagnostics := evaluateScopeDiagnostics(app, flowID, task, fields)
	coercionDiagnostics := suggestCoercions(app, appPath, context, nodeID)
	diagnostics = append(diagnostics, scopeDiagnostics...)
	diagnostics = append(diagnostics, coercionDiagnostics...)

	return mappingPreviewResult{
		NodeID:              nodeID,
		FlowID:              flowID,
		Fields:              fields,
		Paths:               collectMappingPaths(nodeID, fields),
		ResolvedValues:      buildResolvedValueMap(fields),
		ScopeDiagnostics:    dedupeDiagnostics(scopeDiagnostics),
		CoercionDiagnostics: dedupeDiagnostics(coercionDiagnostics),
		SuggestedCoercions:  dedupeDiagnostics(coercionDiagnostics),
		Diagnostics:         dedupeDiagnostics(diagnostics),
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

func collectMappingPaths(nodeID string, fields []mappingPreviewField) []mappingPath {
	paths := make([]mappingPath, 0, len(fields))
	for _, field := range fields {
		if !strings.Contains(field.Path, ".") {
			continue
		}
		mappingKey := field.Path
		if lastDot := strings.LastIndex(field.Path, "."); lastDot >= 0 && lastDot < len(field.Path)-1 {
			mappingKey = field.Path[lastDot+1:]
		}
		paths = append(paths, mappingPath{
			NodeID:           nodeID,
			MappingKey:       mappingKey,
			SourceExpression: field.Expression,
			TargetPath:       field.Path,
		})
	}
	return paths
}

func buildResolvedValueMap(fields []mappingPreviewField) map[string]any {
	resolved := map[string]any{}
	for _, field := range fields {
		if !strings.Contains(field.Path, ".") {
			continue
		}
		resolved[field.Path] = field.Resolved
	}
	return resolved
}

func evaluateScopeDiagnostics(app flogoApp, flowID string, task flogoTask, fields []mappingPreviewField) []diagnostic {
	diagnostics := []diagnostic{}
	var flow *flogoFlow
	for index := range app.Resources {
		if app.Resources[index].ID == flowID {
			flow = &app.Resources[index]
			break
		}
	}
	if flow == nil {
		return diagnostics
	}

	taskIndex := -1
	priorTasks := map[string]bool{}
	for index, candidate := range flow.Tasks {
		if candidate.ID == task.ID {
			taskIndex = index
			break
		}
		priorTasks[candidate.ID] = true
	}
	if taskIndex == -1 {
		return diagnostics
	}

	for _, field := range fields {
		for _, reference := range field.References {
			if strings.HasPrefix(reference, "$trigger") {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.mapping.invalid_trigger_scope",
					Message:  fmt.Sprintf("Reference %q is not directly available inside flow task mappings", reference),
					Severity: "warning",
					Path:     field.Path,
				})
			}
			if strings.HasPrefix(reference, "$activity[") {
				pattern := regexp.MustCompile(`^\$activity\[([^\]]+)\]`)
				match := pattern.FindStringSubmatch(reference)
				if len(match) > 1 && !priorTasks[match[1]] {
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.mapping.invalid_activity_scope",
						Message:  fmt.Sprintf("Reference %q points to an activity that is not available before task %q", reference, task.ID),
						Severity: "error",
						Path:     field.Path,
					})
				}
			}
		}
	}

	return diagnostics
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

func suggestCoercions(app flogoApp, appPath string, context mappingPreviewContext, nodeID string) []diagnostic {
	diagnostics := []diagnostic{}
	for _, flow := range app.Resources {
		for _, task := range flow.Tasks {
			if nodeID != "" && task.ID != nodeID {
				continue
			}
			diagnostics = append(diagnostics, suggestTaskCoercions(app, appPath, task, context)...)
		}
	}
	return dedupeDiagnostics(diagnostics)
}

func suggestTaskCoercions(app flogoApp, appPath string, task flogoTask, context mappingPreviewContext) []diagnostic {
	diagnostics := []diagnostic{}
	expectedTypes := buildExpectedFieldTypes(app, appPath, task)
	fields := []mappingPreviewField{}
	fields = append(fields, collectMappingFields("input", task.Input, context)...)
	fields = append(fields, collectMappingFields("settings", task.Settings, context)...)
	fields = append(fields, collectMappingFields("output", task.Output, context)...)

	for _, field := range fields {
		expectedType, ok := expectedTypes[field.Path]
		if !ok || field.Resolved == nil {
			continue
		}
		actualType := inferResolvedValueType(field.Resolved)
		if actualType == "" || actualType == expectedType {
			continue
		}
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.mapping.coercion.expected_type",
			Message:  fmt.Sprintf("Field %q expects %s based on contribution metadata but resolves to %s. Consider using toType(...) or toString(...).", field.Path, expectedType, actualType),
			Severity: "warning",
			Path:     field.Path,
			Details: map[string]any{
				"expression":   field.Expression,
				"expectedType": expectedType,
				"actualType":   actualType,
				"resolved":     field.Resolved,
			},
		})
	}

	collectCoercionDiagnostics(task.Input, task.ID+".input", &diagnostics, context)
	collectCoercionDiagnostics(task.Settings, task.ID+".settings", &diagnostics, context)
	collectCoercionDiagnostics(task.Output, task.ID+".output", &diagnostics, context)
	return dedupeDiagnostics(diagnostics)
}

func buildExpectedFieldTypes(app flogoApp, appPath string, task flogoTask) map[string]string {
	expected := map[string]string{}
	if task.ActivityRef == "" {
		return expected
	}

	descriptor, _ := buildDescriptorForApp(app, appPath, task.ActivityRef, inferAlias(task.ActivityRef), "", "")
	for _, field := range descriptor.Inputs {
		if expectedType := normalizeExpectedFieldType(field.Type); expectedType != "" {
			expected["input."+field.Name] = expectedType
		}
	}
	for _, field := range descriptor.Settings {
		if expectedType := normalizeExpectedFieldType(field.Type); expectedType != "" {
			expected["settings."+field.Name] = expectedType
		}
	}
	for _, field := range descriptor.Outputs {
		if expectedType := normalizeExpectedFieldType(field.Type); expectedType != "" {
			expected["output."+field.Name] = expectedType
		}
	}
	return expected
}

func normalizeExpectedFieldType(value string) string {
	switch strings.ToLower(value) {
	case "integer", "int", "long", "float", "double", "number":
		return "number"
	case "bool", "boolean":
		return "boolean"
	case "array":
		return "array"
	case "object", "json", "map":
		return "object"
	case "string":
		return "string"
	default:
		return ""
	}
}

func inferResolvedValueType(value any) string {
	switch value.(type) {
	case []any:
		return "array"
	case map[string]any:
		return "object"
	case float64, int, int64, int32:
		return "number"
	case bool:
		return "boolean"
	case string:
		return "string"
	default:
		return ""
	}
}

func collectCoercionDiagnostics(value any, path string, diagnostics *[]diagnostic, context mappingPreviewContext) {
	switch typed := value.(type) {
	case []any:
		for index, item := range typed {
			collectCoercionDiagnostics(item, fmt.Sprintf("%s[%d]", path, index), diagnostics, context)
		}
	case map[string]any:
		for key, nested := range typed {
			collectCoercionDiagnostics(nested, path+"."+key, diagnostics, context)
		}
	case string:
		references := collectResolverReferences(typed)
		for _, reference := range references {
			resolved, ok := resolveReference(reference, context)
			if !ok {
				continue
			}
			lowerPath := strings.ToLower(path)
			if isNumericHint(lowerPath) {
				if _, ok := resolved.(string); ok {
					*diagnostics = append(*diagnostics, diagnostic{
						Code:     "flogo.mapping.coercion.numeric",
						Message:  fmt.Sprintf("Mapping at %q looks numeric and may need coercion", path),
						Severity: "warning",
						Path:     path,
					})
				}
			}
		}
	}
}

func isNumericHint(value string) bool {
	return strings.Contains(value, "count") ||
		strings.Contains(value, "size") ||
		strings.Contains(value, "length") ||
		strings.Contains(value, "timeout") ||
		strings.Contains(value, "interval") ||
		strings.Contains(value, "port") ||
		strings.Contains(value, "code") ||
		strings.Contains(value, "status") ||
		strings.Contains(value, "limit")
}

func analyzePropertyUsage(app flogoApp, profile string) propertyPlan {
	propertyRefs := map[string]bool{}
	envRefs := map[string]bool{}
	diagnostics := []diagnostic{}
	undefinedPropertyRefs := map[string]bool{}

	for _, flow := range app.Resources {
		for _, task := range flow.Tasks {
			collectResolverKinds(task.Input, propertyRefs, envRefs)
			collectResolverKinds(task.Settings, propertyRefs, envRefs)
			collectResolverKinds(task.Output, propertyRefs, envRefs)
		}
	}

	declaredSet := map[string]bool{}
	for _, property := range app.Properties {
		if name, ok := property["name"].(string); ok {
			declaredSet[name] = true
		}
	}

	for propertyRef := range propertyRefs {
		if !declaredSet[propertyRef] {
			undefinedPropertyRefs[propertyRef] = true
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.property.undefined",
				Message:  fmt.Sprintf("Property %q is referenced but not declared on the app", propertyRef),
				Severity: "warning",
				Path:     "properties." + propertyRef,
			})
		}
	}

	unusedProperties := []string{}
	for declared := range declaredSet {
		if !propertyRefs[declared] {
			unusedProperties = append(unusedProperties, declared)
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.property.unused",
				Message:  fmt.Sprintf("Property %q is declared but not referenced", declared),
				Severity: "info",
				Path:     "properties." + declared,
			})
		}
	}
	sort.Strings(unusedProperties)

	declaredProperties := sortedKeys(declaredSet)
	propertyRefList := sortedKeys(propertyRefs)
	envRefList := sortedKeys(envRefs)
	undefinedPropertyList := sortedKeys(undefinedPropertyRefs)
	recommendations := []propertyPlanRecommendation{}
	for _, name := range propertyRefList {
		recommendations = append(recommendations, propertyPlanRecommendation{
			Source:    "property",
			Name:      name,
			Rationale: "Referenced through $property and suitable for reusable app-level configuration",
		})
	}
	for _, name := range envRefList {
		recommendations = append(recommendations, propertyPlanRecommendation{
			Source:    "env",
			Name:      name,
			Rationale: "Referenced through $env and suitable for deployment-specific configuration",
		})
	}

	recommendedProperties := []propertyDefinitionRecommendation{}
	for _, name := range undefinedPropertyList {
		recommendedProperties = append(recommendedProperties, propertyDefinitionRecommendation{
			Name:         name,
			Rationale:    "This property is referenced in mappings but is not declared on the app.",
			InferredType: inferPropertyType(app, name),
		})
	}

	recommendedEnv := []envRecommendation{}
	recommendedSecretEnv := []envRecommendation{}
	recommendedPlainEnv := []envRecommendation{}
	for _, name := range envRefList {
		entry := envRecommendation{
			Name:      name,
			Rationale: "This environment variable is referenced through $env and should be supplied per deployment environment.",
		}
		recommendedEnv = append(recommendedEnv, entry)
		if looksSensitiveConfig(name) {
			recommendedSecretEnv = append(recommendedSecretEnv, envRecommendation{
				Name:      name,
				Rationale: entry.Rationale + " Treat it as secret configuration.",
			})
		} else {
			recommendedPlainEnv = append(recommendedPlainEnv, entry)
		}
	}

	return propertyPlan{
		DeclaredProperties:    declaredProperties,
		PropertyRefs:          propertyRefList,
		EnvRefs:               envRefList,
		UndefinedPropertyRefs: undefinedPropertyList,
		UnusedProperties:      unusedProperties,
		DeploymentProfile:     profile,
		Recommendations:       recommendations,
		RecommendedProperties: recommendedProperties,
		RecommendedEnv:        recommendedEnv,
		RecommendedSecretEnv:  recommendedSecretEnv,
		RecommendedPlainEnv:   recommendedPlainEnv,
		DeploymentNotes:       buildDeploymentNotes(propertyRefs, envRefs, undefinedPropertyRefs, unusedProperties),
		ProfileSpecificNotes:  buildProfileSpecificNotes(profile, propertyRefs, envRefs),
		Diagnostics:           dedupeDiagnostics(diagnostics),
	}
}

func runMappingTest(app flogoApp, appPath string, nodeID string, context mappingPreviewContext, expectedOutput map[string]any, strict bool) mappingTestResponse {
	preview := previewMapping(app, appPath, nodeID, context)
	actualOutput := preview.ResolvedValues
	differences := diffResolvedValues(expectedOutput, actualOutput)
	if strict {
		for pathKey, actual := range actualOutput {
			if _, ok := expectedOutput[pathKey]; !ok {
				differences = append(differences, mappingDifference{
					Path:     pathKey,
					Expected: nil,
					Actual:   actual,
					Message:  fmt.Sprintf("Resolved value for %q was not expected", pathKey),
				})
			}
		}
	}
	pass := len(differences) == 0
	for _, diag := range preview.Diagnostics {
		if diag.Severity == "error" {
			pass = false
			break
		}
	}
	return mappingTestResponse{
		Result: mappingTestResult{
			Pass:         pass,
			NodeID:       nodeID,
			ActualOutput: actualOutput,
			Differences:  differences,
			Diagnostics:  preview.Diagnostics,
		},
		PropertyPlan: analyzePropertyUsage(app, "rest_service"),
	}
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

	for _, candidate := range buildDescriptorCandidates(appPath, resolvedRef) {
		if _, err := os.Stat(candidate.DescriptorPath); err == nil {
			modulePath := candidate.ModulePath
			goPackagePath := candidate.GoPackagePath
			if candidate.PackageRoot != "" && modulePath == "" {
				if moduleInfo, ok := findNearestGoModule(candidate.PackageRoot); ok {
					modulePath = moduleInfo.ModulePath
					if goPackagePath == "" {
						goPackagePath = deriveGoPackagePath(candidate.PackageRoot, moduleInfo)
					}
				}
			}
			return parseDescriptorFile(
				candidate.DescriptorPath,
				resolvedRef,
				normalizedAlias,
				version,
				forcedType,
				candidate.Source,
				modulePath,
				goPackagePath,
				candidate.PackageVersion,
			), []diagnostic{}
		}
	}

	if packageCandidate, ok := findPackageCandidate(appPath, resolvedRef); ok {
		discoveredVersion := valueOrFallback(version, packageCandidate.PackageVersion)
		versionSource := "unknown"
		if version != "" {
			versionSource = "import"
		} else if packageCandidate.PackageVersion != "" {
			versionSource = "package"
		}
		descriptor := buildDescriptor(resolvedRef, normalizedAlias, discoveredVersion, forcedType)
		descriptor.Source = "package_source"
		descriptor.Evidence = createEvidence(
			descriptor.Source,
			resolvedRef,
			normalizedAlias,
			discoveredVersion,
			"",
			packageCandidate.PackageRoot,
			packageCandidate.ModulePath,
			packageCandidate.GoPackagePath,
			nil,
			false,
			true,
			versionSource,
			inferSignatureCompleteness(descriptor.Settings, descriptor.Inputs, descriptor.Outputs),
		)
		return descriptor, []diagnostic{
			{
				Code:     "flogo.contrib.descriptor_not_found",
				Message:  fmt.Sprintf("Descriptor metadata for %q was not found on disk", resolvedRef),
				Severity: "info",
				Path:     normalizedAlias,
			},
			{
				Code:     "flogo.contrib.package_source_fallback",
				Message:  fmt.Sprintf("Descriptor metadata for %q was not found on disk; using package source fallback metadata", resolvedRef),
				Severity: "info",
				Path:     normalizedAlias,
				Details: map[string]any{
					"packageRoot":    packageCandidate.PackageRoot,
					"modulePath":     packageCandidate.ModulePath,
					"goPackagePath":  packageCandidate.GoPackagePath,
					"packageVersion": packageCandidate.PackageVersion,
				},
			},
		}
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
			Code:     "flogo.contrib.descriptor_not_found",
			Message:  fmt.Sprintf("Descriptor metadata for %q was not found on disk", resolvedRef),
			Severity: "info",
			Path:     normalizedAlias,
		},
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
	for _, candidate := range buildDescriptorCandidates(appPath, ref) {
		if _, err := os.Stat(candidate.DescriptorPath); err == nil {
			return candidate.DescriptorPath
		}
	}

	return ""
}

func findPackageCandidate(appPath string, ref string) (descriptorCandidate, bool) {
	normalizedRef := strings.TrimPrefix(strings.ReplaceAll(ref, "\\", "/"), "#")
	refBase := filepath.Base(normalizedRef)
	for _, moduleInfo := range collectGoModules(appPath) {
		if relativePath := resolveModuleRelativePath(moduleInfo, normalizedRef); relativePath != "" {
			candidate := filepath.Join(moduleInfo.Root, filepath.FromSlash(relativePath))
			if directoryLooksLikePackageRoot(candidate) {
				return descriptorCandidate{
					PackageRoot:   candidate,
					ModulePath:    moduleInfo.ModulePath,
					GoPackagePath: normalizedRef,
					Source:        "package_source",
				}, true
			}
		}
	}
	for _, candidate := range buildModuleCacheCandidates(normalizedRef) {
		if directoryLooksLikePackageRoot(candidate.PackageRoot) {
			return candidate, true
		}
	}
	for _, root := range buildSearchRoots(appPath) {
		candidates := []descriptorCandidate{
			{
				PackageRoot:   filepath.Join(root, filepath.FromSlash(normalizedRef)),
				GoPackagePath: normalizedRef,
				Source:        "package_source",
			},
			{
				PackageRoot:   filepath.Join(root, "vendor", filepath.FromSlash(normalizedRef)),
				GoPackagePath: normalizedRef,
				Source:        "package_source",
			},
		}
		if refBase != "" {
			candidates = append(candidates, descriptorCandidate{
				PackageRoot: filepath.Join(root, refBase),
				Source:      "package_source",
			})
		}
		for _, candidate := range candidates {
			if directoryLooksLikePackageRoot(candidate.PackageRoot) {
				if candidate.ModulePath == "" {
					if moduleInfo, ok := findNearestGoModule(candidate.PackageRoot); ok {
						candidate.ModulePath = moduleInfo.ModulePath
						if candidate.GoPackagePath == "" {
							candidate.GoPackagePath = deriveGoPackagePath(candidate.PackageRoot, moduleInfo)
						}
					}
				}
				return candidate, true
			}
		}
	}
	return descriptorCandidate{}, false
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

func buildDescriptorCandidates(appPath string, ref string) []descriptorCandidate {
	normalizedRef := strings.TrimPrefix(strings.ReplaceAll(ref, "\\", "/"), "#")
	refBase := filepath.Base(normalizedRef)
	seen := map[string]bool{}
	candidates := []descriptorCandidate{}
	appDir := ""
	if appPath != "" {
		appDir = filepath.Dir(appPath)
	}

	pushCandidate := func(candidate descriptorCandidate) {
		if seen[candidate.DescriptorPath] {
			return
		}
		seen[candidate.DescriptorPath] = true
		candidates = append(candidates, candidate)
	}

	if appDir != "" {
		pushCandidate(descriptorCandidate{
			DescriptorPath: filepath.Join(appDir, filepath.FromSlash(normalizedRef), "descriptor.json"),
			PackageRoot:    filepath.Join(appDir, filepath.FromSlash(normalizedRef)),
			Source:         "app_descriptor",
		})
		pushCandidate(descriptorCandidate{
			DescriptorPath: filepath.Join(appDir, "descriptors", filepath.FromSlash(normalizedRef), "descriptor.json"),
			PackageRoot:    filepath.Join(appDir, "descriptors", filepath.FromSlash(normalizedRef)),
			Source:         "app_descriptor",
		})
		if refBase != "" {
			pushCandidate(descriptorCandidate{
				DescriptorPath: filepath.Join(appDir, refBase, "descriptor.json"),
				PackageRoot:    filepath.Join(appDir, refBase),
				Source:         "app_descriptor",
			})
			pushCandidate(descriptorCandidate{
				DescriptorPath: filepath.Join(appDir, "descriptors", refBase, "descriptor.json"),
				PackageRoot:    filepath.Join(appDir, "descriptors", refBase),
				Source:         "app_descriptor",
			})
		}
	}

	for _, moduleInfo := range collectGoModules(appPath) {
		if relativePath := resolveModuleRelativePath(moduleInfo, normalizedRef); relativePath != "" {
			pushCandidate(descriptorCandidate{
				DescriptorPath: filepath.Join(moduleInfo.Root, filepath.FromSlash(relativePath), "descriptor.json"),
				PackageRoot:    filepath.Join(moduleInfo.Root, filepath.FromSlash(relativePath)),
				ModulePath:     moduleInfo.ModulePath,
				GoPackagePath:  normalizedRef,
				Source:         "package_descriptor",
			})
		}
	}
	for _, candidate := range buildModuleCacheCandidates(normalizedRef) {
		pushCandidate(descriptorCandidate{
			DescriptorPath: filepath.Join(candidate.PackageRoot, "descriptor.json"),
			PackageRoot:    candidate.PackageRoot,
			ModulePath:     candidate.ModulePath,
			GoPackagePath:  candidate.GoPackagePath,
			PackageVersion: candidate.PackageVersion,
			Source:         "package_descriptor",
		})
	}

	for _, root := range buildSearchRoots(appPath) {
		pushCandidate(descriptorCandidate{
			DescriptorPath: filepath.Join(root, "vendor", filepath.FromSlash(normalizedRef), "descriptor.json"),
			PackageRoot:    filepath.Join(root, "vendor", filepath.FromSlash(normalizedRef)),
			GoPackagePath:  normalizedRef,
			Source:         "package_descriptor",
		})
		pushCandidate(descriptorCandidate{
			DescriptorPath: filepath.Join(root, ".flogo", "descriptors", filepath.FromSlash(normalizedRef), "descriptor.json"),
			PackageRoot:    filepath.Join(root, ".flogo", "descriptors", filepath.FromSlash(normalizedRef)),
			Source:         "workspace_descriptor",
		})
		pushCandidate(descriptorCandidate{
			DescriptorPath: filepath.Join(root, "descriptors", filepath.FromSlash(normalizedRef), "descriptor.json"),
			PackageRoot:    filepath.Join(root, "descriptors", filepath.FromSlash(normalizedRef)),
			Source:         "workspace_descriptor",
		})
		pushCandidate(descriptorCandidate{
			DescriptorPath: filepath.Join(root, filepath.FromSlash(normalizedRef), "descriptor.json"),
			PackageRoot:    filepath.Join(root, filepath.FromSlash(normalizedRef)),
			Source:         "workspace_descriptor",
		})
		if refBase != "" {
			pushCandidate(descriptorCandidate{
				DescriptorPath: filepath.Join(root, refBase, "descriptor.json"),
				PackageRoot:    filepath.Join(root, refBase),
				Source:         "workspace_descriptor",
			})
			pushCandidate(descriptorCandidate{
				DescriptorPath: filepath.Join(root, "descriptors", refBase, "descriptor.json"),
				PackageRoot:    filepath.Join(root, "descriptors", refBase),
				Source:         "workspace_descriptor",
			})
		}
	}

	return candidates
}

func collectGoModules(appPath string) []goModuleInfo {
	modules := map[string]goModuleInfo{}
	for _, root := range buildSearchRoots(appPath) {
		if moduleInfo, ok := findNearestGoModule(root); ok {
			modules[moduleInfo.Root] = moduleInfo
		}
	}
	result := make([]goModuleInfo, 0, len(modules))
	for _, moduleInfo := range modules {
		result = append(result, moduleInfo)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Root < result[j].Root
	})
	return result
}

func collectGoModuleCacheRoots() []string {
	roots := map[string]bool{}
	addRoot := func(root string) {
		if root == "" {
			return
		}
		if _, err := os.Stat(root); err == nil {
			roots[root] = true
		}
	}

	addRoot(strings.TrimSpace(os.Getenv("GOMODCACHE")))
	for _, entry := range strings.Split(os.Getenv("GOPATH"), string(os.PathListSeparator)) {
		trimmed := strings.TrimSpace(entry)
		if trimmed == "" {
			continue
		}
		addRoot(filepath.Join(trimmed, "pkg", "mod"))
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		addRoot(filepath.Join(home, "go", "pkg", "mod"))
	}

	result := make([]string, 0, len(roots))
	for root := range roots {
		result = append(result, root)
	}
	sort.Strings(result)
	return result
}

func escapeModuleCacheSegment(segment string) string {
	builder := strings.Builder{}
	for _, char := range segment {
		if char >= 'A' && char <= 'Z' {
			builder.WriteRune('!')
			builder.WriteRune(char + ('a' - 'A'))
			continue
		}
		builder.WriteRune(char)
	}
	return builder.String()
}

func buildModuleCacheCandidates(normalizedRef string) []descriptorCandidate {
	segments := strings.Split(normalizedRef, "/")
	if len(segments) < 2 {
		return []descriptorCandidate{}
	}

	seen := map[string]bool{}
	candidates := []descriptorCandidate{}
	for _, moduleCacheRoot := range collectGoModuleCacheRoots() {
		for index := len(segments); index >= 2; index-- {
			moduleSegments := segments[:index]
			relativeSegments := segments[index:]
			modulePath := strings.Join(moduleSegments, "/")
			moduleLeaf := escapeModuleCacheSegment(moduleSegments[len(moduleSegments)-1])
			parentDir := filepath.Join(append([]string{moduleCacheRoot}, mapSegments(moduleSegments[:len(moduleSegments)-1], escapeModuleCacheSegment)...)...)
			entries, err := os.ReadDir(parentDir)
			if err != nil {
				continue
			}
			sort.Slice(entries, func(i, j int) bool {
				return entries[i].Name() > entries[j].Name()
			})
			for _, entry := range entries {
				if !entry.IsDir() || !strings.HasPrefix(entry.Name(), moduleLeaf+"@") {
					continue
				}
				packageRoot := filepath.Join(append([]string{parentDir, entry.Name()}, mapSegments(relativeSegments, escapeModuleCacheSegment)...)...)
				descriptorPath := filepath.Join(packageRoot, "descriptor.json")
				if _, err := os.Stat(descriptorPath); err != nil && !directoryLooksLikePackageRoot(packageRoot) {
					continue
				}
				if seen[packageRoot] {
					continue
				}
				seen[packageRoot] = true
				candidates = append(candidates, descriptorCandidate{
					PackageRoot:    packageRoot,
					ModulePath:     modulePath,
					GoPackagePath:  normalizedRef,
					PackageVersion: strings.TrimPrefix(entry.Name(), moduleLeaf+"@"),
					Source:         "package_source",
				})
			}
		}
	}
	return candidates
}

func mapSegments(values []string, transform func(string) string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, transform(value))
	}
	return result
}

func findNearestGoModule(startDir string) (goModuleInfo, bool) {
	current := filepath.Clean(startDir)
	for {
		goModPath := filepath.Join(current, "go.mod")
		if _, err := os.Stat(goModPath); err == nil {
			modulePath := parseGoModuleModulePath(goModPath)
			if modulePath != "" {
				return goModuleInfo{Root: current, ModulePath: modulePath}, true
			}
			return goModuleInfo{}, false
		}
		parent := filepath.Dir(current)
		if parent == current {
			return goModuleInfo{}, false
		}
		current = parent
	}
}

func parseGoModuleModulePath(goModPath string) string {
	contents, err := os.ReadFile(goModPath)
	if err != nil {
		return ""
	}
	re := regexp.MustCompile(`(?m)^\s*module\s+([^\s]+)\s*$`)
	match := re.FindStringSubmatch(string(contents))
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

func resolveModuleRelativePath(moduleInfo goModuleInfo, normalizedRef string) string {
	if !strings.HasPrefix(normalizedRef, moduleInfo.ModulePath) {
		return ""
	}
	relativePath := strings.TrimPrefix(normalizedRef[len(moduleInfo.ModulePath):], "/")
	if relativePath == "" {
		return ""
	}
	return relativePath
}

func deriveGoPackagePath(packageRoot string, moduleInfo goModuleInfo) string {
	relativePath, err := filepath.Rel(moduleInfo.Root, packageRoot)
	if err != nil {
		return ""
	}
	relativePath = filepath.ToSlash(relativePath)
	if relativePath == "." || relativePath == "" {
		return moduleInfo.ModulePath
	}
	return moduleInfo.ModulePath + "/" + relativePath
}

func directoryLooksLikePackageRoot(candidate string) bool {
	entries, err := os.ReadDir(candidate)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() && (entry.Name() == "descriptor.json" || entry.Name() == "go.mod" || strings.HasSuffix(entry.Name(), ".go")) {
			return true
		}
	}
	return false
}

func parseDescriptorFile(
	descriptorPath string,
	ref string,
	alias string,
	version string,
	forcedType string,
	source string,
	modulePath string,
	goPackagePath string,
	packageVersion string,
) contribDescriptor {
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

	resolvedVersion := valueOrFallback(stringValue(raw["version"]), valueOrFallback(version, packageVersion))
	versionSource := "unknown"
	if stringValue(raw["version"]) != "" {
		versionSource = "descriptor"
	} else if version != "" {
		versionSource = "import"
	} else if packageVersion != "" {
		versionSource = "package"
	}

	return contribDescriptor{
		Ref:                ref,
		Alias:              alias,
		Type:               descriptorType,
		Name:               valueOrFallback(stringValue(raw["name"]), valueOrFallback(alias, inferAlias(ref))),
		Version:            resolvedVersion,
		Title:              stringValue(raw["title"]),
		Settings:           normalizeDescriptorFields(raw["settings"]),
		Inputs:             normalizeDescriptorFields(firstNonNil(raw["input"], raw["inputs"])),
		Outputs:            normalizeDescriptorFields(firstNonNil(raw["output"], raw["outputs"])),
		Examples:           normalizeStringArray(raw["examples"]),
		CompatibilityNotes: normalizeStringArray(raw["compatibilityNotes"]),
		Source:             source,
		Evidence: createEvidence(
			source,
			ref,
			alias,
			resolvedVersion,
			descriptorPath,
			filepath.Dir(descriptorPath),
			modulePath,
			goPackagePath,
			nil,
			true,
			true,
			versionSource,
			inferSignatureCompleteness(
				normalizeDescriptorFields(raw["settings"]),
				normalizeDescriptorFields(firstNonNil(raw["input"], raw["inputs"])),
				normalizeDescriptorFields(firstNonNil(raw["output"], raw["outputs"])),
			),
		),
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

func buildCanonicalProjection(app flogoApp, target string, resourceID string) any {
	if target == "resource" {
		var resource any
		for _, flow := range app.Resources {
			if flow.ID == resourceID {
				resource = projectFlow(flow)
				break
			}
		}
		return map[string]any{
			"target":   "resource",
			"appName":  app.Name,
			"resource": resource,
		}
	}

	imports := make([]map[string]any, 0, len(app.Imports))
	for _, entry := range app.Imports {
		imports = append(imports, map[string]any{
			"alias":   entry.Alias,
			"ref":     entry.Ref,
			"version": emptyToNil(entry.Version),
		})
	}
	sort.Slice(imports, func(i, j int) bool {
		return stringValue(imports[i]["alias"]) < stringValue(imports[j]["alias"])
	})

	properties := make([]map[string]any, 0, len(app.Properties))
	for _, property := range app.Properties {
		properties = append(properties, map[string]any{
			"name":     stringValue(property["name"]),
			"type":     emptyToNil(stringValue(property["type"])),
			"required": boolValue(property["required"]),
			"value":    property["value"],
		})
	}
	sort.Slice(properties, func(i, j int) bool {
		return stringValue(properties[i]["name"]) < stringValue(properties[j]["name"])
	})

	triggers := make([]map[string]any, 0, len(app.Triggers))
	for _, trigger := range app.Triggers {
		handlers := make([]map[string]any, 0, len(trigger.Handlers))
		for _, handler := range trigger.Handlers {
			handlers = append(handlers, map[string]any{
				"actionRef": handler.ActionRef,
				"settings":  sortMap(handler.Settings),
			})
		}
		triggers = append(triggers, map[string]any{
			"id":       trigger.ID,
			"ref":      trigger.Ref,
			"settings": sortMap(trigger.Settings),
			"handlers": handlers,
		})
	}
	sort.Slice(triggers, func(i, j int) bool {
		return stringValue(triggers[i]["id"]) < stringValue(triggers[j]["id"])
	})

	resources := make([]any, 0, len(app.Resources))
	for _, resource := range app.Resources {
		resources = append(resources, projectFlow(resource))
	}
	sort.Slice(resources, func(i, j int) bool {
		left, _ := resources[i].(map[string]any)
		right, _ := resources[j].(map[string]any)
		return stringValue(left["id"]) < stringValue(right["id"])
	})

	return map[string]any{
		"target":     "app",
		"appName":    app.Name,
		"type":       app.Type,
		"appModel":   app.AppModel,
		"imports":    imports,
		"properties": properties,
		"triggers":   triggers,
		"resources":  resources,
	}
}

func buildProgrammaticProjection(app flogoApp, target string, resourceID string, diagnostics *[]diagnostic) any {
	if target == "resource" && resourceID == "" {
		*diagnostics = append(*diagnostics, diagnostic{
			Code:     "flogo.composition.resource_required",
			Message:  "A resourceId is required when target=resource",
			Severity: "error",
			Path:     "resourceId",
		})
		return map[string]any{
			"target":   "resource",
			"appName":  app.Name,
			"resource": nil,
		}
	}

	if target == "resource" {
		found := false
		for _, flow := range app.Resources {
			if flow.ID == resourceID {
				found = true
				break
			}
		}
		if !found {
			*diagnostics = append(*diagnostics, diagnostic{
				Code:     "flogo.composition.resource_not_found",
				Message:  fmt.Sprintf("Resource %q was not found", resourceID),
				Severity: "error",
				Path:     resourceID,
			})
		}
	}

	return buildCanonicalProjection(app, target, resourceID)
}

func projectFlow(flow flogoFlow) map[string]any {
	inputs := make([]map[string]any, 0, len(flow.MetadataInput))
	for index, item := range flow.MetadataInput {
		name := stringValue(item["name"])
		if name == "" {
			name = fmt.Sprintf("input_%d", index)
		}
		inputs = append(inputs, map[string]any{
			"name":     name,
			"type":     emptyToNil(stringValue(item["type"])),
			"required": boolValue(item["required"]),
		})
	}

	outputs := make([]map[string]any, 0, len(flow.MetadataOutput))
	for index, item := range flow.MetadataOutput {
		name := stringValue(item["name"])
		if name == "" {
			name = fmt.Sprintf("output_%d", index)
		}
		outputs = append(outputs, map[string]any{
			"name":     name,
			"type":     emptyToNil(stringValue(item["type"])),
			"required": boolValue(item["required"]),
		})
	}

	tasks := make([]map[string]any, 0, len(flow.Tasks))
	for _, task := range flow.Tasks {
		tasks = append(tasks, map[string]any{
			"id":          task.ID,
			"name":        emptyToNil(task.Name),
			"activityRef": emptyToNil(task.ActivityRef),
			"input":       sortMap(task.Input),
			"output":      sortMap(task.Output),
			"settings":    sortMap(task.Settings),
		})
	}

	return map[string]any{
		"id":   flow.ID,
		"name": emptyToNil(flow.Name),
		"metadata": map[string]any{
			"input":  inputs,
			"output": outputs,
		},
		"tasks": tasks,
	}
}

func hashProjection(value any) string {
	payload, err := json.Marshal(sortValue(value))
	if err != nil {
		fail(err.Error())
	}
	hash := sha256.Sum256(payload)
	return fmt.Sprintf("%x", hash)
}

func diffComposition(path string, expected any, actual any) []compositionDifference {
	differences := []compositionDifference{}

	switch left := expected.(type) {
	case []any:
		right, _ := actual.([]any)
		if len(left) != len(right) {
			differences = append(differences, compositionDifference{
				Path:     path,
				Kind:     "array_length_mismatch",
				Expected: len(left),
				Actual:   len(right),
				Severity: "warning",
			})
		}
		maxLength := len(left)
		if len(right) > maxLength {
			maxLength = len(right)
		}
		for index := 0; index < maxLength; index++ {
			var leftValue any
			var rightValue any
			if index < len(left) {
				leftValue = left[index]
			}
			if index < len(right) {
				rightValue = right[index]
			}
			differences = append(differences, diffComposition(fmt.Sprintf("%s[%d]", path, index), leftValue, rightValue)...)
		}
		return differences
	case map[string]any:
		right, _ := actual.(map[string]any)
		keys := map[string]bool{}
		for key := range left {
			keys[key] = true
		}
		for key := range right {
			keys[key] = true
		}
		sortedKeys := make([]string, 0, len(keys))
		for key := range keys {
			sortedKeys = append(sortedKeys, key)
		}
		sort.Strings(sortedKeys)
		for _, key := range sortedKeys {
			differences = append(differences, diffComposition(path+"."+key, left[key], right[key])...)
		}
		return differences
	}

	if !reflect.DeepEqual(expected, actual) {
		differences = append(differences, compositionDifference{
			Path:     path,
			Kind:     "value_mismatch",
			Expected: expected,
			Actual:   actual,
			Severity: "warning",
		})
	}

	return differences
}

func sortMap(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return sortValue(value).(map[string]any)
}

func sortValue(value any) any {
	switch typed := value.(type) {
	case []any:
		result := make([]any, 0, len(typed))
		for _, item := range typed {
			result = append(result, sortValue(item))
		}
		return result
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		result := map[string]any{}
		for _, key := range keys {
			result[key] = sortValue(typed[key])
		}
		return result
	default:
		if value == nil {
			return nil
		}
		return value
	}
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func sortedKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func collectResolverKinds(value any, propertyRefs map[string]bool, envRefs map[string]bool) {
	switch typed := value.(type) {
	case string:
		for _, reference := range collectResolverReferences(typed) {
			if strings.HasPrefix(reference, "$property.") {
				propertyRefs[strings.TrimPrefix(reference, "$property.")] = true
			}
			if strings.HasPrefix(reference, "$env.") {
				envRefs[strings.TrimPrefix(reference, "$env.")] = true
			}
		}
	case []any:
		for _, entry := range typed {
			collectResolverKinds(entry, propertyRefs, envRefs)
		}
	case map[string]any:
		for _, nested := range typed {
			collectResolverKinds(nested, propertyRefs, envRefs)
		}
	}
}

func inferPropertyType(app flogoApp, propertyName string) string {
	for _, property := range app.Properties {
		if name, ok := property["name"].(string); ok && name == propertyName {
			if typed, ok := property["type"].(string); ok && typed != "" {
				return typed
			}
			switch property["value"].(type) {
			case float64, int, int64:
				return "number"
			case bool:
				return "boolean"
			case string:
				return "string"
			}
		}
	}
	lowerName := strings.ToLower(propertyName)
	if isNumericHint(lowerName) {
		return "number"
	}
	if strings.Contains(lowerName, "enabled") || strings.Contains(lowerName, "disabled") || strings.Contains(lowerName, "active") {
		return "boolean"
	}
	return "string"
}

func looksSensitiveConfig(name string) bool {
	return regexp.MustCompile(`(?i)(secret|token|password|key|credential|clientsecret|apikey)`).MatchString(name)
}

func buildDeploymentNotes(propertyRefs map[string]bool, envRefs map[string]bool, undefinedPropertyRefs map[string]bool, unusedProperties []string) []string {
	notes := []string{}
	if len(propertyRefs) > 0 {
		notes = append(notes, "Property-backed configuration should be declared on the app so flows can be reused across trigger types.")
	}
	if len(envRefs) > 0 {
		notes = append(notes, "Environment-backed configuration should be supplied per deployment target rather than embedded in flogo.json.")
	}
	if len(undefinedPropertyRefs) > 0 {
		notes = append(notes, "Undefined property references should be declared before promoting the app beyond development.")
	}
	if len(unusedProperties) > 0 {
		notes = append(notes, "Unused declared properties should be removed or wired into mappings to keep configuration intentional.")
	}
	return notes
}

func buildProfileSpecificNotes(profile string, propertyRefs map[string]bool, envRefs map[string]bool) []string {
	notes := []string{}
	switch profile {
	case "rest_service":
		if len(envRefs) > 0 {
			notes = append(notes, "REST services should prefer environment variables for external endpoints, secrets, and operational timeouts.")
		}
		if len(propertyRefs) > 0 {
			notes = append(notes, "REST services should keep reusable flow defaults in app properties when they are not deployment-secret values.")
		}
	case "timer_job":
		notes = append(notes, "Timer jobs should keep schedule-local defaults in properties and use environment variables for external integrations.")
	case "cli_tool":
		notes = append(notes, "CLI tools should prefer environment variables for runtime invocation values and properties for baked-in defaults.")
	case "channel_worker":
		notes = append(notes, "Channel workers should keep internal reusable defaults in properties unless the value is deployment-specific.")
	case "serverless":
		notes = append(notes, "Serverless profiles should bias toward environment variables for operational configuration.")
	case "edge_binary":
		notes = append(notes, "Edge binaries should bias toward app properties for embedded and offline-safe defaults.")
	}
	return notes
}

func diffResolvedValues(expected map[string]any, actual map[string]any) []mappingDifference {
	differences := []mappingDifference{}
	for pathKey, expectedValue := range expected {
		actualValue, ok := actual[pathKey]
		if !ok {
			differences = append(differences, mappingDifference{
				Path:     pathKey,
				Expected: expectedValue,
				Actual:   nil,
				Message:  fmt.Sprintf("Expected value for %q was not resolved", pathKey),
			})
			continue
		}
		if stableJSONString(expectedValue) != stableJSONString(actualValue) {
			differences = append(differences, mappingDifference{
				Path:     pathKey,
				Expected: expectedValue,
				Actual:   actualValue,
				Message:  fmt.Sprintf("Resolved value for %q does not match the expected output", pathKey),
			})
		}
	}
	return differences
}

func stableJSONString(value any) string {
	bytes, _ := json.Marshal(sortValue(value))
	return string(bytes)
}

func versionSourceFor(version string, hasDescriptor bool) string {
	if hasDescriptor && version != "" {
		return "descriptor"
	}
	if version != "" {
		return "import"
	}
	return "unknown"
}

func inferSignatureCompleteness(settings []contribField, inputs []contribField, outputs []contribField) string {
	if len(settings)+len(inputs)+len(outputs) > 0 {
		return "complete"
	}
	return "minimal"
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
		Ref:                ref,
		Alias:              normalizedAlias,
		Type:               inferContribType(ref),
		Name:               valueOrFallback(normalizedAlias, ref),
		Version:            version,
		Title:              valueOrFallback(normalizedAlias, ref),
		Settings:           []contribField{},
		Inputs:             []contribField{},
		Outputs:            []contribField{},
		Examples:           []string{},
		CompatibilityNotes: []string{},
		Source:             "inferred",
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

	descriptor.Evidence = createEvidence(
		descriptor.Source,
		ref,
		normalizedAlias,
		version,
		"",
		"",
		"",
		"",
		nil,
		false,
		ok,
		versionSourceFor(version, false),
		inferSignatureCompleteness(descriptor.Settings, descriptor.Inputs, descriptor.Outputs),
	)

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

func emptyToNil(value string) any {
	if value == "" {
		return nil
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
