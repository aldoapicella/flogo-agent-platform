package flogo

import (
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

type BuildArtifactFacts struct {
	RepoPath          string
	WorkspacePath     string
	ExecutablePath    string
	SupportsTestFlags bool
	TestSupportKnown  bool
}

type triggerConfig struct {
	TriggerID   string
	Ref         string
	ImportRef   string
	TriggerType string
	Port        string
	Method      string
	Path        string
	FlowURI     string
}

func DescribeDescriptor(doc *Document) []contracts.Observation {
	if doc == nil {
		return nil
	}

	triggers := collectTriggerConfigs(doc)
	flows := collectFlowResources(doc)
	observations := []contracts.Observation{
		{
			Kind:    "app_model",
			Summary: fmt.Sprintf("The app descriptor defines %d trigger(s) and %d flow resource(s).", len(triggers), len(flows)),
			Data: map[string]string{
				"name":          scalarString(doc.Raw["name"]),
				"type":          scalarString(doc.Raw["type"]),
				"app_model":     scalarString(doc.Raw["appModel"]),
				"trigger_count": strconv.Itoa(len(triggers)),
				"flow_count":    strconv.Itoa(len(flows)),
			},
		},
	}

	seenTriggerTypes := map[string]struct{}{}
	for _, trigger := range triggers {
		if trigger.TriggerType == "" {
			continue
		}
		if _, ok := seenTriggerTypes[trigger.TriggerType]; !ok {
			seenTriggerTypes[trigger.TriggerType] = struct{}{}
			observations = append(observations, contracts.Observation{
				Kind:    "trigger_type",
				Summary: fmt.Sprintf("The app defines a %s trigger.", strings.ToUpper(trigger.TriggerType)),
				Data: map[string]string{
					"trigger_type": trigger.TriggerType,
				},
			})
		}

		switch trigger.TriggerType {
		case "rest":
			summary := fmt.Sprintf("REST handler %s %s listens on port %s and invokes %s.", valueOr(trigger.Method, "GET"), valueOr(trigger.Path, "/"), valueOr(trigger.Port, "8080"), valueOr(trigger.FlowURI, "its configured flow"))
			observations = append(observations, contracts.Observation{
				Kind:    "rest_endpoint",
				Summary: summary,
				Data: map[string]string{
					"trigger_id":  trigger.TriggerID,
					"port":        valueOr(trigger.Port, "8080"),
					"method":      valueOr(trigger.Method, "GET"),
					"path":        valueOr(trigger.Path, "/"),
					"sample_path": samplePath(valueOr(trigger.Path, "/")),
					"flow_uri":    trigger.FlowURI,
				},
			})
		default:
			observations = append(observations, contracts.Observation{
				Kind:    "runtime_config",
				Summary: fmt.Sprintf("Trigger %s is configured as %s.", valueOr(trigger.TriggerID, "<unnamed>"), strings.ToUpper(trigger.TriggerType)),
				Data: map[string]string{
					"trigger_id":   trigger.TriggerID,
					"trigger_type": trigger.TriggerType,
				},
			})
		}
	}

	for _, flowID := range sortedFlowIDs(flows) {
		flow := flows[flowID]
		inputs := flowParamNames(flow.InputOrder)
		outputs := flowParamNames(flow.OutputOrder)
		summary := fmt.Sprintf("Flow %s accepts inputs [%s] and returns outputs [%s].", flow.ID, valueOr(strings.Join(inputs, ", "), "none"), valueOr(strings.Join(outputs, ", "), "none"))
		observations = append(observations, contracts.Observation{
			Kind:    "flow_io",
			Summary: summary,
			Data: map[string]string{
				"flow_id": flow.ID,
				"inputs":  strings.Join(inputs, ","),
				"outputs": strings.Join(outputs, ","),
			},
		})
	}

	return observations
}

func BuildLocalTestingObservations(doc *Document, facts BuildArtifactFacts) []contracts.Observation {
	if doc == nil {
		return nil
	}

	triggers := collectTriggerConfigs(doc)
	var observations []contracts.Observation

	if strings.TrimSpace(facts.WorkspacePath) != "" {
		observations = append(observations, contracts.Observation{
			Kind:    "workspace",
			Summary: fmt.Sprintf("The generated workspace is %s.", facts.WorkspacePath),
			Data: map[string]string{
				"workspace_path": facts.WorkspacePath,
			},
		})
	}

	if strings.TrimSpace(facts.ExecutablePath) != "" {
		observations = append(observations, contracts.Observation{
			Kind:    "binary",
			Summary: fmt.Sprintf("The built executable is %s.", facts.ExecutablePath),
			Data: map[string]string{
				"path":           facts.ExecutablePath,
				"start_command":  facts.ExecutablePath,
				"workspace_path": facts.WorkspacePath,
			},
		})
	}

	if facts.TestSupportKnown {
		summary := "The built executable supports Flogo -test flags."
		if !facts.SupportsTestFlags {
			summary = "The built executable does not support Flogo -test flags, so use startup and trigger-level testing instead."
		}
		observations = append(observations, contracts.Observation{
			Kind:    "test_support",
			Summary: summary,
			Data: map[string]string{
				"supports_test_flags": strconv.FormatBool(facts.SupportsTestFlags),
			},
		})
	}

	if strings.TrimSpace(facts.ExecutablePath) == "" {
		observations = append(observations, contracts.Observation{
			Kind:    "local_test_plan",
			Summary: "No built executable is available yet. Build the generated app first, then run the binary locally.",
			Data: map[string]string{
				"workspace_path": facts.WorkspacePath,
			},
		})
		return observations
	}

	restEndpoints := filterTriggerType(triggers, "rest")
	if len(restEndpoints) > 0 {
		for _, endpoint := range restEndpoints {
			port := valueOr(endpoint.Port, "8080")
			method := strings.ToUpper(valueOr(endpoint.Method, "GET"))
			path := valueOr(endpoint.Path, "/")
			url := "http://127.0.0.1:" + port + samplePath(path)
			curl := buildCurlCommand(method, url)
			summary := fmt.Sprintf("Start %s, then test %s %s with %s.", facts.ExecutablePath, method, url, curl)
			observations = append(observations, contracts.Observation{
				Kind:    "local_test_plan",
				Summary: summary,
				Data: map[string]string{
					"trigger_type":  "rest",
					"method":        method,
					"port":          port,
					"path":          path,
					"url":           url,
					"curl":          curl,
					"start_command": facts.ExecutablePath,
				},
			})
		}
		return observations
	}

	for _, triggerType := range distinctTriggerTypes(triggers) {
		summary := genericTriggerTestSummary(triggerType, facts.ExecutablePath)
		observations = append(observations, contracts.Observation{
			Kind:    "local_test_plan",
			Summary: summary,
			Data: map[string]string{
				"trigger_type":  triggerType,
				"start_command": facts.ExecutablePath,
			},
		})
	}
	if len(observations) == 0 {
		observations = append(observations, contracts.Observation{
			Kind:    "local_test_plan",
			Summary: fmt.Sprintf("Run %s and observe the application logs to validate local startup behavior.", facts.ExecutablePath),
			Data: map[string]string{
				"start_command": facts.ExecutablePath,
			},
		})
	}
	return observations
}

func collectTriggerConfigs(doc *Document) []triggerConfig {
	catalog := buildImportCatalog(doc.Imports())
	var configs []triggerConfig
	for _, triggerItem := range asSlice(doc.Raw["triggers"]) {
		trigger, ok := triggerItem.(map[string]any)
		if !ok {
			continue
		}
		triggerID := asString(trigger["id"])
		ref := asString(trigger["ref"])
		importRef := resolveImportRef(catalog, ref)
		triggerType := triggerTypeForImport(importRef)
		settings, _ := trigger["settings"].(map[string]any)
		port := scalarString(settings["port"])
		handlers := asSlice(trigger["handlers"])
		if len(handlers) == 0 {
			configs = append(configs, triggerConfig{
				TriggerID:   triggerID,
				Ref:         ref,
				ImportRef:   importRef,
				TriggerType: triggerType,
				Port:        port,
			})
			continue
		}
		for _, handlerItem := range handlers {
			handler, ok := handlerItem.(map[string]any)
			if !ok {
				continue
			}
			handlerSettings, _ := handler["settings"].(map[string]any)
			method := scalarString(handlerSettings["method"])
			path := scalarString(handlerSettings["path"])
			action, _ := handler["action"].(map[string]any)
			actionSettings, _ := action["settings"].(map[string]any)
			configs = append(configs, triggerConfig{
				TriggerID:   triggerID,
				Ref:         ref,
				ImportRef:   importRef,
				TriggerType: triggerType,
				Port:        port,
				Method:      method,
				Path:        path,
				FlowURI:     scalarString(actionSettings["flowURI"]),
			})
		}
	}
	return configs
}

func resolveImportRef(catalog importCatalog, ref string) string {
	if ref == "" {
		return ""
	}
	if strings.HasPrefix(ref, "#") {
		imp, ok := catalog.byAlias[strings.TrimPrefix(ref, "#")]
		if ok {
			return imp.Ref
		}
		return ""
	}
	return normalizeImportRef(ref)
}

func triggerTypeForImport(ref string) string {
	switch normalizeImportRef(ref) {
	case "github.com/project-flogo/contrib/trigger/rest":
		return "rest"
	case "github.com/project-flogo/contrib/trigger/app":
		return "app"
	case "github.com/project-flogo/contrib/trigger/timer":
		return "timer"
	case "github.com/project-flogo/contrib/trigger/kafka":
		return "kafka"
	default:
		if ref == "" {
			return ""
		}
		return filepath.Base(ref)
	}
}

func scalarString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		if typed == float64(int64(typed)) {
			return strconv.FormatInt(int64(typed), 10)
		}
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func samplePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return "/"
	}
	segments := strings.Split(path, "/")
	for idx, segment := range segments {
		if strings.HasPrefix(segment, ":") && len(segment) > 1 {
			segments[idx] = "sample-" + strings.TrimPrefix(segment, ":")
		}
	}
	joined := strings.Join(segments, "/")
	if joined == "" {
		return "/"
	}
	if !strings.HasPrefix(joined, "/") {
		return "/" + joined
	}
	return joined
}

func buildCurlCommand(method string, url string) string {
	method = strings.ToUpper(strings.TrimSpace(method))
	switch method {
	case "", "GET":
		return fmt.Sprintf("curl -i %s", url)
	case "POST", "PUT", "PATCH":
		return fmt.Sprintf("curl -i -X %s -H 'Content-Type: application/json' -d '{}' %s", method, url)
	default:
		return fmt.Sprintf("curl -i -X %s %s", method, url)
	}
}

func genericTriggerTestSummary(triggerType string, executablePath string) string {
	switch triggerType {
	case "app":
		return fmt.Sprintf("Run %s and observe the startup or shutdown handler logs. APP triggers do not expose an inbound endpoint.", executablePath)
	case "timer":
		return fmt.Sprintf("Run %s and wait for the timer handler to fire on its configured interval. Timer triggers do not expose an inbound endpoint.", executablePath)
	case "kafka":
		return fmt.Sprintf("Run %s with broker connectivity available, then publish a test message to the configured Kafka topic. Kafka triggers do not expose an inbound endpoint.", executablePath)
	default:
		return fmt.Sprintf("Run %s and use the configured %s trigger inputs to exercise the app locally.", executablePath, strings.ToUpper(valueOr(triggerType, "trigger")))
	}
}

func distinctTriggerTypes(configs []triggerConfig) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, config := range configs {
		if config.TriggerType == "" {
			continue
		}
		if _, ok := seen[config.TriggerType]; ok {
			continue
		}
		seen[config.TriggerType] = struct{}{}
		out = append(out, config.TriggerType)
	}
	return out
}

func filterTriggerType(configs []triggerConfig, triggerType string) []triggerConfig {
	out := make([]triggerConfig, 0, len(configs))
	for _, config := range configs {
		if config.TriggerType == triggerType {
			out = append(out, config)
		}
	}
	return out
}

func sortedFlowIDs(flows map[string]flowResource) []string {
	out := make([]string, 0, len(flows))
	for flowID := range flows {
		out = append(out, flowID)
	}
	sort.Strings(out)
	return out
}

func flowParamNames(params []flowParam) []string {
	out := make([]string, 0, len(params))
	for _, param := range params {
		out = append(out, param.Name)
	}
	return out
}

func valueOr(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
