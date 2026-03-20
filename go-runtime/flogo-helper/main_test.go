package main

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildTriggerBindingOperationIncludesValidationReport(t *testing.T) {
	app := bindableTestApp()

	operation, err := buildTriggerBindingOperation(app, triggerBindingRequest{
		FlowID: "hello",
		Profile: triggerProfile{
			Kind:      "rest",
			Method:    "POST",
			Path:      "/hello",
			Port:      8081,
			ReplyMode: "json",
		},
	})
	if err != nil {
		t.Fatalf("expected trigger binding operation to succeed, got %v", err)
	}

	if !operation.Validation.Ok {
		t.Fatalf("expected validation to pass, got %+v", operation.Validation)
	}
	if operation.Validation.Summary == "" {
		t.Fatal("expected validation summary to be populated")
	}
	if len(operation.Validation.Stages) != 4 {
		t.Fatalf("expected 4 validation stages, got %d", len(operation.Validation.Stages))
	}
}

func TestBuildTriggerBindingOperationRejectsInvalidPostRewriteApp(t *testing.T) {
	app := bindableTestApp()
	app.Resources[0].Tasks = append(app.Resources[0].Tasks, flogoTask{
		ID:          "broken",
		Name:        "broken",
		ActivityRef: "#missing",
		Input:       map[string]any{},
		Output:      map[string]any{},
		Settings:    map[string]any{},
	})

	_, err := buildTriggerBindingOperation(app, triggerBindingRequest{
		FlowID: "hello",
		Profile: triggerProfile{
			Kind:    "channel",
			Channel: "orders",
		},
	})
	if err == nil {
		t.Fatal("expected trigger binding validation to fail")
	}
	if !strings.Contains(err.Error(), "not valid") {
		t.Fatalf("expected validation failure error, got %v", err)
	}
}

func TestBuildSubflowExtractionOperationRejectsDanglingDownstreamActivityReference(t *testing.T) {
	app := extractionValidationTestApp()

	_, err := buildSubflowExtractionOperation(app, subflowExtractionRequest{
		FlowID:  "orchestrate",
		TaskIDs: []string{"prepare", "work"},
	})
	if err == nil {
		t.Fatal("expected extraction validation to fail")
	}
	if !strings.Contains(err.Error(), "not valid") {
		t.Fatalf("expected validation failure error, got %v", err)
	}
}

func TestBuildSubflowInliningOperationRejectsStaleInlinedActivityReference(t *testing.T) {
	app := inliningValidationTestApp()

	_, err := buildSubflowInliningOperation(app, subflowInliningRequest{
		ParentFlowID:     "orchestrate",
		InvocationTaskID: "invoke_child",
	})
	if err == nil {
		t.Fatal("expected inlining validation to fail")
	}
	if !strings.Contains(err.Error(), "not valid") {
		t.Fatalf("expected validation failure error, got %v", err)
	}
}

func TestControlFlowMutationOperationsRejectInvalidPostRewriteApp(t *testing.T) {
	tests := []struct {
		name string
		run  func(app flogoApp) error
	}{
		{
			name: "iterator",
			run: func(app flogoApp) error {
				_, err := buildIteratorSynthesisOperation(app, iteratorSynthesisRequest{
					FlowID:      "hello",
					TaskID:      "log",
					IterateExpr: "=$flow.items",
				})
				return err
			},
		},
		{
			name: "retry",
			run: func(app flogoApp) error {
				_, err := buildRetryPolicyOperation(app, retryPolicyRequest{
					FlowID:     "hello",
					TaskID:     "log",
					Count:      2,
					IntervalMs: 1000,
				})
				return err
			},
		},
		{
			name: "dowhile",
			run: func(app flogoApp) error {
				_, err := buildDoWhileSynthesisOperation(app, doWhileSynthesisRequest{
					FlowID:    "hello",
					TaskID:    "log",
					Condition: "=$flow.keepGoing == true",
				})
				return err
			},
		},
		{
			name: "error_path",
			run: func(app flogoApp) error {
				_, err := buildErrorPathTemplateOperation(app, errorPathTemplateRequest{
					FlowID:   "hello",
					TaskID:   "log",
					Template: "log_and_stop",
				})
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.run(controlFlowValidationTestApp())
			if err == nil {
				t.Fatal("expected validation failure")
			}
			if !strings.Contains(err.Error(), "not valid") {
				t.Fatalf("expected validation failure error, got %v", err)
			}
		})
	}
}

func TestLoadTriggerProfileDefaultsCliSingleCmd(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profile.json")
	if err := os.WriteFile(path, []byte(`{"kind":"cli","commandName":"run"}`), 0o644); err != nil {
		t.Fatalf("write profile: %v", err)
	}

	profile := loadTriggerProfile(path)
	if !profile.SingleCmd {
		t.Fatal("expected CLI trigger profile singleCmd to default to true")
	}
}

func TestScaffoldActivityGeneratesBundleAndProof(t *testing.T) {
	response := scaffoldActivity(activityScaffoldRequest{
		ActivityName: "Echo Message",
		ModulePath:   "example.com/acme/echo",
		Title:        "Echo Message",
		Description:  "Formats a greeting for a flow.",
		Version:      "0.1.0",
		Settings: []contribField{
			{Name: "prefix", Type: "string", Required: true},
		},
		Inputs: []contribField{
			{Name: "message", Type: "string", Required: true},
		},
		Outputs: []contribField{
			{Name: "message", Type: "string"},
		},
	})

	result := response.Result
	t.Cleanup(func() {
		if result.Bundle.BundleRoot != "" {
			_ = os.RemoveAll(result.Bundle.BundleRoot)
		}
	})

	if result.Bundle.Kind != "activity" {
		t.Fatalf("expected activity bundle kind, got %+v", result.Bundle)
	}
	if result.Bundle.PackageName != "echo_message" {
		t.Fatalf("expected sanitized package name, got %+v", result.Bundle)
	}
	if result.Bundle.ModulePath != "example.com/acme/echo" {
		t.Fatalf("expected module path to round-trip, got %+v", result.Bundle)
	}
	if result.Bundle.Descriptor.Type != "activity" || result.Bundle.Descriptor.Ref != "example.com/acme/echo" {
		t.Fatalf("expected scaffold descriptor metadata, got %+v", result.Bundle.Descriptor)
	}
	if len(result.Bundle.Files) != 6 {
		t.Fatalf("expected six generated files, got %+v", result.Bundle.Files)
	}
	if !generatedFileKindsInclude(result.Bundle.Files, "descriptor", "implementation", "metadata", "test", "module", "readme") {
		t.Fatalf("expected all scaffold file kinds, got %+v", result.Bundle.Files)
	}
	if !result.Validation.Ok {
		t.Fatalf("expected scaffold validation to pass, got %+v", result.Validation)
	}
	if !result.Test.Ok {
		t.Fatalf("expected isolated go test proof to pass, got %+v", result.Test)
	}
	if !result.Build.Ok {
		t.Fatalf("expected isolated go build proof to pass, got %+v", result.Build)
	}
	if !strings.Contains(generatedFileContent(result.Bundle.Files, "descriptor"), "\"type\": \"flogo:activity\"") {
		t.Fatalf("expected descriptor.json scaffold content, got %+v", result.Bundle.Files)
	}
	if !strings.Contains(generatedFileContent(result.Bundle.Files, "metadata"), "type Input struct") {
		t.Fatalf("expected metadata.go scaffold content, got %+v", result.Bundle.Files)
	}
	if !strings.Contains(generatedFileContent(result.Bundle.Files, "implementation"), "type Activity struct") {
		t.Fatalf("expected activity.go scaffold content, got %+v", result.Bundle.Files)
	}
}

func TestValidateActivityScaffoldRequestRejectsUnsupportedFieldTypes(t *testing.T) {
	err := validateActivityScaffoldRequest(activityScaffoldRequest{
		ActivityName: "Broken Activity",
		ModulePath:   "example.com/acme/broken",
		Title:        "Broken Activity",
		Description:  "Uses an unsupported field type.",
		Inputs: []contribField{
			{Name: "payload", Type: "xml"},
		},
	})
	if err == nil {
		t.Fatal("expected scaffold validation to fail on unsupported field types")
	}
	if !strings.Contains(err.Error(), "unsupported activity scaffold field type") {
		t.Fatalf("expected unsupported field type error, got %v", err)
	}
}

func TestTraceFlowDistinguishesRuntimeBackedAndSimulatedPaths(t *testing.T) {
	t.Run("runtime-backed direct trace", func(t *testing.T) {
		app := runtimeBackedTraceTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID:      "hello",
			SampleInput: map[string]any{"payload": "hello"},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected runtime-backed trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
			t.Fatalf("expected runtime-backed evidence kind, got %q", response.Trace.EvidenceKind)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected runtime-backed trace to include runtime evidence")
		}
		if !response.Trace.RuntimeEvidence.RecorderBacked {
			t.Fatalf("expected recorder-backed runtime evidence, got %+v", response.Trace.RuntimeEvidence)
		}
		if len(response.Trace.RuntimeEvidence.Steps) == 0 {
			t.Fatalf("expected recorder-backed runtime steps, got %+v", response.Trace.RuntimeEvidence)
		}
		if len(response.Trace.RuntimeEvidence.TaskEvents) == 0 {
			t.Fatalf("expected runtime task events, got %+v", response.Trace.RuntimeEvidence)
		}
		if len(response.Trace.RuntimeEvidence.NormalizedSteps) != 1 {
			t.Fatalf("expected normalized runtime step evidence, got %+v", response.Trace.RuntimeEvidence)
		}
		if response.Trace.Summary.Status != "completed" {
			t.Fatalf("expected completed runtime-backed trace, got %q", response.Trace.Summary.Status)
		}
		if len(response.Trace.Steps) != 1 {
			t.Fatalf("expected one runtime-backed step, got %d", len(response.Trace.Steps))
		}
		if response.Trace.Steps[0].TaskID != "log-request" {
			t.Fatalf("expected runtime-backed task id to remain canonical, got %q", response.Trace.Steps[0].TaskID)
		}
		if response.Trace.Steps[0].TaskName != "log-request" {
			t.Fatalf("expected runtime-backed task name to stay canonical, got %+v", response.Trace.Steps[0])
		}
		if response.Trace.Steps[0].ActivityRef != "#log" {
			t.Fatalf("expected runtime-backed activity ref to come from app metadata, got %+v", response.Trace.Steps[0])
		}
		if response.Trace.Steps[0].Input["message"] != "hello" {
			t.Fatalf("expected runtime-backed step input from real task events, got %+v", response.Trace.Steps[0])
		}
		if len(response.Trace.Steps[0].Output) != 0 {
			t.Fatalf("expected runtime-backed trace not to fabricate task outputs for log activity, got %+v", response.Trace.Steps[0].Output)
		}
		if response.Trace.RuntimeEvidence.NormalizedSteps[0].ResolvedInputs["message"] != "hello" {
			t.Fatalf("expected normalized runtime inputs to come from real task events, got %+v", response.Trace.RuntimeEvidence.NormalizedSteps[0])
		}
		if len(response.Trace.RuntimeEvidence.NormalizedSteps[0].ProducedOutputs) != 0 {
			t.Fatalf("expected normalized runtime evidence not to fabricate produced outputs, got %+v", response.Trace.RuntimeEvidence.NormalizedSteps[0])
		}
		if response.Trace.RuntimeEvidence.NormalizedSteps[0].FlowStateBefore["payload"] != "hello" {
			t.Fatalf("expected normalized flow state before task execution, got %+v", response.Trace.RuntimeEvidence.NormalizedSteps[0])
		}
		if response.Trace.RuntimeEvidence.NormalizedSteps[0].FlowStateAfter["payload"] != "hello" {
			t.Fatalf("expected normalized flow state after task execution, got %+v", response.Trace.RuntimeEvidence.NormalizedSteps[0])
		}
		if response.Trace.Steps[0].FlowState["payload"] != "hello" {
			t.Fatalf("expected recorder-derived per-step flow state, got %+v", response.Trace.Steps[0].FlowState)
		}
		if response.Trace.Steps[0].ActivityState["taskStatus"] != "completed" {
			t.Fatalf("expected recorder-backed per-step activity evidence, got %+v", response.Trace.Steps[0].ActivityState)
		}
		if response.Trace.Steps[0].StartedAt == "" || response.Trace.Steps[0].FinishedAt == "" {
			t.Fatalf("expected runtime-backed trace to capture lifecycle timestamps, got %+v", response.Trace.Steps[0])
		}
		if !hasDiagnosticCode(response.Trace.Steps[0].Diagnostics, "flogo.run_trace.runtime_step_normalized") {
			t.Fatalf("expected runtime-backed step normalization diagnostic, got %+v", response.Trace.Steps[0].Diagnostics)
		}
		if !taskEventHasInput(response.Trace.RuntimeEvidence.TaskEvents, "message", "hello") {
			t.Fatalf("expected runtime task events to retain task input evidence, got %+v", response.Trace.RuntimeEvidence.TaskEvents)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.runtime_backed") {
			t.Fatalf("expected runtime-backed diagnostic, got %+v", response.Trace.Diagnostics)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.normalized_step_evidence") {
			t.Fatalf("expected trace-level normalized step evidence diagnostic, got %+v", response.Trace.Diagnostics)
		}
		if hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.simulated_control_flow") {
			t.Fatalf("did not expect simulated control-flow diagnostic in runtime-backed trace, got %+v", response.Trace.Diagnostics)
		}
	})

	t.Run("runtime-backed rest trigger trace", func(t *testing.T) {
		app := runtimeRestTraceTestApp()

		prepared, diagnostics, ok, err := prepareRuntimeTraceRESTTrigger(app, "hello")
		if err != nil {
			t.Fatalf("expected REST trace preparation to succeed, got error: %v", err)
		}
		if !ok {
			t.Fatalf("expected REST trace preparation to be eligible, diagnostics=%+v", diagnostics)
		}
		if prepared.RuntimeRequestMappings["message"] != "=$.content.message" {
			t.Fatalf("expected request mappings to translate into the official trigger scope, got %+v", prepared.RuntimeRequestMappings)
		}
		if prepared.RuntimeReplyMappings["data"] != "=$.message" {
			t.Fatalf("expected reply mappings to translate into the official trigger scope, got %+v", prepared.RuntimeReplyMappings)
		}
		if !hasDiagnosticCode(diagnostics, "flogo.run_trace.rest_trigger_runtime_mapping_translation") {
			t.Fatalf("expected REST mapping translation diagnostics, got %+v", diagnostics)
		}

		_, unsupportedReason, err := prepareRuntimeTraceFlow(app, "hello")
		if err != nil {
			t.Fatalf("expected REST flow preparation to succeed, got error: %v", err)
		}
		if unsupportedReason != "" {
			t.Fatalf("expected REST flow preparation to be eligible, got %q", unsupportedReason)
		}

		response := runHelperTraceCLI(t, app, runTraceRequest{
			FlowID:      "hello",
			SampleInput: map[string]any{"message": "hello"},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected runtime-backed REST trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
			t.Fatalf("expected runtime-backed REST evidence kind, got %q diagnostics=%+v runtimeEvidence=%+v", response.Trace.EvidenceKind, response.Trace.Diagnostics, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected runtime-backed REST trace to include runtime evidence")
		}
		if response.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedRESTTriggerTraceMode {
			t.Fatalf("expected REST runtime mode %q, got %+v", runtimeBackedRESTTriggerTraceMode, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime == nil {
			t.Fatal("expected runtime-backed REST trace to include REST trigger evidence")
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Kind != "rest" {
			t.Fatalf("expected REST trigger evidence kind %q, got %+v", "rest", response.Trace.RuntimeEvidence.RestTriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Request == nil {
			t.Fatal("expected REST trigger request evidence")
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Request.Method != "POST" {
			t.Fatalf("expected REST trigger request method POST, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Request)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Request.Path != "/hello" {
			t.Fatalf("expected REST trigger request path /hello, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Request)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Request.QueryParams["payload"] != nil {
			t.Fatalf("expected query params to remain empty on the supported static-path slice, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Request)
		}
		if message := mapValue(response.Trace.RuntimeEvidence.RestTriggerRuntime.Request.Body)["message"]; message != "hello" {
			t.Fatalf("expected REST request body evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Request)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping == nil {
			t.Fatal("expected REST trigger mapping evidence")
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping.MappedFlowInput["message"] != "hello" {
			t.Fatalf("expected mapped flow input to reflect the request payload, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping.RequestMappings["message"] != "=$trigger.content.message" {
			t.Fatalf("expected stored request mapping evidence to preserve the original handler contract, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply == nil {
			t.Fatal("expected REST trigger reply evidence")
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply.Status != 200 {
			t.Fatalf("expected REST trigger reply status 200, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply.Body != nil || response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply.Data != nil {
			t.Fatalf("expected REST reply body to stay empty when the flow does not return concrete output data, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply)
		}
		if response.Trace.Summary.Input["message"] != "hello" {
			t.Fatalf("expected runtime-backed REST summary input to reflect mapped flow input, got %+v", response.Trace.Summary.Input)
		}
		if response.Trace.Summary.Output["message"] != "" {
			t.Fatalf("expected runtime-backed REST summary output to preserve the actual empty flow output, got %+v", response.Trace.Summary.Output)
		}
		if response.Trace.RuntimeEvidence.FlowStart["triggerRequest"] == nil {
			t.Fatalf("expected REST trigger request evidence in flowStart, got %+v", response.Trace.RuntimeEvidence.FlowStart)
		}
		if response.Trace.RuntimeEvidence.FlowDone["triggerReply"] == nil {
			t.Fatalf("expected REST trigger reply evidence in flowDone, got %+v", response.Trace.RuntimeEvidence.FlowDone)
		}
		if response.Trace.RuntimeEvidence.RestTriggerRuntime.FlowOutput["message"] != "" {
			t.Fatalf("expected REST flow output evidence to preserve the actual empty flow return value, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.NormalizedSteps == nil || len(response.Trace.RuntimeEvidence.NormalizedSteps) != 1 {
			t.Fatalf("expected normalized runtime step evidence for REST trace, got %+v", response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.NormalizedSteps[0].ResolvedInputs["message"] != "hello" {
			t.Fatalf("expected normalized runtime input evidence to reflect the request payload, got %+v", response.Trace.RuntimeEvidence.NormalizedSteps[0])
		}
		if response.Trace.RuntimeEvidence.NormalizedSteps[0].FlowStateAfter["message"] != "hello" {
			t.Fatalf("expected normalized flow state after the REST step to reflect the mapped input, got %+v", response.Trace.RuntimeEvidence.NormalizedSteps[0])
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.rest_trigger_runtime_backed") {
			t.Fatalf("expected REST runtime diagnostic, got %+v", response.Trace.Diagnostics)
		}
		if !hasDiagnosticCode(response.Trace.RuntimeEvidence.RestTriggerRuntime.Diagnostics, "flogo.run_trace.rest_trigger_evidence") {
			t.Fatalf("expected nested REST evidence diagnostic, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Diagnostics)
		}
	})

	t.Run("runtime-backed cli trigger trace", func(t *testing.T) {
		app := runtimeCLITraceTestApp()

		prepared, diagnostics, ok, err := prepareRuntimeTraceCLITrigger(app, "hello")
		if err != nil {
			t.Fatalf("expected CLI trace preparation to succeed, got error: %v", err)
		}
		if !ok {
			t.Fatalf("expected CLI trace preparation to be eligible, diagnostics=%+v", diagnostics)
		}
		if prepared.RuntimeInputMappings["args"] != "=$.args" {
			t.Fatalf("expected CLI request mappings to translate into the official trigger scope, got %+v", prepared.RuntimeInputMappings)
		}
		if prepared.RuntimeOutputMappings["data"] != "cli-ok" {
			t.Fatalf("expected CLI reply mappings to preserve the literal CLI reply contract, got %+v", prepared.RuntimeOutputMappings)
		}
		if !hasDiagnosticCode(diagnostics, "flogo.run_trace.cli_trigger_runtime_mapping_translation") {
			t.Fatalf("expected CLI mapping translation diagnostics, got %+v", diagnostics)
		}

		response := runHelperTraceCLI(t, app, runTraceRequest{
			FlowID: "hello",
			SampleInput: map[string]any{
				"args":  []any{"hello", "world"},
				"flags": map[string]any{"loud": true},
			},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected runtime-backed CLI trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
			t.Fatalf("expected runtime-backed CLI evidence kind, got %q diagnostics=%+v runtimeEvidence=%+v", response.Trace.EvidenceKind, response.Trace.Diagnostics, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected runtime-backed CLI trace to include runtime evidence")
		}
		if response.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedCLITriggerTraceMode {
			t.Fatalf("expected CLI runtime mode %q, got %+v", runtimeBackedCLITriggerTraceMode, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime == nil {
			t.Fatal("expected runtime-backed CLI trace to include CLI trigger evidence")
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime.Kind != "cli" {
			t.Fatalf("expected CLI trigger evidence kind %q, got %+v", "cli", response.Trace.RuntimeEvidence.CLITriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime.Settings == nil || !response.Trace.RuntimeEvidence.CLITriggerRuntime.Settings.SingleCmd {
			t.Fatalf("expected CLI settings evidence with singleCmd=true, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime.Handler == nil || response.Trace.RuntimeEvidence.CLITriggerRuntime.Handler.Command != "say" {
			t.Fatalf("expected CLI command evidence, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime)
		}
		if len(response.Trace.RuntimeEvidence.CLITriggerRuntime.Args) != 2 || response.Trace.RuntimeEvidence.CLITriggerRuntime.Args[0] != "hello" {
			t.Fatalf("expected CLI args evidence, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime.Flags["loud"] != true {
			t.Fatalf("expected CLI flag evidence, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime.FlowInput["flags"].(map[string]any)["loud"] != true {
			t.Fatalf("expected mapped CLI flow input evidence, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime.FlowInput)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime.Reply == nil || response.Trace.RuntimeEvidence.CLITriggerRuntime.Reply.Data != "cli-ok" {
			t.Fatalf("expected CLI reply evidence, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime.Reply.Stdout != "cli-ok" {
			t.Fatalf("expected CLI stdout evidence, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime.Reply)
		}
		if !containsString(response.Trace.RuntimeEvidence.CLITriggerRuntime.UnavailableFields, "flowOutput") {
			t.Fatalf("expected CLI trace to mark flow output unavailable on the narrow slice, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime)
		}
		if len(response.Trace.RuntimeEvidence.NormalizedSteps) != 1 {
			t.Fatalf("expected normalized runtime step evidence for CLI trace, got %+v", response.Trace.RuntimeEvidence)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.cli_trigger_runtime_backed") {
			t.Fatalf("expected CLI runtime diagnostic, got %+v", response.Trace.Diagnostics)
		}
		if !hasDiagnosticCode(response.Trace.RuntimeEvidence.CLITriggerRuntime.Diagnostics, "flogo.run_trace.cli_trigger_evidence") {
			t.Fatalf("expected nested CLI evidence diagnostic, got %+v", response.Trace.RuntimeEvidence.CLITriggerRuntime.Diagnostics)
		}
	})

	t.Run("runtime-backed timer trigger trace", func(t *testing.T) {
		app := runtimeBackedTimerTraceTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID:      "hello",
			SampleInput: map[string]any{"payload": "hello"},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected runtime-backed timer trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
			t.Fatalf("expected runtime-backed timer evidence kind, got %q diagnostics=%+v runtimeEvidence=%+v", response.Trace.EvidenceKind, response.Trace.Diagnostics, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected runtime-backed timer trace to include runtime evidence")
		}
		if response.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedTimerTriggerTraceMode {
			t.Fatalf("expected timer runtime mode %q, got %+v", runtimeBackedTimerTriggerTraceMode, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.TimerTriggerRuntime == nil {
			t.Fatalf("expected timer runtime evidence on runtime-backed timer trace, got %+v", response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.TimerTriggerRuntime.Kind != "timer" {
			t.Fatalf("expected timer runtime evidence kind, got %+v", response.Trace.RuntimeEvidence.TimerTriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.TimerTriggerRuntime.Settings == nil || response.Trace.RuntimeEvidence.TimerTriggerRuntime.Settings.RunMode != "once" {
			t.Fatalf("expected one-shot timer settings evidence, got %+v", response.Trace.RuntimeEvidence.TimerTriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.TimerTriggerRuntime.Tick == nil || response.Trace.RuntimeEvidence.TimerTriggerRuntime.Tick.TickCount != 1 {
			t.Fatalf("expected observed timer tick evidence, got %+v", response.Trace.RuntimeEvidence.TimerTriggerRuntime)
		}
		if len(response.Trace.Steps) != 1 {
			t.Fatalf("expected one runtime-backed timer step, got %d", len(response.Trace.Steps))
		}
		if response.Trace.Steps[0].TaskID != "log-request" {
			t.Fatalf("expected runtime-backed timer task id to remain canonical, got %q", response.Trace.Steps[0].TaskID)
		}
		if response.Trace.Steps[0].Input["message"] != "timer-fired" {
			t.Fatalf("expected runtime-backed timer step input from real task events, got %+v", response.Trace.Steps[0])
		}
		if response.Trace.Steps[0].Output != nil && len(response.Trace.Steps[0].Output) > 0 {
			t.Fatalf("expected runtime-backed timer trace not to fabricate task outputs for log activity, got %+v", response.Trace.Steps[0].Output)
		}
		if response.Trace.RuntimeEvidence.RecorderBacked != true {
			t.Fatalf("expected recorder-backed timer evidence, got %+v", response.Trace.RuntimeEvidence)
		}
		if len(response.Trace.RuntimeEvidence.NormalizedSteps) != 1 {
			t.Fatalf("expected normalized timer step evidence, got %+v", response.Trace.RuntimeEvidence)
		}
		if !taskEventHasInput(response.Trace.RuntimeEvidence.TaskEvents, "message", "timer-fired") {
			t.Fatalf("expected timer task events to retain task input evidence, got %+v", response.Trace.RuntimeEvidence.TaskEvents)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.timer_trigger_runtime_backed") {
			t.Fatalf("expected timer runtime diagnostic, got %+v", response.Trace.Diagnostics)
		}
		if !hasDiagnosticCode(response.Trace.RuntimeEvidence.TimerTriggerRuntime.Diagnostics, "flogo.run_trace.timer_trigger_evidence") {
			t.Fatalf("expected nested timer runtime evidence diagnostic, got %+v", response.Trace.RuntimeEvidence.TimerTriggerRuntime.Diagnostics)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.runtime_backed") {
			t.Fatalf("expected runtime-backed diagnostic, got %+v", response.Trace.Diagnostics)
		}
	})

	t.Run("runtime-backed channel trigger trace", func(t *testing.T) {
		app := runtimeChannelTraceTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID: "hello",
			SampleInput: map[string]any{
				"message": "channel-hello",
			},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected runtime-backed channel trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
			t.Fatalf("expected runtime-backed channel evidence kind, got %q diagnostics=%+v runtimeEvidence=%+v", response.Trace.EvidenceKind, response.Trace.Diagnostics, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected runtime-backed channel trace to include runtime evidence")
		}
		if response.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedChannelTriggerTraceMode {
			t.Fatalf("expected channel runtime mode %q, got %+v", runtimeBackedChannelTriggerTraceMode, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.ChannelTriggerRuntime == nil {
			t.Fatal("expected runtime-backed channel trace to include channel trigger evidence")
		}
		if response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Kind != "channel" {
			t.Fatalf("expected channel trigger evidence kind %q, got %+v", "channel", response.Trace.RuntimeEvidence.ChannelTriggerRuntime)
		}
		if response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Settings == nil || len(response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Settings.Channels) != 1 || response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Settings.Channels[0] != "orders:5" {
			t.Fatalf("expected channel settings evidence, got %+v", response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Settings)
		}
		if response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Handler == nil || response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Handler.Channel != "orders" {
			t.Fatalf("expected channel handler evidence, got %+v", response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Handler)
		}
		if response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Data != "channel-hello" {
			t.Fatalf("expected channel data evidence, got %+v", response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Data)
		}
		if response.Trace.RuntimeEvidence.ChannelTriggerRuntime.FlowInput["message"] != "channel-hello" {
			t.Fatalf("expected mapped channel flow input evidence, got %+v", response.Trace.RuntimeEvidence.ChannelTriggerRuntime.FlowInput)
		}
		if len(response.Trace.RuntimeEvidence.ChannelTriggerRuntime.FlowOutput) != 0 {
			t.Fatalf("expected channel flow output to remain unavailable for the narrow slice, got %+v", response.Trace.RuntimeEvidence.ChannelTriggerRuntime.FlowOutput)
		}
		if !containsString(response.Trace.RuntimeEvidence.ChannelTriggerRuntime.UnavailableFields, "flowOutput") {
			t.Fatalf("expected channel trace to mark flow output unavailable, got %+v", response.Trace.RuntimeEvidence.ChannelTriggerRuntime)
		}
		if len(response.Trace.RuntimeEvidence.NormalizedSteps) != 1 {
			t.Fatalf("expected normalized runtime step evidence for channel trace, got %+v", response.Trace.RuntimeEvidence)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.channel_trigger_runtime_backed") {
			t.Fatalf("expected channel runtime diagnostic, got %+v", response.Trace.Diagnostics)
		}
		if !hasDiagnosticCode(response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Diagnostics, "flogo.run_trace.channel_trigger_evidence") {
			t.Fatalf("expected nested channel evidence diagnostic, got %+v", response.Trace.RuntimeEvidence.ChannelTriggerRuntime.Diagnostics)
		}
	})

	t.Run("timer trigger unsupported shape falls back", func(t *testing.T) {
		app := unsupportedTimerTriggerFallbackTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID:      "hello",
			SampleInput: map[string]any{"payload": "hello"},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected fallback trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindSimulatedFallback {
			t.Fatalf("expected unsupported timer slice to fall back to simulation, got %q", response.Trace.EvidenceKind)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected fallback trace to retain runtime evidence metadata")
		}
		if response.Trace.RuntimeEvidence.Kind != runTraceEvidenceKindSimulatedFallback {
			t.Fatalf("expected fallback runtime evidence kind %q, got %+v", runTraceEvidenceKindSimulatedFallback, response.Trace.RuntimeEvidence)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.timer_trigger_runtime_fallback") {
			t.Fatalf("expected timer fallback diagnostic, got %+v", response.Trace.Diagnostics)
		}
	})

	t.Run("cli trigger unsupported shape falls back", func(t *testing.T) {
		app := unsupportedCLITriggerFallbackTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID: "hello",
			SampleInput: map[string]any{
				"args":  []any{"hello"},
				"flags": map[string]any{"loud": true},
			},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected fallback trace to produce a trace payload")
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected fallback trace to retain runtime evidence metadata")
		}
		if response.Trace.RuntimeEvidence.RuntimeMode == runtimeBackedCLITriggerTraceMode {
			t.Fatalf("did not expect unsupported CLI slice to remain on CLI runtime mode %q, got %+v", runtimeBackedCLITriggerTraceMode, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.CLITriggerRuntime != nil {
			t.Fatalf("did not expect CLI trigger runtime evidence on unsupported slice fallback, got %+v", response.Trace.RuntimeEvidence)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.cli_trigger_runtime_fallback") {
			t.Fatalf("expected CLI fallback diagnostic, got %+v", response.Trace.Diagnostics)
		}
	})

	t.Run("channel trigger unsupported shape falls back", func(t *testing.T) {
		app := unsupportedChannelTriggerFallbackTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID: "hello",
			SampleInput: map[string]any{
				"message": "channel-hello",
			},
			Capture: runTraceCaptureOptions{
				IncludeFlowState:       true,
				IncludeActivityOutputs: true,
				IncludeTaskInputs:      true,
				IncludeTaskOutputs:     true,
			},
		})

		if response.Trace == nil {
			t.Fatal("expected fallback trace to produce a trace payload")
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected fallback trace to retain runtime evidence metadata")
		}
		if response.Trace.RuntimeEvidence.RuntimeMode == runtimeBackedChannelTriggerTraceMode {
			t.Fatalf("did not expect unsupported Channel slice to remain on channel runtime mode %q, got %+v", runtimeBackedChannelTriggerTraceMode, response.Trace.RuntimeEvidence)
		}
		if response.Trace.RuntimeEvidence.ChannelTriggerRuntime != nil {
			t.Fatalf("did not expect channel trigger runtime evidence on unsupported slice fallback, got %+v", response.Trace.RuntimeEvidence)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.channel_trigger_runtime_fallback") {
			t.Fatalf("expected channel fallback diagnostic, got %+v", response.Trace.Diagnostics)
		}
	})

	t.Run("simulated control flow fallback", func(t *testing.T) {
		app := runtimeFallbackTraceTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID:      "hello",
			SampleInput: map[string]any{"payload": "hello"},
		})

		if response.Trace == nil {
			t.Fatal("expected simulated trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindSimulatedFallback {
			t.Fatalf("expected simulated fallback evidence kind, got %q", response.Trace.EvidenceKind)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected simulated fallback trace to include runtime evidence metadata")
		}
		if response.Trace.RuntimeEvidence.Kind != runTraceEvidenceKindSimulatedFallback {
			t.Fatalf("expected simulated fallback runtime evidence kind, got %+v", response.Trace.RuntimeEvidence)
		}
		if response.Trace.Summary.Status != "completed" {
			t.Fatalf("expected completed simulated trace, got %q", response.Trace.Summary.Status)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.runtime_fallback") {
			t.Fatalf("expected runtime fallback diagnostic, got %+v", response.Trace.Diagnostics)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.simulated_control_flow") {
			t.Fatalf("expected simulated control-flow diagnostic, got %+v", response.Trace.Diagnostics)
		}
	})

	t.Run("rest trigger unsupported shape falls back", func(t *testing.T) {
		app := runtimeRestFallbackTraceTestApp()

		response := traceFlow(app, runTraceRequest{
			FlowID:      "hello",
			SampleInput: map[string]any{"message": "hello"},
		})

		if response.Trace == nil {
			t.Fatal("expected fallback trace to produce a trace payload")
		}
		if response.Trace.EvidenceKind != runTraceEvidenceKindSimulatedFallback {
			t.Fatalf("expected REST fallback to be simulated, got %q", response.Trace.EvidenceKind)
		}
		if response.Trace.RuntimeEvidence == nil {
			t.Fatal("expected fallback trace to retain runtime evidence metadata")
		}
		if response.Trace.RuntimeEvidence.Kind != runTraceEvidenceKindSimulatedFallback {
			t.Fatalf("expected fallback runtime evidence kind, got %+v", response.Trace.RuntimeEvidence)
		}
		if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.rest_trigger_runtime_fallback") && !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.runtime_fallback") {
			t.Fatalf("expected REST fallback diagnostic, got %+v", response.Trace.Diagnostics)
		}
	})
}

func TestTraceFlowUsesRuntimeBackedRESTTriggerWhenEligible(t *testing.T) {
	t.Skip("deprecated REST helper slice covered by runtime-backed REST trigger trace subtest")
	app := runtimeBackedRESTTriggerTestApp()

	response := traceFlow(app, runTraceRequest{
		FlowID: "hello",
		SampleInput: map[string]any{
			"payload": "hello",
		},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
	})

	if response.Trace == nil {
		t.Fatal("expected REST-triggered runtime-backed trace to produce a trace payload")
	}
	if response.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected runtime-backed evidence kind, got %q", response.Trace.EvidenceKind)
	}
	if response.Trace.RuntimeEvidence == nil {
		t.Fatal("expected runtime-backed REST trace to include runtime evidence")
	}
	if response.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedRESTTriggerTraceMode {
		t.Fatalf("expected REST trigger runtime mode %q, got %+v", runtimeBackedRESTTriggerTraceMode, response.Trace.RuntimeEvidence)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime == nil {
		t.Fatalf("expected REST trigger runtime evidence, got %+v", response.Trace.RuntimeEvidence)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Kind != "rest" {
		t.Fatalf("expected REST trigger runtime kind, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Request == nil || response.Trace.RuntimeEvidence.RestTriggerRuntime.Request.Method != "POST" {
		t.Fatalf("expected REST request evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Request.Path != "/hello" {
		t.Fatalf("expected REST request path evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Request)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Request.Body.(map[string]any)["payload"] != "hello" {
		t.Fatalf("expected REST request body evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Request)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.FlowInput["payload"] != "hello" {
		t.Fatalf("expected mapped flow input evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime)
	}
	if response.Trace.Summary.Input["payload"] != "hello" {
		t.Fatalf("expected trace summary input to reflect mapped flow input, got %+v", response.Trace.Summary)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.FlowOutput["message"] != "hello" {
		t.Fatalf("expected mapped flow output evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime)
	}
	if response.Trace.Summary.Output["message"] != "hello" {
		t.Fatalf("expected trace summary output to reflect flow output, got %+v", response.Trace.Summary)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply == nil || response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply.Status != 201 {
		t.Fatalf("expected HTTP reply evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime)
	}
	if replyBody, ok := response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply.Body.(map[string]any); !ok || replyBody["message"] != "hello" {
		t.Fatalf("expected HTTP reply body evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply.Headers["x-runtime"] != "rest" {
		t.Fatalf("expected HTTP reply header evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Reply.Headers)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping == nil || response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping.RequestMappingMode != "explicit" {
		t.Fatalf("expected REST mapping evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping.MappedFlowInput["payload"] != "hello" {
		t.Fatalf("expected mapped flow input in mapping evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping.MappedFlowOutput["message"] != "hello" {
		t.Fatalf("expected mapped flow output in mapping evidence, got %+v", response.Trace.RuntimeEvidence.RestTriggerRuntime.Mapping)
	}
	if len(response.Trace.RuntimeEvidence.NormalizedSteps) != 1 {
		t.Fatalf("expected normalized step evidence on REST runtime trace, got %+v", response.Trace.RuntimeEvidence)
	}
	if response.Trace.RuntimeEvidence.NormalizedSteps[0].ResolvedInputs["message"] != "hello" {
		t.Fatalf("expected task input evidence from REST runtime trace, got %+v", response.Trace.RuntimeEvidence.NormalizedSteps[0])
	}
	if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.rest_trigger_runtime_backed") {
		t.Fatalf("expected REST trigger runtime diagnostic, got %+v", response.Trace.Diagnostics)
	}
}

func TestTraceFlowFallsBackFromUnsupportedRESTTriggerToDirectRuntimeSlice(t *testing.T) {
	t.Skip("deprecated REST fallback helper slice covered by runtime-backed REST trigger fallback subtest")
	app := unsupportedRESTTriggerFallbackTestApp()

	response := traceFlow(app, runTraceRequest{
		FlowID: "hello",
		SampleInput: map[string]any{
			"payload": "hello",
		},
	})

	if response.Trace == nil {
		t.Fatal("expected runtime trace payload")
	}
	if response.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected direct runtime-backed trace fallback, got %+v", response.Trace)
	}
	if response.Trace.RuntimeEvidence == nil {
		t.Fatal("expected runtime evidence")
	}
	if response.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedTraceMode {
		t.Fatalf("expected fallback to direct runtime mode %q, got %+v", runtimeBackedTraceMode, response.Trace.RuntimeEvidence)
	}
	if response.Trace.RuntimeEvidence.RestTriggerRuntime != nil {
		t.Fatalf("did not expect REST trigger runtime evidence on unsupported slice fallback, got %+v", response.Trace.RuntimeEvidence)
	}
	if !hasDiagnosticCode(response.Trace.Diagnostics, "flogo.run_trace.rest_trigger_runtime_fallback") {
		t.Fatalf("expected REST trigger runtime fallback diagnostic, got %+v", response.Trace.Diagnostics)
	}
}

func TestReplayFlowReturnsRuntimeBackedEvidenceForEligibleFlows(t *testing.T) {
	app := runtimeBackedTraceTestApp()

	response := replayFlow(app, replayRequest{
		FlowID:    "hello",
		BaseInput: map[string]any{"payload": "hello"},
		Overrides: map[string]any{"payload": "replayed"},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected replay to produce a trace payload")
	}
	if response.Result.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected replay trace to be runtime-backed, got %q", response.Result.Trace.EvidenceKind)
	}
	if response.Result.RuntimeEvidence == nil {
		t.Fatal("expected runtime-backed replay to include recorder evidence")
	}
	if response.Result.RuntimeEvidence.RuntimeMode != runtimeBackedReplayMode {
		t.Fatalf("expected replay runtime mode %q, got %+v", runtimeBackedReplayMode, response.Result.RuntimeEvidence)
	}
	if !response.Result.RuntimeEvidence.RecorderBacked {
		t.Fatalf("expected replay runtime evidence to be recorder-backed, got %+v", response.Result.RuntimeEvidence)
	}
	if len(response.Result.RuntimeEvidence.NormalizedSteps) != 1 {
		t.Fatalf("expected replay runtime evidence to include normalized steps, got %+v", response.Result.RuntimeEvidence)
	}
	if len(response.Result.Trace.Steps) != 1 {
		t.Fatalf("expected replay trace to contain one normalized step, got %+v", response.Result.Trace)
	}
	if response.Result.Trace.Steps[0].TaskID != "log-request" {
		t.Fatalf("expected replay step task id to stay canonical, got %+v", response.Result.Trace.Steps[0])
	}
	if len(response.Result.Trace.Steps[0].Input) > 0 {
		if response.Result.Trace.Steps[0].Input["message"] != "replayed" {
			t.Fatalf("expected replay trace task input to reflect the replayed value, got %+v", response.Result.Trace.Steps[0])
		}
	} else if !diagnosticHasUnavailableField(response.Result.Trace.Steps[0].Diagnostics, "taskInput") {
		t.Fatalf("expected replay step diagnostics to mark task input unavailable when not captured, got %+v", response.Result.Trace.Steps[0].Diagnostics)
	}
	if len(response.Result.RuntimeEvidence.NormalizedSteps[0].ResolvedInputs) > 0 {
		if response.Result.RuntimeEvidence.NormalizedSteps[0].ResolvedInputs["message"] != "replayed" {
			t.Fatalf("expected replay normalized input evidence to reflect the replayed value, got %+v", response.Result.RuntimeEvidence.NormalizedSteps[0])
		}
	} else if !containsString(response.Result.RuntimeEvidence.NormalizedSteps[0].UnavailableFields, "resolvedInputs") {
		t.Fatalf("expected replay normalized evidence to mark resolved inputs unavailable when not captured, got %+v", response.Result.RuntimeEvidence.NormalizedSteps[0])
	}
	if len(response.Result.RuntimeEvidence.NormalizedSteps[0].ProducedOutputs) != 0 {
		t.Fatalf("expected replay normalized evidence not to fabricate produced outputs, got %+v", response.Result.RuntimeEvidence.NormalizedSteps[0])
	}
	if response.Result.Trace.Steps[0].FlowState["payload"] != "replayed" {
		t.Fatalf("expected replay trace to include recorder-backed per-step state, got %+v", response.Result.Trace.Steps[0])
	}
	if response.Result.Summary.InputSource != "explicit_input" {
		t.Fatalf("expected replay summary to keep explicit input source, got %q", response.Result.Summary.InputSource)
	}
}

func TestReplayFlowReturnsRuntimeBackedRESTEvidenceForEligibleFlows(t *testing.T) {
	app := runtimeRestTraceTestApp()

	response := runHelperReplayCLI(t, app, replayRequest{
		FlowID:    "hello",
		BaseInput: map[string]any{"message": "hello"},
		Overrides: map[string]any{"message": "replayed"},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected REST replay to produce a nested trace payload")
	}
	if response.Result.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected runtime-backed REST replay trace, got %+v", response.Result.Trace)
	}
	if response.Result.RuntimeEvidence == nil {
		t.Fatal("expected REST replay runtime evidence")
	}
	if response.Result.RuntimeEvidence.RuntimeMode != runtimeBackedRESTReplayMode {
		t.Fatalf("expected REST replay runtime mode %q, got %+v", runtimeBackedRESTReplayMode, response.Result.RuntimeEvidence)
	}
	if response.Result.Trace.RuntimeEvidence == nil || response.Result.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedRESTReplayMode {
		t.Fatalf("expected nested trace runtime mode %q, got %+v", runtimeBackedRESTReplayMode, response.Result.Trace.RuntimeEvidence)
	}
	if response.Result.RuntimeEvidence.RestTriggerRuntime == nil {
		t.Fatal("expected REST replay to preserve REST trigger runtime evidence")
	}
	if response.Result.RuntimeEvidence.RestTriggerRuntime.Request == nil {
		t.Fatal("expected REST replay request evidence")
	}
	if response.Result.RuntimeEvidence.RestTriggerRuntime.Request.Method != "POST" || response.Result.RuntimeEvidence.RestTriggerRuntime.Request.Path != "/hello" {
		t.Fatalf("expected REST replay request method/path evidence, got %+v", response.Result.RuntimeEvidence.RestTriggerRuntime.Request)
	}
	if message := mapValue(response.Result.RuntimeEvidence.RestTriggerRuntime.Request.Body)["message"]; message != "replayed" {
		t.Fatalf("expected REST replay request body to reflect overrides, got %+v", response.Result.RuntimeEvidence.RestTriggerRuntime.Request)
	}
	if response.Result.RuntimeEvidence.RestTriggerRuntime.FlowInput["message"] != "replayed" {
		t.Fatalf("expected REST replay mapped flow input evidence, got %+v", response.Result.RuntimeEvidence.RestTriggerRuntime)
	}
	if response.Result.RuntimeEvidence.RestTriggerRuntime.Reply == nil || response.Result.RuntimeEvidence.RestTriggerRuntime.Reply.Status != 200 {
		t.Fatalf("expected REST replay reply evidence, got %+v", response.Result.RuntimeEvidence.RestTriggerRuntime)
	}
	if !hasDiagnosticCode(response.Result.Summary.Diagnostics, "flogo.replay.rest_runtime_backed") {
		t.Fatalf("expected REST replay diagnostic, got %+v", response.Result.Summary.Diagnostics)
	}
}

func TestReplayFlowReturnsRuntimeBackedCLIEvidenceForEligibleFlows(t *testing.T) {
	app := runtimeCLITraceTestApp()

	response := runHelperReplayCLI(t, app, replayRequest{
		FlowID: "hello",
		BaseInput: map[string]any{
			"args":  []any{"replayed", "cli"},
			"flags": map[string]any{"loud": true},
		},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected CLI replay to produce a nested trace payload")
	}
	if response.Result.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected runtime-backed CLI replay trace, got %+v", response.Result.Trace)
	}
	if response.Result.RuntimeEvidence == nil {
		t.Fatal("expected CLI replay runtime evidence")
	}
	if response.Result.RuntimeEvidence.RuntimeMode != runtimeBackedCLIReplayMode {
		t.Fatalf("expected CLI replay runtime mode %q, got %+v", runtimeBackedCLIReplayMode, response.Result.RuntimeEvidence)
	}
	if response.Result.Trace.RuntimeEvidence == nil || response.Result.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedCLIReplayMode {
		t.Fatalf("expected nested CLI replay runtime mode %q, got %+v", runtimeBackedCLIReplayMode, response.Result.Trace.RuntimeEvidence)
	}
	if response.Result.RuntimeEvidence.CLITriggerRuntime == nil {
		t.Fatal("expected CLI replay to preserve CLI trigger runtime evidence")
	}
	if len(response.Result.RuntimeEvidence.CLITriggerRuntime.Args) != 2 || response.Result.RuntimeEvidence.CLITriggerRuntime.Args[0] != "replayed" {
		t.Fatalf("expected CLI replay args evidence, got %+v", response.Result.RuntimeEvidence.CLITriggerRuntime)
	}
	if response.Result.RuntimeEvidence.CLITriggerRuntime.Flags["loud"] != true {
		t.Fatalf("expected CLI replay flag evidence, got %+v", response.Result.RuntimeEvidence.CLITriggerRuntime)
	}
	if response.Result.RuntimeEvidence.CLITriggerRuntime.Reply == nil || response.Result.RuntimeEvidence.CLITriggerRuntime.Reply.Stdout != "cli-ok" {
		t.Fatalf("expected CLI replay reply evidence, got %+v", response.Result.RuntimeEvidence.CLITriggerRuntime)
	}
	if !hasDiagnosticCode(response.Result.Summary.Diagnostics, "flogo.replay.cli_runtime_backed") {
		t.Fatalf("expected CLI replay diagnostic, got %+v", response.Result.Summary.Diagnostics)
	}
}

func TestReplayFlowReturnsRuntimeBackedTimerEvidenceForEligibleFlows(t *testing.T) {
	app := runtimeBackedTimerTraceTestApp()

	response := runHelperReplayCLI(t, app, replayRequest{
		FlowID:    "hello",
		BaseInput: map[string]any{"payload": "ignored"},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected timer replay to produce a nested trace payload")
	}
	if response.Result.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected runtime-backed timer replay trace, got %+v", response.Result.Trace)
	}
	if response.Result.RuntimeEvidence == nil {
		t.Fatal("expected timer replay runtime evidence")
	}
	if response.Result.RuntimeEvidence.RuntimeMode != runtimeBackedTimerReplayMode {
		t.Fatalf("expected timer replay runtime mode %q, got %+v", runtimeBackedTimerReplayMode, response.Result.RuntimeEvidence)
	}
	if response.Result.Trace.RuntimeEvidence == nil || response.Result.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedTimerReplayMode {
		t.Fatalf("expected nested timer replay runtime mode %q, got %+v", runtimeBackedTimerReplayMode, response.Result.Trace.RuntimeEvidence)
	}
	if response.Result.RuntimeEvidence.TimerTriggerRuntime == nil {
		t.Fatal("expected timer replay to preserve timer trigger runtime evidence")
	}
	if response.Result.RuntimeEvidence.TimerTriggerRuntime.Kind != "timer" {
		t.Fatalf("expected timer replay evidence kind, got %+v", response.Result.RuntimeEvidence.TimerTriggerRuntime)
	}
	if response.Result.RuntimeEvidence.TimerTriggerRuntime.Settings == nil || response.Result.RuntimeEvidence.TimerTriggerRuntime.Settings.RunMode != "once" {
		t.Fatalf("expected timer replay settings evidence, got %+v", response.Result.RuntimeEvidence.TimerTriggerRuntime)
	}
	if response.Result.RuntimeEvidence.TimerTriggerRuntime.Tick == nil || response.Result.RuntimeEvidence.TimerTriggerRuntime.Tick.TickCount != 1 {
		t.Fatalf("expected timer replay tick evidence, got %+v", response.Result.RuntimeEvidence.TimerTriggerRuntime)
	}
	if !containsString(response.Result.RuntimeEvidence.TimerTriggerRuntime.UnavailableFields, "flowInput") {
		t.Fatalf("expected timer replay to mark flow input unavailable for the narrow timer slice, got %+v", response.Result.RuntimeEvidence.TimerTriggerRuntime)
	}
	if !hasDiagnosticCode(response.Result.Summary.Diagnostics, "flogo.replay.timer_runtime_backed") {
		t.Fatalf("expected timer replay diagnostic, got %+v", response.Result.Summary.Diagnostics)
	}
}

func TestReplayFlowReturnsRuntimeBackedChannelEvidenceForEligibleFlows(t *testing.T) {
	app := runtimeChannelTraceTestApp()

	response := replayFlow(app, replayRequest{
		FlowID:    "hello",
		BaseInput: map[string]any{"message": "channel-replayed"},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected channel replay to produce a nested trace payload")
	}
	if response.Result.Trace.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected runtime-backed channel replay trace, got %+v", response.Result.Trace)
	}
	if response.Result.RuntimeEvidence == nil {
		t.Fatal("expected channel replay runtime evidence")
	}
	if response.Result.RuntimeEvidence.RuntimeMode != runtimeBackedChannelReplayMode {
		t.Fatalf("expected channel replay runtime mode %q, got %+v", runtimeBackedChannelReplayMode, response.Result.RuntimeEvidence)
	}
	if response.Result.Trace.RuntimeEvidence == nil || response.Result.Trace.RuntimeEvidence.RuntimeMode != runtimeBackedChannelReplayMode {
		t.Fatalf("expected nested channel replay runtime mode %q, got %+v", runtimeBackedChannelReplayMode, response.Result.Trace.RuntimeEvidence)
	}
	if response.Result.RuntimeEvidence.ChannelTriggerRuntime == nil {
		t.Fatal("expected channel replay to preserve channel trigger runtime evidence")
	}
	if response.Result.RuntimeEvidence.ChannelTriggerRuntime.Handler == nil || response.Result.RuntimeEvidence.ChannelTriggerRuntime.Handler.Channel != "orders" {
		t.Fatalf("expected channel replay handler evidence, got %+v", response.Result.RuntimeEvidence.ChannelTriggerRuntime)
	}
	if response.Result.RuntimeEvidence.ChannelTriggerRuntime.Data != "channel-replayed" {
		t.Fatalf("expected channel replay data evidence, got %+v", response.Result.RuntimeEvidence.ChannelTriggerRuntime.Data)
	}
	if response.Result.RuntimeEvidence.ChannelTriggerRuntime.FlowInput["message"] != "channel-replayed" {
		t.Fatalf("expected channel replay mapped flow input evidence, got %+v", response.Result.RuntimeEvidence.ChannelTriggerRuntime.FlowInput)
	}
	if !containsString(response.Result.RuntimeEvidence.ChannelTriggerRuntime.UnavailableFields, "flowOutput") {
		t.Fatalf("expected channel replay to mark flow output unavailable for the narrow slice, got %+v", response.Result.RuntimeEvidence.ChannelTriggerRuntime)
	}
	if !hasDiagnosticCode(response.Result.Summary.Diagnostics, "flogo.replay.channel_runtime_backed") {
		t.Fatalf("expected channel replay diagnostic, got %+v", response.Result.Summary.Diagnostics)
	}
}

func TestReplayFlowFallsBackFromUnsupportedRESTRuntimeSlice(t *testing.T) {
	app := runtimeRestFallbackTraceTestApp()

	response := runHelperReplayCLI(t, app, replayRequest{
		FlowID:    "hello",
		BaseInput: map[string]any{"message": "hello"},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected fallback replay to produce a nested trace payload")
	}
	if response.Result.Trace.EvidenceKind != runTraceEvidenceKindSimulatedFallback {
		t.Fatalf("expected unsupported REST replay to fall back to simulated trace, got %+v", response.Result.Trace)
	}
	if response.Result.RuntimeEvidence == nil || response.Result.RuntimeEvidence.Kind != runTraceEvidenceKindSimulatedFallback {
		t.Fatalf("expected fallback replay runtime evidence, got %+v", response.Result.RuntimeEvidence)
	}
}

func TestReplayFlowFallsBackFromUnsupportedCLIRuntimeSlice(t *testing.T) {
	app := unsupportedCLITriggerFallbackTestApp()

	response := runHelperReplayCLI(t, app, replayRequest{
		FlowID: "hello",
		BaseInput: map[string]any{
			"args":  []any{"hello"},
			"flags": map[string]any{"loud": true},
		},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected fallback replay to produce a nested trace payload")
	}
	if response.Result.RuntimeEvidence == nil {
		t.Fatal("expected fallback replay runtime evidence")
	}
	if response.Result.RuntimeEvidence.RuntimeMode == runtimeBackedCLIReplayMode {
		t.Fatalf("did not expect unsupported CLI replay to remain on CLI replay mode %q, got %+v", runtimeBackedCLIReplayMode, response.Result.RuntimeEvidence)
	}
	if response.Result.RuntimeEvidence.CLITriggerRuntime != nil {
		t.Fatalf("did not expect CLI trigger runtime evidence on unsupported replay slice fallback, got %+v", response.Result.RuntimeEvidence)
	}
}

func TestReplayFlowFallsBackFromUnsupportedChannelRuntimeSlice(t *testing.T) {
	app := unsupportedChannelTriggerFallbackTestApp()

	response := replayFlow(app, replayRequest{
		FlowID:    "hello",
		BaseInput: map[string]any{"message": "channel-hello"},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
		ValidateOnly: false,
	})

	if response.Result.Trace == nil {
		t.Fatal("expected fallback replay to produce a nested trace payload")
	}
	if response.Result.RuntimeEvidence == nil {
		t.Fatal("expected fallback replay runtime evidence")
	}
	if response.Result.RuntimeEvidence.RuntimeMode == runtimeBackedChannelReplayMode {
		t.Fatalf("did not expect unsupported Channel replay to remain on channel replay mode %q, got %+v", runtimeBackedChannelReplayMode, response.Result.RuntimeEvidence)
	}
	if response.Result.RuntimeEvidence.ChannelTriggerRuntime != nil {
		t.Fatalf("did not expect channel trigger runtime evidence on unsupported replay slice fallback, got %+v", response.Result.RuntimeEvidence)
	}
}

func TestCompareRunsPrefersNormalizedRuntimeEvidenceWhenAvailable(t *testing.T) {
	response := compareRuns(runComparisonRequest{
		LeftArtifact: comparableRunArtifactInput{
			ArtifactID: "left-trace",
			Kind:       "run_trace",
			Payload: map[string]any{
				"trace": map[string]any{
					"appName":      "demo",
					"flowId":       "hello",
					"evidenceKind": runTraceEvidenceKindRuntimeBacked,
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"recorderKind":   runtimeTraceRecorderKind,
						"recorderMode":   "full",
						"runtimeMode":    runtimeBackedTraceMode,
						"normalizedSteps": []any{
							map[string]any{
								"taskId":            "log-request",
								"status":            "completed",
								"resolvedInputs":    map[string]any{"message": "recorded-left"},
								"producedOutputs":   map[string]any{},
								"flowStateBefore":   map[string]any{"payload": "recorded-left"},
								"flowStateAfter":    map[string]any{"payload": "recorded-left"},
								"unavailableFields": []any{},
								"diagnostics":       []any{},
							},
						},
						"flowStart": map[string]any{
							"flow_inputs": map[string]any{"payload": "recorded-left"},
						},
						"flowDone": map[string]any{
							"flow_outputs": map[string]any{"message": "recorded-left"},
						},
						"steps": []any{
							map[string]any{"id": "step-left"},
						},
					},
					"summary": map[string]any{
						"flowId":      "hello",
						"status":      "completed",
						"input":       map[string]any{"payload": "summary-left"},
						"output":      map[string]any{"message": "summary-left"},
						"stepCount":   0,
						"diagnostics": []any{},
					},
					"steps":       []any{},
					"diagnostics": []any{},
				},
			},
		},
		RightArtifact: comparableRunArtifactInput{
			ArtifactID: "right-replay",
			Kind:       "replay_report",
			Payload: map[string]any{
				"result": map[string]any{
					"summary": map[string]any{
						"flowId":           "hello",
						"status":           "completed",
						"inputSource":      "explicit_input",
						"baseInput":        map[string]any{"payload": "summary-right"},
						"effectiveInput":   map[string]any{"payload": "summary-right"},
						"overridesApplied": false,
						"diagnostics":      []any{},
					},
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"recorderKind":   runtimeTraceRecorderKind,
						"recorderMode":   "full",
						"runtimeMode":    runtimeBackedReplayMode,
						"normalizedSteps": []any{
							map[string]any{
								"taskId":            "log-request",
								"status":            "completed",
								"resolvedInputs":    map[string]any{"message": "recorded-right"},
								"producedOutputs":   map[string]any{},
								"flowStateBefore":   map[string]any{"payload": "recorded-right"},
								"flowStateAfter":    map[string]any{"payload": "recorded-right"},
								"unavailableFields": []any{},
								"diagnostics":       []any{},
							},
						},
						"flowStart": map[string]any{
							"flow_inputs": map[string]any{"payload": "recorded-right"},
						},
						"flowDone": map[string]any{
							"flow_outputs": map[string]any{"message": "recorded-right"},
						},
						"steps": []any{
							map[string]any{"id": "step-right"},
						},
					},
				},
			},
		},
	})

	if response.Result == nil {
		t.Fatal("expected run comparison result")
	}
	if response.Result.ComparisonBasis != "normalized_runtime_evidence" {
		t.Fatalf("expected normalized runtime evidence comparison basis, got %+v", response.Result)
	}
	if !response.Result.Left.NormalizedStepEvidence || !response.Result.Right.NormalizedStepEvidence {
		t.Fatalf("expected normalized step evidence flags on both artifacts, got left=%+v right=%+v", response.Result.Left, response.Result.Right)
	}
	if response.Result.Summary.InputDiff.Left == nil || response.Result.Summary.InputDiff.Right == nil {
		t.Fatalf("expected normalized runtime input diff, got %+v", response.Result.Summary.InputDiff)
	}
	leftInput, _ := response.Result.Summary.InputDiff.Left.(map[string]any)
	rightInput, _ := response.Result.Summary.InputDiff.Right.(map[string]any)
	if leftInput["payload"] != "recorded-left" || rightInput["payload"] != "recorded-right" {
		t.Fatalf("expected comparison to prefer normalized runtime inputs, got %+v", response.Result.Summary.InputDiff)
	}
}

func TestCompareRunsPrefersRESTRuntimeEnvelopeComparisonWhenAvailable(t *testing.T) {
	response := compareRuns(runComparisonRequest{
		Compare: runComparisonOptions{IncludeDiagnostics: true},
		LeftArtifact: comparableRunArtifactInput{
			ArtifactID: "left-rest-trace",
			Kind:       "run_trace",
			Payload: map[string]any{
				"trace": map[string]any{
					"appName":      "demo",
					"flowId":       "hello",
					"evidenceKind": runTraceEvidenceKindRuntimeBacked,
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"runtimeMode":    runtimeBackedRESTTriggerTraceMode,
						"restTriggerRuntime": map[string]any{
							"kind": "rest",
							"request": map[string]any{
								"method":      "POST",
								"path":        "/hello",
								"headers":     map[string]any{"content-type": "application/json"},
								"queryParams": map[string]any{},
								"pathParams":  map[string]any{},
								"body":        map[string]any{"message": "left"},
							},
							"flowInput": map[string]any{"message": "left"},
							"reply": map[string]any{
								"status":  200,
								"body":    nil,
								"data":    nil,
								"headers": map[string]any{"x-runtime": "left"},
								"cookies": map[string]any{},
							},
							"unavailableFields": []any{},
						},
						"normalizedSteps": []any{
							map[string]any{
								"taskId":          "log-request",
								"status":          "completed",
								"resolvedInputs":  map[string]any{"message": "left"},
								"flowStateAfter":  map[string]any{"message": "left"},
								"producedOutputs": map[string]any{},
								"diagnostics":     []any{},
							},
						},
						"flowStart": map[string]any{"flow_inputs": map[string]any{"message": "left"}},
						"flowDone":  map[string]any{"flow_outputs": map[string]any{"message": ""}},
					},
					"summary": map[string]any{
						"flowId":      "hello",
						"status":      "completed",
						"input":       map[string]any{"message": "left"},
						"output":      map[string]any{"message": ""},
						"stepCount":   1,
						"diagnostics": []any{},
					},
					"steps":       []any{},
					"diagnostics": []any{},
				},
			},
		},
		RightArtifact: comparableRunArtifactInput{
			ArtifactID: "right-rest-replay",
			Kind:       "replay_report",
			Payload: map[string]any{
				"result": map[string]any{
					"summary": map[string]any{
						"flowId":           "hello",
						"status":           "completed",
						"inputSource":      "explicit_input",
						"baseInput":        map[string]any{"message": "right"},
						"effectiveInput":   map[string]any{"message": "right"},
						"overridesApplied": true,
						"diagnostics":      []any{},
					},
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"runtimeMode":    runtimeBackedRESTReplayMode,
						"restTriggerRuntime": map[string]any{
							"kind": "rest",
							"request": map[string]any{
								"method":      "POST",
								"path":        "/hello",
								"headers":     map[string]any{"content-type": "application/json"},
								"queryParams": map[string]any{},
								"pathParams":  map[string]any{},
								"body":        map[string]any{"message": "right"},
							},
							"flowInput": map[string]any{"message": "right"},
							"reply": map[string]any{
								"status":  200,
								"body":    nil,
								"data":    nil,
								"headers": map[string]any{"x-runtime": "right"},
								"cookies": map[string]any{},
							},
							"unavailableFields": []any{},
						},
						"normalizedSteps": []any{
							map[string]any{
								"taskId":          "log-request",
								"status":          "completed",
								"resolvedInputs":  map[string]any{"message": "right"},
								"flowStateAfter":  map[string]any{"message": "right"},
								"producedOutputs": map[string]any{},
								"diagnostics":     []any{},
							},
						},
						"flowStart": map[string]any{"flow_inputs": map[string]any{"message": "right"}},
						"flowDone":  map[string]any{"flow_outputs": map[string]any{"message": ""}},
					},
				},
			},
		},
	})

	if response.Result == nil {
		t.Fatal("expected REST runtime comparison result")
	}
	if response.Result.ComparisonBasis != "rest_runtime_envelope" {
		t.Fatalf("expected REST runtime envelope comparison basis, got %+v", response.Result)
	}
	if response.Result.RestComparison == nil {
		t.Fatal("expected REST comparison metadata")
	}
	if !response.Result.RestComparison.RequestEnvelopeCompared || !response.Result.RestComparison.FlowInputCompared || !response.Result.RestComparison.ReplyEnvelopeCompared {
		t.Fatalf("expected REST comparison to mark compared envelopes, got %+v", response.Result.RestComparison)
	}
	if response.Result.RestComparison.Request == nil || response.Result.RestComparison.Request.BodyDiff.Kind != "changed" {
		t.Fatalf("expected REST request body diff, got %+v", response.Result.RestComparison)
	}
	if response.Result.RestComparison.FlowInputDiff == nil || response.Result.RestComparison.FlowInputDiff.Kind != "changed" {
		t.Fatalf("expected REST mapped flow input diff, got %+v", response.Result.RestComparison)
	}
	if response.Result.RestComparison.Reply == nil || response.Result.RestComparison.Reply.HeadersDiff.Kind != "changed" {
		t.Fatalf("expected REST reply header diff, got %+v", response.Result.RestComparison)
	}
	if !hasDiagnosticCode(response.Result.Summary.DiagnosticDiffs, "flogo.run_comparison.rest_runtime_envelope_preferred") {
		t.Fatalf("expected REST comparison preference diagnostic, got %+v", response.Result.Summary.DiagnosticDiffs)
	}
}

func TestCompareRunsPrefersTimerRuntimeStartupWhenAvailable(t *testing.T) {
	response := compareRuns(runComparisonRequest{
		Compare: runComparisonOptions{IncludeDiagnostics: true},
		LeftArtifact: comparableRunArtifactInput{
			ArtifactID: "left-timer-trace",
			Kind:       "run_trace",
			Payload: map[string]any{
				"trace": map[string]any{
					"appName":      "demo",
					"flowId":       "heartbeat",
					"evidenceKind": runTraceEvidenceKindRuntimeBacked,
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"runtimeMode":    runtimeBackedTimerTriggerTraceMode,
						"timerTriggerRuntime": map[string]any{
							"kind": "timer",
							"settings": map[string]any{
								"runMode":        "once",
								"startDelay":     "1s",
								"repeatInterval": "",
							},
							"flowInput":  map[string]any{},
							"flowOutput": map[string]any{"status": "tick-left"},
							"tick": map[string]any{
								"startedAt": "2026-03-18T00:00:00Z",
								"firedAt":   "2026-03-18T00:00:01Z",
								"tickCount": 1,
							},
							"unavailableFields": []any{"flowInput"},
							"diagnostics":       []any{},
						},
						"steps": []any{map[string]any{"id": "tick-left"}},
					},
					"summary": map[string]any{
						"flowId":      "heartbeat",
						"status":      "completed",
						"input":       map[string]any{},
						"output":      map[string]any{"status": "tick-left"},
						"stepCount":   1,
						"diagnostics": []any{},
					},
					"steps":       []any{},
					"diagnostics": []any{},
				},
			},
		},
		RightArtifact: comparableRunArtifactInput{
			ArtifactID: "right-timer-replay",
			Kind:       "replay_report",
			Payload: map[string]any{
				"result": map[string]any{
					"summary": map[string]any{
						"flowId":           "heartbeat",
						"status":           "completed",
						"inputSource":      "explicit_input",
						"baseInput":        map[string]any{},
						"effectiveInput":   map[string]any{},
						"overridesApplied": false,
						"diagnostics":      []any{},
					},
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"runtimeMode":    runtimeBackedTimerReplayMode,
						"timerTriggerRuntime": map[string]any{
							"kind": "timer",
							"settings": map[string]any{
								"runMode":        "once",
								"startDelay":     "1s",
								"repeatInterval": "",
							},
							"flowInput":  map[string]any{},
							"flowOutput": map[string]any{"status": "tick-right"},
							"tick": map[string]any{
								"startedAt": "2026-03-18T00:00:00Z",
								"firedAt":   "2026-03-18T00:00:02Z",
								"tickCount": 1,
							},
							"unavailableFields": []any{"flowInput"},
							"diagnostics":       []any{},
						},
						"steps": []any{map[string]any{"id": "tick-right"}},
					},
				},
			},
		},
	})

	if response.Result == nil {
		t.Fatal("expected timer runtime comparison result")
	}
	if response.Result.ComparisonBasis != "timer_runtime_startup" {
		t.Fatalf("expected timer runtime comparison basis, got %+v", response.Result)
	}
	if !response.Result.Left.TimerTriggerRuntimeEvidence || !response.Result.Right.TimerTriggerRuntimeEvidence {
		t.Fatalf("expected timer runtime evidence flags on both artifacts, got left=%+v right=%+v", response.Result.Left, response.Result.Right)
	}
	if response.Result.TimerComparison == nil {
		t.Fatal("expected timer comparison metadata")
	}
	if response.Result.TimerComparison.ComparisonBasis != "timer_runtime_startup" {
		t.Fatalf("expected timer comparison basis, got %+v", response.Result.TimerComparison)
	}
	if !response.Result.TimerComparison.SettingsCompared || !response.Result.TimerComparison.FlowInputCompared || !response.Result.TimerComparison.FlowOutputCompared || !response.Result.TimerComparison.TickCompared {
		t.Fatalf("expected timer comparison to mark compared evidence, got %+v", response.Result.TimerComparison)
	}
	if response.Result.TimerComparison.FlowOutputDiff == nil || response.Result.TimerComparison.FlowOutputDiff.Kind != "changed" {
		t.Fatalf("expected timer flow output diff, got %+v", response.Result.TimerComparison)
	}
	if response.Result.TimerComparison.TickDiff == nil || response.Result.TimerComparison.TickDiff.Kind != "changed" {
		t.Fatalf("expected timer tick diff, got %+v", response.Result.TimerComparison)
	}
	if !hasDiagnosticCode(response.Result.Summary.DiagnosticDiffs, "flogo.run_comparison.timer_runtime_startup_preferred") {
		t.Fatalf("expected timer comparison preference diagnostic, got %+v", response.Result.Summary.DiagnosticDiffs)
	}
}

func TestCompareRunsPrefersChannelRuntimeBoundaryComparisonWhenAvailable(t *testing.T) {
	response := compareRuns(runComparisonRequest{
		Compare: runComparisonOptions{IncludeDiagnostics: true},
		LeftArtifact: comparableRunArtifactInput{
			ArtifactID: "left-channel-trace",
			Kind:       "run_trace",
			Payload: map[string]any{
				"trace": map[string]any{
					"appName":      "demo",
					"flowId":       "hello",
					"evidenceKind": runTraceEvidenceKindRuntimeBacked,
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"runtimeMode":    runtimeBackedChannelTriggerTraceMode,
						"channelTriggerRuntime": map[string]any{
							"kind": "channel",
							"data": map[string]any{"message": "left"},
							"flowInput": map[string]any{
								"message": "left",
							},
							"flowOutput":        map[string]any{},
							"unavailableFields": []any{"flowOutput"},
							"handler": map[string]any{
								"channel": "orders",
							},
						},
						"flowStart": map[string]any{
							"flow_inputs": map[string]any{"message": "left"},
						},
						"flowDone": map[string]any{},
					},
					"summary": map[string]any{
						"flowId":      "hello",
						"status":      "completed",
						"input":       map[string]any{"message": "left"},
						"output":      map[string]any{},
						"stepCount":   1,
						"diagnostics": []any{},
					},
					"steps":       []any{},
					"diagnostics": []any{},
				},
			},
		},
		RightArtifact: comparableRunArtifactInput{
			ArtifactID: "right-channel-replay",
			Kind:       "replay_report",
			Payload: map[string]any{
				"result": map[string]any{
					"summary": map[string]any{
						"flowId":           "hello",
						"status":           "completed",
						"inputSource":      "explicit_input",
						"baseInput":        map[string]any{"data": map[string]any{"message": "right"}},
						"effectiveInput":   map[string]any{"data": map[string]any{"message": "right"}},
						"overridesApplied": false,
						"diagnostics":      []any{},
					},
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"runtimeMode":    runtimeBackedChannelReplayMode,
						"channelTriggerRuntime": map[string]any{
							"kind": "channel",
							"data": map[string]any{"message": "right"},
							"flowInput": map[string]any{
								"message": "right",
							},
							"flowOutput":        map[string]any{},
							"unavailableFields": []any{"flowOutput"},
							"handler": map[string]any{
								"channel": "orders",
							},
						},
						"flowStart": map[string]any{
							"flow_inputs": map[string]any{"message": "right"},
						},
						"flowDone": map[string]any{},
					},
				},
			},
		},
	})

	if response.Result == nil {
		t.Fatal("expected run comparison result")
	}
	if response.Result.ComparisonBasis != "channel_runtime_boundary" {
		t.Fatalf("expected channel runtime boundary comparison basis, got %+v", response.Result)
	}
	if response.Result.ChannelComparison == nil || !response.Result.ChannelComparison.ChannelCompared {
		t.Fatalf("expected channel comparison diff, got %+v", response.Result.ChannelComparison)
	}
	if response.Result.ChannelComparison.DataDiff == nil || response.Result.ChannelComparison.FlowInputDiff == nil || response.Result.ChannelComparison.FlowOutputDiff == nil {
		t.Fatalf("expected channel comparison diffs, got %+v", response.Result.ChannelComparison)
	}
	if !hasDiagnosticCode(response.Result.Summary.DiagnosticDiffs, "flogo.run_comparison.channel_runtime_boundary_preferred") {
		t.Fatalf("expected channel comparison preference diagnostic, got %+v", response.Result.Summary.DiagnosticDiffs)
	}
}

func TestCompareRunsPrefersRecorderBackedArtifacts(t *testing.T) {
	response := compareRuns(runComparisonRequest{
		LeftArtifact: comparableRunArtifactInput{
			ArtifactID: "left-trace",
			Kind:       "run_trace",
			Payload: map[string]any{
				"trace": map[string]any{
					"appName":      "demo",
					"flowId":       "hello",
					"evidenceKind": runTraceEvidenceKindRuntimeBacked,
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"recorderKind":   runtimeTraceRecorderKind,
						"recorderMode":   "full",
						"runtimeMode":    runtimeBackedTraceMode,
						"flowStart": map[string]any{
							"flow_inputs": map[string]any{"payload": "recorded-left"},
						},
						"flowDone": map[string]any{
							"flow_outputs": map[string]any{"message": "recorded-left"},
						},
						"steps": []any{
							map[string]any{"id": "step-left"},
						},
					},
					"summary": map[string]any{
						"flowId":      "hello",
						"status":      "completed",
						"input":       map[string]any{"payload": "summary-left"},
						"output":      map[string]any{"message": "summary-left"},
						"stepCount":   0,
						"diagnostics": []any{},
					},
					"steps":       []any{},
					"diagnostics": []any{},
				},
			},
		},
		RightArtifact: comparableRunArtifactInput{
			ArtifactID: "right-replay",
			Kind:       "replay_report",
			Payload: map[string]any{
				"result": map[string]any{
					"summary": map[string]any{
						"flowId":           "hello",
						"status":           "completed",
						"inputSource":      "explicit_input",
						"baseInput":        map[string]any{"payload": "summary-right"},
						"effectiveInput":   map[string]any{"payload": "summary-right"},
						"overridesApplied": false,
						"diagnostics":      []any{},
					},
					"runtimeEvidence": map[string]any{
						"kind":           runTraceEvidenceKindRuntimeBacked,
						"recorderBacked": true,
						"recorderKind":   runtimeTraceRecorderKind,
						"recorderMode":   "full",
						"runtimeMode":    runtimeBackedReplayMode,
						"flowStart": map[string]any{
							"flow_inputs": map[string]any{"payload": "recorded-right"},
						},
						"flowDone": map[string]any{
							"flow_outputs": map[string]any{"message": "recorded-right"},
						},
						"steps": []any{
							map[string]any{"id": "step-right-a"},
							map[string]any{"id": "step-right-b"},
						},
					},
				},
			},
		},
	})

	if response.Result == nil {
		t.Fatal("expected run comparison result")
	}
	if response.Result.ComparisonBasis != "recorder_backed" {
		t.Fatalf("expected recorder-backed comparison basis, got %+v", response.Result)
	}
	if response.Result.Left.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected left evidence kind to be runtime-backed, got %+v", response.Result.Left)
	}
	if response.Result.Right.EvidenceKind != runTraceEvidenceKindRuntimeBacked {
		t.Fatalf("expected right evidence kind to be runtime-backed, got %+v", response.Result.Right)
	}
	if response.Result.Summary.InputDiff.Left == nil || response.Result.Summary.InputDiff.Right == nil {
		t.Fatalf("expected recorder-backed input diff, got %+v", response.Result.Summary.InputDiff)
	}
	leftInput, _ := response.Result.Summary.InputDiff.Left.(map[string]any)
	rightInput, _ := response.Result.Summary.InputDiff.Right.(map[string]any)
	if leftInput["payload"] != "recorded-left" || rightInput["payload"] != "recorded-right" {
		t.Fatalf("expected comparison to prefer recorder-backed inputs, got %+v", response.Result.Summary.InputDiff)
	}
	if response.Result.Summary.StepCountDiff.Right != 2 {
		t.Fatalf("expected comparison to prefer recorder-backed step counts, got %+v", response.Result.Summary.StepCountDiff)
	}
}

func bindableTestApp() flogoApp {
	return flogoApp{
		Name:     "bindable-app",
		Type:     "flogo:app",
		AppModel: "1.1.0",
		Imports: []flogoImport{
			{Alias: "log", Ref: "github.com/project-flogo/contrib/activity/log"},
		},
		Triggers: []flogoTrigger{},
		Resources: []flogoFlow{
			{
				ID:   "hello",
				Name: "hello",
				MetadataInput: []map[string]any{
					{"name": "payload", "required": false},
				},
				MetadataOutput: []map[string]any{
					{"name": "message", "required": false},
				},
				Tasks: []flogoTask{
					{
						ID:          "log",
						Name:        "log",
						ActivityRef: "#log",
						Input: map[string]any{
							"message": "$flow.payload",
						},
						Output: map[string]any{
							"message": "$flow.payload",
						},
						Settings: map[string]any{},
					},
				},
				Links: []map[string]any{},
			},
		},
	}
}

func runtimeBackedTraceTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-trace-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
		},
		"triggers": []any{},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input":  []any{"payload"},
						"output": []any{"message"},
					},
					"tasks": []any{
						map[string]any{
							"id":   "log-request",
							"name": "log-request",
							"activity": map[string]any{
								"ref": "#log",
								"input": map[string]any{
									"message": "=$flow.payload",
								},
							},
						},
					},
				},
			},
		},
	})
}

func runtimeBackedRESTTriggerTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-rest-trigger-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
			map[string]any{
				"alias": "rest",
				"ref":   supportedRuntimeRESTTriggerRef,
			},
		},
		"triggers": []any{
			map[string]any{
				"id":       "rest",
				"ref":      "#rest",
				"settings": map[string]any{"port": 8080},
				"handlers": []any{
					map[string]any{
						"id": "hello-handler",
						"settings": map[string]any{
							"method": "POST",
							"path":   "/hello",
						},
						"action": map[string]any{
							"ref": "flow:hello",
						},
						"input": map[string]any{
							"payload": "=$.queryParams.payload",
						},
						"output": map[string]any{
							"code": 201,
							"data": map[string]any{
								"message": "=$.message",
							},
							"headers": map[string]any{
								"X-Runtime": "rest",
							},
						},
					},
				},
			},
		},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input":  []any{"payload"},
						"output": []any{"message"},
					},
					"tasks": []any{
						map[string]any{
							"id":   "log-request",
							"name": "log-request",
							"activity": map[string]any{
								"ref": "#log",
							},
							"input": map[string]any{
								"message": "=$flow.payload",
							},
							"output": map[string]any{
								"message": "=$flow.payload",
							},
						},
					},
				},
			},
		},
	})
}

func runtimeCLITraceTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-cli-trace-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
			map[string]any{
				"alias": "cli",
				"ref":   supportedRuntimeCLITriggerRef,
			},
		},
		"triggers": []any{
			map[string]any{
				"id":  "cli-hello",
				"ref": supportedRuntimeCLITriggerRef,
				"settings": map[string]any{
					"singleCmd": true,
					"usage":     "say hi",
				},
				"handlers": []any{
					map[string]any{
						"id": "say",
						"settings": map[string]any{
							"usage": "say",
							"short": "say",
							"flags": []any{
								"loud||false||Uppercase output",
							},
						},
						"action": map[string]any{
							"ref": supportedRuntimeFlowActionRef,
							"settings": map[string]any{
								"flowURI": "res://flow:hello",
							},
						},
						"input": map[string]any{
							"args":  "$trigger.args",
							"flags": "$trigger.flags",
						},
						"output": map[string]any{
							"data": "cli-ok",
						},
					},
				},
			},
		},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input": []any{
							map[string]any{"name": "args", "type": "array", "required": false},
							map[string]any{"name": "flags", "type": "object", "required": false},
						},
					},
					"tasks": []any{
						map[string]any{
							"id":   "log-request",
							"name": "log-request",
							"activity": map[string]any{
								"ref": "#log",
								"input": map[string]any{
									"message": "=$flow.args",
								},
							},
						},
					},
				},
			},
		},
	})
}

func runtimeChannelTraceTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-channel-trace-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"channels": []any{
			"orders:5",
		},
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
			map[string]any{
				"alias": "channel",
				"ref":   supportedRuntimeChannelTriggerRef,
			},
		},
		"triggers": []any{
			map[string]any{
				"id":  "channel-orders",
				"ref": supportedRuntimeChannelTriggerRef,
				"handlers": []any{
					map[string]any{
						"id": "receive_orders",
						"settings": map[string]any{
							"channel": "orders",
						},
						"action": map[string]any{
							"ref": supportedRuntimeFlowActionRef,
							"settings": map[string]any{
								"flowURI": "res://flow:hello",
							},
						},
						"input": map[string]any{
							"message": "=$trigger.data",
						},
					},
				},
			},
		},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input": []any{
							map[string]any{"name": "message", "type": "string", "required": true},
						},
					},
					"tasks": []any{
						map[string]any{
							"id":   "log-request",
							"name": "log-request",
							"activity": map[string]any{
								"ref": "#log",
								"input": map[string]any{
									"message": "=$flow.message",
								},
							},
						},
					},
				},
			},
		},
	})
}

func runtimeBackedTimerTraceTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-timer-trace-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
			map[string]any{
				"alias": "timer",
				"ref":   supportedRuntimeTimerTriggerRef,
			},
		},
		"triggers": []any{
			map[string]any{
				"id":  "timer",
				"ref": supportedRuntimeTimerTriggerRef,
				"handlers": []any{
					map[string]any{
						"id": "tick",
						"settings": map[string]any{
							"startDelay": "1s",
						},
						"action": map[string]any{
							"ref": "flow:hello",
						},
					},
				},
			},
		},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"output": []any{
							map[string]any{"name": "message", "required": false},
						},
					},
					"tasks": []any{
						map[string]any{
							"id":   "log-request",
							"name": "log-request",
							"activity": map[string]any{
								"ref": "#log",
								"input": map[string]any{
									"message": "timer-fired",
								},
							},
						},
					},
				},
			},
		},
	})
}

func unsupportedRESTTriggerFallbackTestApp() flogoApp {
	app := runtimeBackedRESTTriggerTestApp()
	app.Triggers[0].Handlers[0].Settings["method"] = "GET"
	return app
}

func unsupportedCLITriggerFallbackTestApp() flogoApp {
	app := runtimeCLITraceTestApp()
	app.Triggers[0].Handlers[0].Input = map[string]any{
		"args":  "$trigger.args",
		"flags": "$env.cliFlags",
	}
	if triggers, ok := app.Raw["triggers"].([]any); ok && len(triggers) > 0 {
		if trigger, ok := triggers[0].(map[string]any); ok {
			if handlers, ok := trigger["handlers"].([]any); ok && len(handlers) > 0 {
				if handler, ok := handlers[0].(map[string]any); ok {
					handler["input"] = map[string]any{
						"args":  "$trigger.args",
						"flags": "$env.cliFlags",
					}
				}
			}
		}
	}
	return app
}

func unsupportedChannelTriggerFallbackTestApp() flogoApp {
	app := runtimeChannelTraceTestApp()
	app.Triggers[0].Handlers[0].Settings["channel"] = "missing"
	if triggers, ok := app.Raw["triggers"].([]any); ok && len(triggers) > 0 {
		if trigger, ok := triggers[0].(map[string]any); ok {
			if handlers, ok := trigger["handlers"].([]any); ok && len(handlers) > 0 {
				if handler, ok := handlers[0].(map[string]any); ok {
					if settings, ok := handler["settings"].(map[string]any); ok {
						settings["channel"] = "missing"
					}
				}
			}
		}
	}
	return app
}

func unsupportedTimerTriggerFallbackTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-timer-fallback-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
			map[string]any{
				"alias": "timer",
				"ref":   supportedRuntimeTimerTriggerRef,
			},
		},
		"triggers": []any{
			map[string]any{
				"id":  "timer",
				"ref": supportedRuntimeTimerTriggerRef,
				"handlers": []any{
					map[string]any{
						"id": "tick",
						"settings": map[string]any{
							"repeatInterval": "1s",
						},
						"action": map[string]any{
							"ref": "flow:hello",
						},
					},
				},
			},
		},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input":  []any{"payload"},
						"output": []any{"message"},
					},
					"tasks": []any{
						map[string]any{
							"id":   "log-request",
							"name": "log-request",
							"activity": map[string]any{
								"ref": "#log",
								"input": map[string]any{
									"message": "=$flow.payload",
								},
							},
							"output": map[string]any{
								"message": "=$flow.payload",
							},
						},
					},
				},
			},
		},
	})
}

func runtimeFallbackTraceTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-fallback-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
		},
		"triggers": []any{},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input": []any{"payload"},
					},
					"tasks": []any{
						map[string]any{
							"id":   "loop-task",
							"name": "loop-task",
							"type": "iterator",
							"activity": map[string]any{
								"ref": "#log",
								"input": map[string]any{
									"message": "=$flow.payload",
								},
							},
						},
					},
				},
			},
		},
	})
}

func runtimeRestTraceTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-rest-trace-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
			map[string]any{
				"alias": "rest",
				"ref":   supportedRuntimeRESTTriggerRef,
			},
		},
		"triggers": []any{
			map[string]any{
				"id":  "rest-hello",
				"ref": supportedRuntimeRESTTriggerRef,
				"settings": map[string]any{
					"port": float64(0),
				},
				"handlers": []any{
					map[string]any{
						"id": "hello_handler",
						"settings": map[string]any{
							"method": "POST",
							"path":   "/hello",
						},
						"action": map[string]any{
							"ref": supportedRuntimeFlowActionRef,
							"settings": map[string]any{
								"flowURI": "res://flow:hello",
							},
						},
						"input": map[string]any{
							"message": "=$trigger.content.message",
						},
						"output": map[string]any{
							"code": 200,
							"data": "=$flow.message",
						},
					},
				},
			},
		},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input": []any{
							map[string]any{"name": "message", "type": "string", "required": true},
						},
						"output": []any{
							map[string]any{"name": "message", "type": "string", "required": true},
						},
					},
					"tasks": []any{
						map[string]any{
							"id":   "log-request",
							"name": "log-request",
							"activity": map[string]any{
								"ref": "#log",
								"input": map[string]any{
									"message": "=$flow.message",
								},
							},
						},
					},
				},
			},
		},
	})
}

func runHelperTraceCLI(t *testing.T, app flogoApp, request runTraceRequest) runTraceResponse {
	t.Helper()

	helperDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("expected helper working directory, got %v", err)
	}

	tempDir := t.TempDir()
	appPath := filepath.Join(tempDir, "app.json")
	requestPath := filepath.Join(tempDir, "request.json")

	appDocument := cloneStringAnyMap(app.Raw)
	if len(appDocument) == 0 {
		t.Fatal("expected canonical raw app document for helper CLI test")
	}

	appBytes, err := json.Marshal(appDocument)
	if err != nil {
		t.Fatalf("expected app document to marshal, got %v", err)
	}
	requestBytes, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("expected request to marshal, got %v", err)
	}
	if err := os.WriteFile(appPath, appBytes, 0o600); err != nil {
		t.Fatalf("expected app document to be written, got %v", err)
	}
	if err := os.WriteFile(requestPath, requestBytes, 0o600); err != nil {
		t.Fatalf("expected request document to be written, got %v", err)
	}

	cmd := exec.Command("go", "run", ".", "flows", "trace", "--app", appPath, "--request", requestPath)
	cmd.Dir = helperDir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	stdout, err := cmd.Output()
	if err != nil {
		t.Fatalf("expected helper CLI trace to succeed, got %v stderr=%s", err, strings.TrimSpace(stderr.String()))
	}

	var response runTraceResponse
	if err := json.Unmarshal(stdout, &response); err != nil {
		t.Fatalf("expected helper CLI trace JSON output, got %v stdout=%s stderr=%s", err, strings.TrimSpace(string(stdout)), strings.TrimSpace(stderr.String()))
	}
	return response
}

func runHelperReplayCLI(t *testing.T, app flogoApp, request replayRequest) replayResponse {
	t.Helper()

	helperDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("expected helper working directory, got %v", err)
	}

	tempDir := t.TempDir()
	appPath := filepath.Join(tempDir, "app.json")
	requestPath := filepath.Join(tempDir, "request.json")

	appDocument := cloneStringAnyMap(app.Raw)
	if len(appDocument) == 0 {
		t.Fatal("expected canonical raw app document for helper CLI replay test")
	}

	appBytes, err := json.Marshal(appDocument)
	if err != nil {
		t.Fatalf("expected app document to marshal, got %v", err)
	}
	requestBytes, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("expected replay request to marshal, got %v", err)
	}
	if err := os.WriteFile(appPath, appBytes, 0o600); err != nil {
		t.Fatalf("expected app document to be written, got %v", err)
	}
	if err := os.WriteFile(requestPath, requestBytes, 0o600); err != nil {
		t.Fatalf("expected replay request document to be written, got %v", err)
	}

	cmd := exec.Command("go", "run", ".", "flows", "replay", "--app", appPath, "--request", requestPath)
	cmd.Dir = helperDir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	stdout, err := cmd.Output()
	if err != nil {
		t.Fatalf("expected helper CLI replay to succeed, got %v stderr=%s", err, strings.TrimSpace(stderr.String()))
	}

	var response replayResponse
	if err := json.Unmarshal(stdout, &response); err != nil {
		t.Fatalf("expected helper CLI replay JSON output, got %v stdout=%s stderr=%s", err, strings.TrimSpace(string(stdout)), strings.TrimSpace(stderr.String()))
	}
	return response
}

func runtimeRestFallbackTraceTestApp() flogoApp {
	return normalizeApp(map[string]any{
		"name":     "runtime-rest-trace-app",
		"type":     "flogo:app",
		"appModel": "1.1.0",
		"imports": []any{
			map[string]any{
				"alias": "log",
				"ref":   supportedRuntimeLogActivityRef,
			},
			map[string]any{
				"alias": "rest",
				"ref":   supportedRuntimeRESTTriggerRef,
			},
		},
		"triggers": []any{
			map[string]any{
				"id":  "rest-hello",
				"ref": supportedRuntimeRESTTriggerRef,
				"settings": map[string]any{
					"port": float64(0),
				},
				"handlers": []any{
					map[string]any{
						"id": "hello_handler",
						"settings": map[string]any{
							"method": "POST",
							"path":   "/hello",
						},
						"action": map[string]any{
							"ref": supportedRuntimeFlowActionRef,
							"settings": map[string]any{
								"flowURI": "res://flow:hello",
							},
						},
						"input": map[string]any{
							"message": "=$trigger.content.message",
						},
						"output": map[string]any{
							"code": 200,
							"data": "=$flow.message",
						},
					},
				},
			},
		},
		"resources": map[string]any{
			"hello": map[string]any{
				"type": "flow",
				"data": map[string]any{
					"metadata": map[string]any{
						"input": []any{
							map[string]any{"name": "message", "type": "string", "required": true},
						},
						"output": []any{
							map[string]any{"name": "message", "type": "string", "required": true},
						},
					},
					"tasks": []any{
						map[string]any{
							"id":   "loop-task",
							"name": "loop-task",
							"type": "iterator",
							"activity": map[string]any{
								"ref": "#log",
							},
							"input": map[string]any{
								"message": "=$flow.message",
							},
						},
					},
				},
			},
		},
	})
}

func hasDiagnosticCode(diagnostics []diagnostic, code string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	return false
}

func taskEventHasInput(events []map[string]any, key string, expected any) bool {
	for _, event := range events {
		input, ok := event["input"].(map[string]any)
		if !ok {
			continue
		}
		if input[key] == expected {
			return true
		}
	}
	return false
}

func diagnosticHasUnavailableField(diagnostics []diagnostic, field string) bool {
	for _, item := range diagnostics {
		details := item.Details
		if len(details) == 0 {
			continue
		}
		rawFields, ok := details["unavailableFields"].([]any)
		if ok {
			for _, rawField := range rawFields {
				if stringValue(rawField) == field {
					return true
				}
			}
		}
		if fields, ok := details["unavailableFields"].([]string); ok && containsString(fields, field) {
			return true
		}
	}
	return false
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func extractionValidationTestApp() flogoApp {
	app := bindableTestApp()
	app.Resources = []flogoFlow{
		{
			ID:   "orchestrate",
			Name: "orchestrate",
			Tasks: []flogoTask{
				{
					ID:          "prepare",
					Name:        "prepare",
					ActivityRef: "#log",
					Input: map[string]any{
						"message": "$flow.payload",
					},
					Output: map[string]any{
						"result": "$flow.payload",
					},
					Settings: map[string]any{},
				},
				{
					ID:          "work",
					Name:        "work",
					ActivityRef: "#log",
					Input: map[string]any{
						"message": "$activity[prepare].result",
					},
					Output: map[string]any{
						"message": "$activity[prepare].result",
					},
					Settings: map[string]any{},
				},
				{
					ID:          "finish",
					Name:        "finish",
					ActivityRef: "#log",
					Input: map[string]any{
						"message": "$activity[prepare].result",
					},
					Output:   map[string]any{},
					Settings: map[string]any{},
				},
			},
			Links: []map[string]any{},
		},
	}
	return app
}

func inliningValidationTestApp() flogoApp {
	app := bindableTestApp()
	app.Resources = []flogoFlow{
		{
			ID:   "child",
			Name: "child",
			Tasks: []flogoTask{
				{
					ID:          "step1",
					Name:        "step1",
					ActivityRef: "#log",
					Input: map[string]any{
						"message": "$flow.payload",
					},
					Output: map[string]any{
						"message": "$flow.payload",
					},
					Settings: map[string]any{},
				},
				{
					ID:          "step2",
					Name:        "step2",
					ActivityRef: "#log",
					Input: map[string]any{
						"message": "$activity[step1].message",
					},
					Output:   map[string]any{},
					Settings: map[string]any{},
				},
			},
			Links: []map[string]any{},
		},
		{
			ID:   "orchestrate",
			Name: "orchestrate",
			Tasks: []flogoTask{
				{
					ID:          "invoke_child",
					Name:        "invoke child",
					ActivityRef: "#flow",
					Input: map[string]any{
						"payload": "$flow.payload",
					},
					Output: map[string]any{
						"message": "$activity[invoke_child].message",
					},
					Settings: map[string]any{
						"flowURI": "res://flow:child",
					},
				},
				{
					ID:          "finish",
					Name:        "finish",
					ActivityRef: "#log",
					Input: map[string]any{
						"message": "$flow.payload",
					},
					Output:   map[string]any{},
					Settings: map[string]any{},
				},
			},
			Links: []map[string]any{},
		},
	}
	return app
}

func controlFlowValidationTestApp() flogoApp {
	app := bindableTestApp()
	app.Resources[0].Tasks = append(app.Resources[0].Tasks, flogoTask{
		ID:          "broken",
		Name:        "broken",
		ActivityRef: "#missing",
		Input:       map[string]any{},
		Output:      map[string]any{},
		Settings:    map[string]any{},
	})
	return app
}

func generatedFileKindsInclude(files []generatedContribFile, expectedKinds ...string) bool {
	seen := map[string]bool{}
	for _, file := range files {
		seen[file.Kind] = true
	}
	for _, kind := range expectedKinds {
		if !seen[kind] {
			return false
		}
	}
	return true
}

func generatedFileContent(files []generatedContribFile, kind string) string {
	for _, file := range files {
		if file.Kind == kind {
			return file.Content
		}
	}
	return ""
}
