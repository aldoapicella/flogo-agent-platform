package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/project-flogo/contrib/activity/log"
	_ "github.com/project-flogo/contrib/trigger/channel"
	clicontrib "github.com/project-flogo/contrib/trigger/cli"
	_ "github.com/project-flogo/contrib/trigger/rest"
	_ "github.com/project-flogo/contrib/trigger/timer"
	coreaction "github.com/project-flogo/core/action"
	coreapp "github.com/project-flogo/core/app"
	coreresource "github.com/project-flogo/core/app/resource"
	coreengine "github.com/project-flogo/core/engine"
	corechannels "github.com/project-flogo/core/engine/channels"
	coreevent "github.com/project-flogo/core/engine/event"
	corerunner "github.com/project-flogo/core/engine/runner"
	"github.com/project-flogo/core/support"
	coreservice "github.com/project-flogo/core/support/service"
	coretrigger "github.com/project-flogo/core/trigger"
	"github.com/project-flogo/flow"
	flowstate "github.com/project-flogo/flow/state"
	flowevent "github.com/project-flogo/flow/support/event"
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
	HandlerSettings    []contribField   `json:"handlerSettings,omitempty"`
	Inputs             []contribField   `json:"inputs"`
	Outputs            []contribField   `json:"outputs"`
	Reply              []contribField   `json:"reply,omitempty"`
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

type flowParam struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Source      string `json:"source"`
	Description string `json:"description,omitempty"`
}

type flowUsage struct {
	FlowID      string   `json:"flowId"`
	HandlerRefs []string `json:"handlerRefs"`
	TriggerRefs []string `json:"triggerRefs"`
	ActionRefs  []string `json:"actionRefs"`
	UsedByCount int      `json:"usedByCount"`
}

type flowContract struct {
	FlowID        string       `json:"flowId"`
	Name          string       `json:"name"`
	ResourceRef   string       `json:"resourceRef"`
	Inputs        []flowParam  `json:"inputs"`
	Outputs       []flowParam  `json:"outputs"`
	Reusable      bool         `json:"reusable"`
	Usage         flowUsage    `json:"usage"`
	Diagnostics   []diagnostic `json:"diagnostics"`
	EvidenceLevel string       `json:"evidenceLevel"`
}

type flowContracts struct {
	AppName     string         `json:"appName"`
	Contracts   []flowContract `json:"contracts"`
	Diagnostics []diagnostic   `json:"diagnostics"`
}

type flowContractsResponse struct {
	Contracts flowContracts `json:"contracts"`
}

type validationStageResult struct {
	Stage       string       `json:"stage"`
	Ok          bool         `json:"ok"`
	Diagnostics []diagnostic `json:"diagnostics"`
}

type validationReport struct {
	Ok        bool                    `json:"ok"`
	Stages    []validationStageResult `json:"stages"`
	Summary   string                  `json:"summary"`
	Artifacts []map[string]any        `json:"artifacts"`
}

type activityScaffoldRequest struct {
	ActivityName string         `json:"activityName"`
	ModulePath   string         `json:"modulePath"`
	PackageName  string         `json:"packageName,omitempty"`
	Title        string         `json:"title"`
	Description  string         `json:"description"`
	Version      string         `json:"version"`
	Homepage     string         `json:"homepage,omitempty"`
	Settings     []contribField `json:"settings"`
	Inputs       []contribField `json:"inputs"`
	Outputs      []contribField `json:"outputs"`
	Usage        string         `json:"usage,omitempty"`
}

type triggerScaffoldRequest struct {
	TriggerName     string         `json:"triggerName"`
	ModulePath      string         `json:"modulePath"`
	PackageName     string         `json:"packageName,omitempty"`
	Title           string         `json:"title"`
	Description     string         `json:"description"`
	Version         string         `json:"version"`
	Homepage        string         `json:"homepage,omitempty"`
	Settings        []contribField `json:"settings"`
	HandlerSettings []contribField `json:"handlerSettings"`
	Outputs         []contribField `json:"outputs"`
	Replies         []contribField `json:"replies"`
	Usage           string         `json:"usage,omitempty"`
}

type generatedContribFile struct {
	Path    string `json:"path"`
	Kind    string `json:"kind"`
	Bytes   int    `json:"bytes"`
	Content string `json:"content,omitempty"`
}

type contribProofStep struct {
	Kind     string   `json:"kind"`
	Ok       bool     `json:"ok"`
	Command  []string `json:"command"`
	ExitCode int      `json:"exitCode"`
	Summary  string   `json:"summary"`
	Output   string   `json:"output"`
}

type activityScaffoldBundle struct {
	Kind        string                 `json:"kind"`
	ModulePath  string                 `json:"modulePath"`
	PackageName string                 `json:"packageName"`
	BundleRoot  string                 `json:"bundleRoot"`
	Descriptor  contribDescriptor      `json:"descriptor"`
	Files       []generatedContribFile `json:"files"`
	ReadmePath  string                 `json:"readmePath,omitempty"`
}

type activityScaffoldResult struct {
	Bundle     activityScaffoldBundle `json:"bundle"`
	Validation validationReport       `json:"validation"`
	Build      contribProofStep       `json:"build"`
	Test       contribProofStep       `json:"test"`
}

type activityScaffoldResponse struct {
	Result activityScaffoldResult `json:"result"`
}

type triggerScaffoldBundle struct {
	Kind        string                 `json:"kind"`
	ModulePath  string                 `json:"modulePath"`
	PackageName string                 `json:"packageName"`
	BundleRoot  string                 `json:"bundleRoot"`
	Descriptor  contribDescriptor      `json:"descriptor"`
	Files       []generatedContribFile `json:"files"`
	ReadmePath  string                 `json:"readmePath,omitempty"`
}

type triggerScaffoldResult struct {
	Bundle     triggerScaffoldBundle `json:"bundle"`
	Validation validationReport      `json:"validation"`
	Build      contribProofStep      `json:"build"`
	Test       contribProofStep      `json:"test"`
}

type triggerScaffoldResponse struct {
	Result triggerScaffoldResult `json:"result"`
}

type runTraceCaptureOptions struct {
	IncludeFlowState       bool `json:"includeFlowState"`
	IncludeActivityOutputs bool `json:"includeActivityOutputs"`
	IncludeTaskInputs      bool `json:"includeTaskInputs"`
	IncludeTaskOutputs     bool `json:"includeTaskOutputs"`
}

type runTraceRequest struct {
	FlowID       string                 `json:"flowId"`
	SampleInput  map[string]any         `json:"sampleInput"`
	Capture      runTraceCaptureOptions `json:"capture"`
	ValidateOnly bool                   `json:"validateOnly"`
}

type runTraceTaskStep struct {
	TaskID        string         `json:"taskId"`
	TaskName      string         `json:"taskName,omitempty"`
	ActivityRef   string         `json:"activityRef,omitempty"`
	Type          string         `json:"type,omitempty"`
	Status        string         `json:"status"`
	Input         map[string]any `json:"input,omitempty"`
	Output        map[string]any `json:"output,omitempty"`
	FlowState     map[string]any `json:"flowState,omitempty"`
	ActivityState map[string]any `json:"activityState,omitempty"`
	Error         string         `json:"error,omitempty"`
	StartedAt     string         `json:"startedAt,omitempty"`
	FinishedAt    string         `json:"finishedAt,omitempty"`
	Diagnostics   []diagnostic   `json:"diagnostics"`
}

type runTraceSummary struct {
	FlowID      string         `json:"flowId"`
	Status      string         `json:"status"`
	Input       map[string]any `json:"input"`
	Output      map[string]any `json:"output,omitempty"`
	Error       string         `json:"error,omitempty"`
	StepCount   int            `json:"stepCount"`
	Diagnostics []diagnostic   `json:"diagnostics"`
}

type runtimeEvidence struct {
	Kind                  string                         `json:"kind"`
	RecorderBacked        bool                           `json:"recorderBacked,omitempty"`
	RecorderKind          string                         `json:"recorderKind,omitempty"`
	RecorderMode          string                         `json:"recorderMode,omitempty"`
	RuntimeMode           string                         `json:"runtimeMode,omitempty"`
	FallbackReason        string                         `json:"fallbackReason,omitempty"`
	FlowStart             map[string]any                 `json:"flowStart,omitempty"`
	FlowDone              map[string]any                 `json:"flowDone,omitempty"`
	Snapshots             []map[string]any               `json:"snapshots,omitempty"`
	Steps                 []map[string]any               `json:"steps,omitempty"`
	TaskEvents            []map[string]any               `json:"taskEvents,omitempty"`
	NormalizedSteps       []runtimeNormalizedStep        `json:"normalizedSteps,omitempty"`
	RestTriggerRuntime    *restTriggerRuntimeEvidence    `json:"restTriggerRuntime,omitempty"`
	CLITriggerRuntime     *cliTriggerRuntimeEvidence     `json:"cliTriggerRuntime,omitempty"`
	TimerTriggerRuntime   *timerTriggerRuntimeEvidence   `json:"timerTriggerRuntime,omitempty"`
	ChannelTriggerRuntime *channelTriggerRuntimeEvidence `json:"channelTriggerRuntime,omitempty"`
}

type restTriggerRuntimeRequestEvidence struct {
	Method      string         `json:"method,omitempty"`
	Path        string         `json:"path,omitempty"`
	Headers     map[string]any `json:"headers,omitempty"`
	QueryParams map[string]any `json:"queryParams,omitempty"`
	PathParams  map[string]any `json:"pathParams,omitempty"`
	Body        any            `json:"body,omitempty"`
	Content     any            `json:"content,omitempty"`
}

type restTriggerRuntimeReplyEvidence struct {
	Status  int            `json:"status,omitempty"`
	Headers map[string]any `json:"headers,omitempty"`
	Body    any            `json:"body,omitempty"`
	Data    any            `json:"data,omitempty"`
	Cookies map[string]any `json:"cookies,omitempty"`
}

type restTriggerRuntimeMappingEvidence struct {
	RequestMappingMode string         `json:"requestMappingMode,omitempty"`
	ReplyMappingMode   string         `json:"replyMappingMode,omitempty"`
	MappedFlowInput    map[string]any `json:"mappedFlowInput,omitempty"`
	MappedFlowOutput   map[string]any `json:"mappedFlowOutput,omitempty"`
	RequestMappings    map[string]any `json:"requestMappings,omitempty"`
	ReplyMappings      map[string]any `json:"replyMappings,omitempty"`
	UnavailableFields  []string       `json:"unavailableFields,omitempty"`
	Diagnostics        []diagnostic   `json:"diagnostics,omitempty"`
}

type restTriggerRuntimeEvidence struct {
	Kind              string                             `json:"kind"`
	Request           *restTriggerRuntimeRequestEvidence `json:"request,omitempty"`
	FlowInput         map[string]any                     `json:"flowInput,omitempty"`
	FlowOutput        map[string]any                     `json:"flowOutput,omitempty"`
	Reply             *restTriggerRuntimeReplyEvidence   `json:"reply,omitempty"`
	Mapping           *restTriggerRuntimeMappingEvidence `json:"mapping,omitempty"`
	UnavailableFields []string                           `json:"unavailableFields,omitempty"`
	Diagnostics       []diagnostic                       `json:"diagnostics,omitempty"`
}

type timerTriggerRuntimeSettingsEvidence struct {
	RunMode        string `json:"runMode,omitempty"`
	StartDelay     string `json:"startDelay,omitempty"`
	RepeatInterval string `json:"repeatInterval,omitempty"`
}

type timerTriggerRuntimeTickEvidence struct {
	StartedAt string `json:"startedAt,omitempty"`
	FiredAt   string `json:"firedAt,omitempty"`
	TickCount int    `json:"tickCount,omitempty"`
}

type timerTriggerRuntimeEvidence struct {
	Kind              string                               `json:"kind"`
	Settings          *timerTriggerRuntimeSettingsEvidence `json:"settings,omitempty"`
	FlowInput         map[string]any                       `json:"flowInput,omitempty"`
	FlowOutput        map[string]any                       `json:"flowOutput,omitempty"`
	Tick              *timerTriggerRuntimeTickEvidence     `json:"tick,omitempty"`
	UnavailableFields []string                             `json:"unavailableFields,omitempty"`
	Diagnostics       []diagnostic                         `json:"diagnostics,omitempty"`
}

type cliTriggerRuntimeSettingsEvidence struct {
	SingleCmd bool   `json:"singleCmd,omitempty"`
	Usage     string `json:"usage,omitempty"`
	Long      string `json:"long,omitempty"`
}

type cliTriggerRuntimeHandlerEvidence struct {
	Command string   `json:"command,omitempty"`
	Usage   string   `json:"usage,omitempty"`
	Short   string   `json:"short,omitempty"`
	Long    string   `json:"long,omitempty"`
	Flags   []string `json:"flags,omitempty"`
}

type cliTriggerRuntimeReplyEvidence struct {
	Data   any    `json:"data,omitempty"`
	Stdout string `json:"stdout,omitempty"`
}

type cliTriggerRuntimeEvidence struct {
	Kind              string                             `json:"kind"`
	Settings          *cliTriggerRuntimeSettingsEvidence `json:"settings,omitempty"`
	Handler           *cliTriggerRuntimeHandlerEvidence  `json:"handler,omitempty"`
	Args              []string                           `json:"args,omitempty"`
	Flags             map[string]any                     `json:"flags,omitempty"`
	FlowInput         map[string]any                     `json:"flowInput,omitempty"`
	FlowOutput        map[string]any                     `json:"flowOutput,omitempty"`
	Reply             *cliTriggerRuntimeReplyEvidence    `json:"reply,omitempty"`
	UnavailableFields []string                           `json:"unavailableFields,omitempty"`
	Diagnostics       []diagnostic                       `json:"diagnostics,omitempty"`
}

type channelTriggerRuntimeSettingsEvidence struct {
	Channels []string `json:"channels,omitempty"`
}

type channelTriggerRuntimeHandlerEvidence struct {
	Name       string `json:"name,omitempty"`
	Channel    string `json:"channel,omitempty"`
	BufferSize int    `json:"bufferSize,omitempty"`
}

type channelTriggerRuntimeEvidence struct {
	Kind              string                                 `json:"kind"`
	Settings          *channelTriggerRuntimeSettingsEvidence `json:"settings,omitempty"`
	Handler           *channelTriggerRuntimeHandlerEvidence  `json:"handler,omitempty"`
	Data              any                                    `json:"data,omitempty"`
	FlowInput         map[string]any                         `json:"flowInput,omitempty"`
	FlowOutput        map[string]any                         `json:"flowOutput,omitempty"`
	UnavailableFields []string                               `json:"unavailableFields,omitempty"`
	Diagnostics       []diagnostic                           `json:"diagnostics,omitempty"`
}

type runtimeNormalizedStep struct {
	TaskID                 string              `json:"taskId"`
	TaskName               string              `json:"taskName,omitempty"`
	ActivityRef            string              `json:"activityRef,omitempty"`
	Type                   string              `json:"type,omitempty"`
	Status                 string              `json:"status"`
	Error                  string              `json:"error,omitempty"`
	StartedAt              string              `json:"startedAt,omitempty"`
	FinishedAt             string              `json:"finishedAt,omitempty"`
	DeclaredInputMappings  map[string]any      `json:"declaredInputMappings,omitempty"`
	DeclaredOutputMappings map[string]any      `json:"declaredOutputMappings,omitempty"`
	ResolvedInputs         map[string]any      `json:"resolvedInputs,omitempty"`
	ProducedOutputs        map[string]any      `json:"producedOutputs,omitempty"`
	FlowStateBefore        map[string]any      `json:"flowStateBefore,omitempty"`
	FlowStateAfter         map[string]any      `json:"flowStateAfter,omitempty"`
	StateDelta             map[string]any      `json:"stateDelta,omitempty"`
	EvidenceSource         map[string][]string `json:"evidenceSource,omitempty"`
	UnavailableFields      []string            `json:"unavailableFields,omitempty"`
	Diagnostics            []diagnostic        `json:"diagnostics,omitempty"`
}

type runtimeTraceRecorderEvidence struct {
	RecordingMode string           `json:"recordingMode,omitempty"`
	Start         map[string]any   `json:"start,omitempty"`
	Snapshots     []map[string]any `json:"snapshots,omitempty"`
	Steps         []map[string]any `json:"steps,omitempty"`
	Done          map[string]any   `json:"done,omitempty"`
}

type runTrace struct {
	AppName         string             `json:"appName"`
	FlowID          string             `json:"flowId"`
	EvidenceKind    string             `json:"evidenceKind,omitempty"`
	RuntimeEvidence *runtimeEvidence   `json:"runtimeEvidence,omitempty"`
	Summary         runTraceSummary    `json:"summary"`
	Steps           []runTraceTaskStep `json:"steps"`
	Diagnostics     []diagnostic       `json:"diagnostics"`
}

type runTraceResponse struct {
	Trace      *runTrace         `json:"trace,omitempty"`
	Validation *validationReport `json:"validation,omitempty"`
}

type replayRequest struct {
	FlowID          string                 `json:"flowId"`
	TraceArtifactID string                 `json:"traceArtifactId,omitempty"`
	BaseInput       map[string]any         `json:"baseInput,omitempty"`
	Overrides       map[string]any         `json:"overrides,omitempty"`
	Capture         runTraceCaptureOptions `json:"capture"`
	ValidateOnly    bool                   `json:"validateOnly"`
}

type replaySummary struct {
	FlowID           string         `json:"flowId"`
	Status           string         `json:"status"`
	InputSource      string         `json:"inputSource"`
	BaseInput        map[string]any `json:"baseInput"`
	EffectiveInput   map[string]any `json:"effectiveInput"`
	OverridesApplied bool           `json:"overridesApplied"`
	Diagnostics      []diagnostic   `json:"diagnostics"`
}

type replayResult struct {
	Summary         replaySummary     `json:"summary"`
	Trace           *runTrace         `json:"trace,omitempty"`
	RuntimeEvidence *runtimeEvidence  `json:"runtimeEvidence,omitempty"`
	Validation      *validationReport `json:"validation,omitempty"`
}

type replayResponse struct {
	Result replayResult `json:"result"`
}

type runComparisonOptions struct {
	IncludeStepInputs    bool `json:"includeStepInputs"`
	IncludeStepOutputs   bool `json:"includeStepOutputs"`
	IncludeFlowState     bool `json:"includeFlowState"`
	IncludeActivityState bool `json:"includeActivityState"`
	IncludeDiagnostics   bool `json:"includeDiagnostics"`
}

type comparableRunArtifactInput struct {
	ArtifactID string         `json:"artifactId"`
	Kind       string         `json:"kind"`
	Payload    map[string]any `json:"payload"`
}

type runComparisonRequest struct {
	LeftArtifact  comparableRunArtifactInput `json:"leftArtifact"`
	RightArtifact comparableRunArtifactInput `json:"rightArtifact"`
	Compare       runComparisonOptions       `json:"compare"`
	ValidateOnly  bool                       `json:"validateOnly"`
}

type runComparisonArtifactRef struct {
	ArtifactID                    string `json:"artifactId"`
	Kind                          string `json:"kind"`
	SummaryStatus                 string `json:"summaryStatus"`
	FlowID                        string `json:"flowId"`
	EvidenceKind                  string `json:"evidenceKind,omitempty"`
	NormalizedStepEvidence        bool   `json:"normalizedStepEvidence,omitempty"`
	RestTriggerRuntimeEvidence    bool   `json:"restTriggerRuntimeEvidence,omitempty"`
	RestTriggerRuntimeKind        string `json:"restTriggerRuntimeKind,omitempty"`
	CLITriggerRuntimeEvidence     bool   `json:"cliTriggerRuntimeEvidence,omitempty"`
	CLITriggerRuntimeKind         string `json:"cliTriggerRuntimeKind,omitempty"`
	TimerTriggerRuntimeEvidence   bool   `json:"timerTriggerRuntimeEvidence,omitempty"`
	TimerTriggerRuntimeKind       string `json:"timerTriggerRuntimeKind,omitempty"`
	ChannelTriggerRuntimeEvidence bool   `json:"channelTriggerRuntimeEvidence,omitempty"`
	ChannelTriggerRuntimeKind     string `json:"channelTriggerRuntimeKind,omitempty"`
	ChannelTriggerRuntimeChannel  string `json:"channelTriggerRuntimeChannel,omitempty"`
	ComparisonBasisPreference     string `json:"comparisonBasisPreference,omitempty"`
}

type runComparisonValueDiff struct {
	Kind  string `json:"kind"`
	Left  any    `json:"left,omitempty"`
	Right any    `json:"right,omitempty"`
}

type runComparisonStepDiff struct {
	TaskID            string                  `json:"taskId"`
	LeftStatus        string                  `json:"leftStatus,omitempty"`
	RightStatus       string                  `json:"rightStatus,omitempty"`
	InputDiff         *runComparisonValueDiff `json:"inputDiff,omitempty"`
	OutputDiff        *runComparisonValueDiff `json:"outputDiff,omitempty"`
	FlowStateDiff     *runComparisonValueDiff `json:"flowStateDiff,omitempty"`
	ActivityStateDiff *runComparisonValueDiff `json:"activityStateDiff,omitempty"`
	DiagnosticDiffs   []diagnostic            `json:"diagnosticDiffs"`
	ChangeKind        string                  `json:"changeKind"`
}

type runComparisonSummaryDiff struct {
	StatusChanged   bool                   `json:"statusChanged"`
	InputDiff       runComparisonValueDiff `json:"inputDiff"`
	OutputDiff      runComparisonValueDiff `json:"outputDiff"`
	ErrorDiff       runComparisonValueDiff `json:"errorDiff"`
	StepCountDiff   runComparisonValueDiff `json:"stepCountDiff"`
	DiagnosticDiffs []diagnostic           `json:"diagnosticDiffs"`
}

type runComparisonRESTRequestDiff struct {
	MethodDiff      runComparisonValueDiff `json:"methodDiff"`
	PathDiff        runComparisonValueDiff `json:"pathDiff"`
	QueryParamsDiff runComparisonValueDiff `json:"queryParamsDiff"`
	HeadersDiff     runComparisonValueDiff `json:"headersDiff"`
	BodyDiff        runComparisonValueDiff `json:"bodyDiff"`
	PathParamsDiff  runComparisonValueDiff `json:"pathParamsDiff"`
}

type runComparisonRESTReplyDiff struct {
	StatusDiff  runComparisonValueDiff `json:"statusDiff"`
	BodyDiff    runComparisonValueDiff `json:"bodyDiff"`
	DataDiff    runComparisonValueDiff `json:"dataDiff"`
	HeadersDiff runComparisonValueDiff `json:"headersDiff"`
	CookiesDiff runComparisonValueDiff `json:"cookiesDiff"`
}

type runComparisonRESTEnvelopeDiff struct {
	RequestEnvelopeCompared bool                          `json:"requestEnvelopeCompared"`
	FlowInputCompared       bool                          `json:"flowInputCompared"`
	ReplyEnvelopeCompared   bool                          `json:"replyEnvelopeCompared"`
	UnsupportedFields       []string                      `json:"unsupportedFields,omitempty"`
	Request                 *runComparisonRESTRequestDiff `json:"request,omitempty"`
	FlowInputDiff           *runComparisonValueDiff       `json:"flowInputDiff,omitempty"`
	Reply                   *runComparisonRESTReplyDiff   `json:"reply,omitempty"`
}

type runComparisonTimerRuntimeDiff struct {
	ComparisonBasis    string                  `json:"comparisonBasis"`
	RuntimeMode        string                  `json:"runtimeMode,omitempty"`
	SettingsCompared   bool                    `json:"settingsCompared"`
	FlowInputCompared  bool                    `json:"flowInputCompared"`
	FlowOutputCompared bool                    `json:"flowOutputCompared"`
	TickCompared       bool                    `json:"tickCompared"`
	SettingsDiff       *runComparisonValueDiff `json:"settingsDiff,omitempty"`
	FlowInputDiff      *runComparisonValueDiff `json:"flowInputDiff,omitempty"`
	FlowOutputDiff     *runComparisonValueDiff `json:"flowOutputDiff,omitempty"`
	TickDiff           *runComparisonValueDiff `json:"tickDiff,omitempty"`
	UnsupportedFields  []string                `json:"unsupportedFields,omitempty"`
	Diagnostics        []diagnostic            `json:"diagnostics,omitempty"`
}

type runComparisonCLIRuntimeDiff struct {
	ComparisonBasis    string                  `json:"comparisonBasis"`
	RuntimeMode        string                  `json:"runtimeMode,omitempty"`
	CommandCompared    bool                    `json:"commandCompared"`
	ArgsCompared       bool                    `json:"argsCompared"`
	FlagsCompared      bool                    `json:"flagsCompared"`
	FlowInputCompared  bool                    `json:"flowInputCompared"`
	FlowOutputCompared bool                    `json:"flowOutputCompared"`
	ReplyCompared      bool                    `json:"replyCompared"`
	CommandDiff        *runComparisonValueDiff `json:"commandDiff,omitempty"`
	ArgsDiff           *runComparisonValueDiff `json:"argsDiff,omitempty"`
	FlagsDiff          *runComparisonValueDiff `json:"flagsDiff,omitempty"`
	FlowInputDiff      *runComparisonValueDiff `json:"flowInputDiff,omitempty"`
	FlowOutputDiff     *runComparisonValueDiff `json:"flowOutputDiff,omitempty"`
	ReplyDiff          *runComparisonValueDiff `json:"replyDiff,omitempty"`
	UnsupportedFields  []string                `json:"unsupportedFields,omitempty"`
	Diagnostics        []diagnostic            `json:"diagnostics,omitempty"`
}

type runComparisonChannelRuntimeDiff struct {
	ComparisonBasis    string                  `json:"comparisonBasis"`
	RuntimeMode        string                  `json:"runtimeMode,omitempty"`
	ChannelCompared    bool                    `json:"channelCompared"`
	DataCompared       bool                    `json:"dataCompared"`
	FlowInputCompared  bool                    `json:"flowInputCompared"`
	FlowOutputCompared bool                    `json:"flowOutputCompared"`
	ChannelDiff        *runComparisonValueDiff `json:"channelDiff,omitempty"`
	DataDiff           *runComparisonValueDiff `json:"dataDiff,omitempty"`
	FlowInputDiff      *runComparisonValueDiff `json:"flowInputDiff,omitempty"`
	FlowOutputDiff     *runComparisonValueDiff `json:"flowOutputDiff,omitempty"`
	UnsupportedFields  []string                `json:"unsupportedFields,omitempty"`
	Diagnostics        []diagnostic            `json:"diagnostics,omitempty"`
}

type runComparisonResult struct {
	Left              runComparisonArtifactRef         `json:"left"`
	Right             runComparisonArtifactRef         `json:"right"`
	ComparisonBasis   string                           `json:"comparisonBasis,omitempty"`
	Summary           runComparisonSummaryDiff         `json:"summary"`
	RestComparison    *runComparisonRESTEnvelopeDiff   `json:"restComparison,omitempty"`
	CLIComparison     *runComparisonCLIRuntimeDiff     `json:"cliComparison,omitempty"`
	ChannelComparison *runComparisonChannelRuntimeDiff `json:"channelComparison,omitempty"`
	TimerComparison   *runComparisonTimerRuntimeDiff   `json:"timerComparison,omitempty"`
	Steps             []runComparisonStepDiff          `json:"steps"`
	Diagnostics       []diagnostic                     `json:"diagnostics"`
}

type runComparisonResponse struct {
	Result     *runComparisonResult `json:"result,omitempty"`
	Validation *validationReport    `json:"validation,omitempty"`
}

type triggerProfile struct {
	Kind               string   `json:"kind"`
	Method             string   `json:"method,omitempty"`
	Path               string   `json:"path,omitempty"`
	Port               int      `json:"port,omitempty"`
	ReplyMode          string   `json:"replyMode,omitempty"`
	RequestMappingMode string   `json:"requestMappingMode,omitempty"`
	ReplyMappingMode   string   `json:"replyMappingMode,omitempty"`
	RunMode            string   `json:"runMode,omitempty"`
	StartDelay         string   `json:"startDelay,omitempty"`
	RepeatInterval     string   `json:"repeatInterval,omitempty"`
	SingleCmd          bool     `json:"singleCmd,omitempty"`
	CommandName        string   `json:"commandName,omitempty"`
	Usage              string   `json:"usage,omitempty"`
	Short              string   `json:"short,omitempty"`
	Long               string   `json:"long,omitempty"`
	Flags              []string `json:"flags,omitempty"`
	Channel            string   `json:"channel,omitempty"`
}

type triggerBindingRequest struct {
	FlowID          string         `json:"flowId"`
	Profile         triggerProfile `json:"profile"`
	ValidateOnly    bool           `json:"validateOnly"`
	ReplaceExisting bool           `json:"replaceExisting"`
	HandlerName     string         `json:"handlerName,omitempty"`
	TriggerID       string         `json:"triggerId,omitempty"`
}

type triggerBindingMappings struct {
	Input  map[string]any `json:"input"`
	Output map[string]any `json:"output"`
}

type triggerBindingPlan struct {
	FlowID           string                 `json:"flowId"`
	Profile          triggerProfile         `json:"profile"`
	TriggerRef       string                 `json:"triggerRef"`
	TriggerID        string                 `json:"triggerId"`
	HandlerName      string                 `json:"handlerName"`
	GeneratedMapping triggerBindingMappings `json:"generatedMappings"`
	Trigger          map[string]any         `json:"trigger"`
	Diagnostics      []diagnostic           `json:"diagnostics"`
	Warnings         []diagnostic           `json:"warnings"`
}

type triggerBindingResult struct {
	Applied      bool               `json:"applied"`
	Plan         triggerBindingPlan `json:"plan"`
	PatchSummary string             `json:"patchSummary"`
	Validation   *validationReport  `json:"validation,omitempty"`
	App          map[string]any     `json:"app,omitempty"`
}

type triggerBindingResponse struct {
	Result triggerBindingResult `json:"result"`
}

type subflowInvocation struct {
	ParentFlowID string         `json:"parentFlowId"`
	TaskID       string         `json:"taskId"`
	ActivityRef  string         `json:"activityRef"`
	Input        map[string]any `json:"input"`
	Output       map[string]any `json:"output"`
	Settings     map[string]any `json:"settings"`
}

type subflowExtractionRequest struct {
	FlowID          string   `json:"flowId"`
	TaskIDs         []string `json:"taskIds"`
	NewFlowID       string   `json:"newFlowId,omitempty"`
	NewFlowName     string   `json:"newFlowName,omitempty"`
	ValidateOnly    bool     `json:"validateOnly"`
	ReplaceExisting bool     `json:"replaceExisting"`
}

type subflowExtractionPlan struct {
	ParentFlowID    string            `json:"parentFlowId"`
	NewFlowID       string            `json:"newFlowId"`
	NewFlowName     string            `json:"newFlowName"`
	SelectedTaskIDs []string          `json:"selectedTaskIds"`
	NewFlowContract flowContract      `json:"newFlowContract"`
	Invocation      subflowInvocation `json:"invocation"`
	Diagnostics     []diagnostic      `json:"diagnostics"`
	Warnings        []diagnostic      `json:"warnings"`
}

type subflowExtractionResult struct {
	Applied      bool                  `json:"applied"`
	Plan         subflowExtractionPlan `json:"plan"`
	PatchSummary string                `json:"patchSummary"`
	Validation   *validationReport     `json:"validation,omitempty"`
	App          map[string]any        `json:"app,omitempty"`
}

type subflowExtractionResponse struct {
	Result subflowExtractionResult `json:"result"`
}

type subflowInliningRequest struct {
	ParentFlowID                string `json:"parentFlowId"`
	InvocationTaskID            string `json:"invocationTaskId"`
	ValidateOnly                bool   `json:"validateOnly"`
	RemoveExtractedFlowIfUnused bool   `json:"removeExtractedFlowIfUnused"`
}

type subflowInliningPlan struct {
	ParentFlowID     string       `json:"parentFlowId"`
	InvocationTaskID string       `json:"invocationTaskId"`
	InlinedFlowID    string       `json:"inlinedFlowId"`
	GeneratedTaskIDs []string     `json:"generatedTaskIds"`
	Diagnostics      []diagnostic `json:"diagnostics"`
	Warnings         []diagnostic `json:"warnings"`
}

type subflowInliningResult struct {
	Applied      bool                `json:"applied"`
	Plan         subflowInliningPlan `json:"plan"`
	PatchSummary string              `json:"patchSummary"`
	Validation   *validationReport   `json:"validation,omitempty"`
	App          map[string]any      `json:"app,omitempty"`
}

type subflowInliningResponse struct {
	Result subflowInliningResult `json:"result"`
}

type iteratorSynthesisRequest struct {
	FlowID          string `json:"flowId"`
	TaskID          string `json:"taskId"`
	IterateExpr     string `json:"iterateExpr"`
	Accumulate      *bool  `json:"accumulate,omitempty"`
	ValidateOnly    bool   `json:"validateOnly"`
	ReplaceExisting bool   `json:"replaceExisting"`
}

type iteratorSynthesisPlan struct {
	FlowID       string         `json:"flowId"`
	TaskID       string         `json:"taskId"`
	NextTaskType string         `json:"nextTaskType"`
	UpdatedSetts map[string]any `json:"updatedSettings"`
	Diagnostics  []diagnostic   `json:"diagnostics"`
	Warnings     []diagnostic   `json:"warnings"`
}

type iteratorSynthesisResult struct {
	Applied      bool                  `json:"applied"`
	Plan         iteratorSynthesisPlan `json:"plan"`
	PatchSummary string                `json:"patchSummary"`
	Validation   *validationReport     `json:"validation,omitempty"`
	App          map[string]any        `json:"app,omitempty"`
}

type iteratorSynthesisResponse struct {
	Result iteratorSynthesisResult `json:"result"`
}

type retryPolicyRequest struct {
	FlowID          string `json:"flowId"`
	TaskID          string `json:"taskId"`
	Count           int    `json:"count"`
	IntervalMs      int    `json:"intervalMs"`
	ValidateOnly    bool   `json:"validateOnly"`
	ReplaceExisting bool   `json:"replaceExisting"`
}

type retryPolicyPlan struct {
	FlowID       string         `json:"flowId"`
	TaskID       string         `json:"taskId"`
	RetryOnError map[string]any `json:"retryOnError"`
	Diagnostics  []diagnostic   `json:"diagnostics"`
	Warnings     []diagnostic   `json:"warnings"`
}

type retryPolicyResult struct {
	Applied      bool              `json:"applied"`
	Plan         retryPolicyPlan   `json:"plan"`
	PatchSummary string            `json:"patchSummary"`
	Validation   *validationReport `json:"validation,omitempty"`
	App          map[string]any    `json:"app,omitempty"`
}

type retryPolicyResponse struct {
	Result retryPolicyResult `json:"result"`
}

type doWhileSynthesisRequest struct {
	FlowID          string `json:"flowId"`
	TaskID          string `json:"taskId"`
	Condition       string `json:"condition"`
	DelayMs         *int   `json:"delayMs,omitempty"`
	Accumulate      *bool  `json:"accumulate,omitempty"`
	ValidateOnly    bool   `json:"validateOnly"`
	ReplaceExisting bool   `json:"replaceExisting"`
}

type doWhileSynthesisPlan struct {
	FlowID       string         `json:"flowId"`
	TaskID       string         `json:"taskId"`
	NextTaskType string         `json:"nextTaskType"`
	UpdatedSetts map[string]any `json:"updatedSettings"`
	Diagnostics  []diagnostic   `json:"diagnostics"`
	Warnings     []diagnostic   `json:"warnings"`
}

type doWhileSynthesisResult struct {
	Applied      bool                 `json:"applied"`
	Plan         doWhileSynthesisPlan `json:"plan"`
	PatchSummary string               `json:"patchSummary"`
	Validation   *validationReport    `json:"validation,omitempty"`
	App          map[string]any       `json:"app,omitempty"`
}

type doWhileSynthesisResponse struct {
	Result doWhileSynthesisResult `json:"result"`
}

type errorPathTemplateRequest struct {
	FlowID              string `json:"flowId"`
	TaskID              string `json:"taskId"`
	Template            string `json:"template"`
	ValidateOnly        bool   `json:"validateOnly"`
	ReplaceExisting     bool   `json:"replaceExisting"`
	LogMessage          string `json:"logMessage,omitempty"`
	GeneratedTaskPrefix string `json:"generatedTaskPrefix,omitempty"`
}

type errorPathTemplatePlan struct {
	FlowID          string           `json:"flowId"`
	TaskID          string           `json:"taskId"`
	Template        string           `json:"template"`
	GeneratedTaskID string           `json:"generatedTaskId"`
	AddedImport     bool             `json:"addedImport"`
	GeneratedLinks  []map[string]any `json:"generatedLinks"`
	Diagnostics     []diagnostic     `json:"diagnostics"`
	Warnings        []diagnostic     `json:"warnings"`
}

type errorPathTemplateResult struct {
	Applied      bool                  `json:"applied"`
	Plan         errorPathTemplatePlan `json:"plan"`
	PatchSummary string                `json:"patchSummary"`
	Validation   *validationReport     `json:"validation,omitempty"`
	App          map[string]any        `json:"app,omitempty"`
}

type errorPathTemplateResponse struct {
	Result errorPathTemplateResult `json:"result"`
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
	ID             string
	ActionRef      string
	ActionSettings map[string]any
	Settings       map[string]any
	Input          map[string]any
	Output         map[string]any
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
	Type        string
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
	Links          []map[string]any
}

type flogoApp struct {
	Name       string
	Type       string
	AppModel   string
	Imports    []flogoImport
	Properties []map[string]any
	Triggers   []flogoTrigger
	Resources  []flogoFlow
	Raw        map[string]any
}

type runtimeTracePreparedFlow struct {
	FlowID            string
	FlowName          string
	ResourceData      []byte
	RuntimeResourceID string
	RuntimeFlowURI    string
}

type runtimeTracePreparedRESTTrigger struct {
	TriggerID              string
	TriggerRef             string
	HandlerName            string
	Method                 string
	Path                   string
	Port                   int
	RequestMappings        map[string]any
	ReplyMappings          map[string]any
	RuntimeRequestMappings map[string]any
	RuntimeReplyMappings   map[string]any
}

type runtimeTracePreparedCLITrigger struct {
	TriggerID             string
	TriggerRef            string
	CommandName           string
	SingleCmd             bool
	Usage                 string
	Long                  string
	HandlerUsage          string
	HandlerShort          string
	HandlerLong           string
	FlagDescriptions      []string
	FlagKinds             map[string]string
	InputMappings         map[string]any
	OutputMappings        map[string]any
	RuntimeInputMappings  map[string]any
	RuntimeOutputMappings map[string]any
}

type runtimeTracePreparedTimerTrigger struct {
	TriggerID      string
	TriggerRef     string
	HandlerName    string
	StartDelay     string
	RepeatInterval string
}

type runtimeTracePreparedChannelTrigger struct {
	TriggerID             string
	TriggerRef            string
	HandlerName           string
	ChannelName           string
	ChannelDescriptors    []string
	ChannelBufferSize     int
	InputMappings         map[string]any
	OutputMappings        map[string]any
	RuntimeInputMappings  map[string]any
	RuntimeOutputMappings map[string]any
}

type runtimeTraceRecorderBridge struct {
	name          string
	mu            sync.Mutex
	recordingMode string
	start         map[string]any
	snapshots     []map[string]any
	steps         []map[string]any
	done          map[string]any
}

type runtimeTraceRecorderFactory struct{}

type runtimeRestTriggerSettings struct {
	Port int `json:"port"`
}

type runtimeRestTriggerHandlerSettings struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type runtimeRestTriggerMetadata struct{}

type runtimeRestTriggerFactory struct{}

type runtimeRestTrigger struct {
	mu       sync.Mutex
	id       string
	settings map[string]any
	handlers []coretrigger.Handler
	server   *http.Server
	listener net.Listener
	endpoint string
}

type runtimeCliTriggerMetadata struct{}

type runtimeCliTriggerSettings struct {
	SingleCmd bool `json:"singleCmd"`
}

type runtimeCliTriggerHandlerSettings struct {
	Command string   `json:"command"`
	Usage   string   `json:"usage,omitempty"`
	Short   string   `json:"short,omitempty"`
	Long    string   `json:"long,omitempty"`
	Flags   []string `json:"flags,omitempty"`
}

type runtimeCliTriggerFactory struct{}

type runtimeCliTrigger struct {
	mu       sync.Mutex
	id       string
	settings map[string]any
	handlers []coretrigger.Handler
	state    *runtimeCliTriggerExecutionState
}

type runtimeCliTriggerExecutionState struct {
	SingleCmd        bool
	HandlerName      string
	CommandName      string
	Usage            string
	Short            string
	Long             string
	HandlerFlags     []string
	Args             []string
	InvocationFlags  map[string]any
	RequestMappings  map[string]any
	ReplyMappings    map[string]any
	MappedFlowInput  map[string]any
	MappedFlowOutput map[string]any
	ReplyData        any
	ReplyStdout      string
	Diagnostics      []diagnostic
}

type runtimeCLIRequestBundle struct {
	Args  []string
	Flags map[string]any
	Argv  []string
}

type runtimeChannelRequestBundle struct {
	Data any
}

func newRuntimeTraceRecorderBridge(name string) *runtimeTraceRecorderBridge {
	return &runtimeTraceRecorderBridge{name: name}
}

func (recorder *runtimeTraceRecorderBridge) Name() string {
	return recorder.name
}

func (recorder *runtimeTraceRecorderBridge) Start() error {
	return nil
}

func (recorder *runtimeTraceRecorderBridge) Stop() error {
	return nil
}

func (recorder *runtimeTraceRecorderBridge) Reset(recordingMode string) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()

	recorder.recordingMode = recordingMode
	recorder.start = nil
	recorder.snapshots = nil
	recorder.steps = nil
	recorder.done = nil
}

func (recorder *runtimeTraceRecorderBridge) Evidence() *runtimeTraceRecorderEvidence {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()

	evidence := &runtimeTraceRecorderEvidence{
		RecordingMode: recorder.recordingMode,
		Start:         cloneStringAnyMap(recorder.start),
		Snapshots:     cloneMapSlice(recorder.snapshots),
		Steps:         cloneMapSlice(recorder.steps),
		Done:          cloneStringAnyMap(recorder.done),
	}
	if len(evidence.Start) == 0 {
		evidence.Start = nil
	}
	if len(evidence.Done) == 0 {
		evidence.Done = nil
	}
	if len(evidence.Snapshots) == 0 {
		evidence.Snapshots = nil
	}
	if len(evidence.Steps) == 0 {
		evidence.Steps = nil
	}
	return evidence
}

func (recorder *runtimeTraceRecorderBridge) RecordStart(state *flowstate.FlowState) error {
	if state == nil {
		return nil
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()

	recorder.start = flowStateToMap(state)
	return nil
}

func (recorder *runtimeTraceRecorderBridge) RecordSnapshot(snapshot *flowstate.Snapshot) error {
	if snapshot == nil {
		return nil
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()

	recorder.snapshots = append(recorder.snapshots, snapshotToMap(snapshot))
	return nil
}

func (recorder *runtimeTraceRecorderBridge) RecordStep(step *flowstate.Step) error {
	if step == nil {
		return nil
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()

	recorder.steps = append(recorder.steps, stepToMap(step))
	return nil
}

func (recorder *runtimeTraceRecorderBridge) RecordDone(state *flowstate.FlowState) error {
	if state == nil {
		return nil
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()

	recorder.done = flowStateToMap(state)
	return nil
}

func (factory *runtimeTraceRecorderFactory) NewService(config *coreservice.Config) (coreservice.Service, error) {
	return runtimeTraceRecorderSingleton, nil
}

var runtimeRestTriggerMd = coretrigger.NewMetadata(&runtimeRestTriggerSettings{}, &runtimeRestTriggerHandlerSettings{})
var runtimeCliTriggerMd = coretrigger.NewMetadata(&runtimeCliTriggerSettings{}, &runtimeCliTriggerHandlerSettings{})

func newRuntimeRestTrigger() *runtimeRestTrigger {
	return &runtimeRestTrigger{}
}

func (factory *runtimeRestTriggerFactory) Metadata() *coretrigger.Metadata {
	return runtimeRestTriggerMd
}

func (factory *runtimeRestTriggerFactory) New(config *coretrigger.Config) (coretrigger.Trigger, error) {
	trigger := runtimeRestTriggerSingleton
	trigger.mu.Lock()
	defer trigger.mu.Unlock()

	trigger.id = config.Id
	trigger.settings = cloneStringAnyMap(config.Settings)
	trigger.handlers = nil
	trigger.server = nil
	trigger.listener = nil
	trigger.endpoint = ""
	return trigger, nil
}

func (trigger *runtimeRestTrigger) Ref() string {
	return supportedRuntimeRESTTriggerRef
}

func (trigger *runtimeRestTrigger) Metadata() *coretrigger.Metadata {
	return runtimeRestTriggerMd
}

func (trigger *runtimeRestTrigger) Initialize(ctx coretrigger.InitContext) error {
	trigger.mu.Lock()
	defer trigger.mu.Unlock()

	trigger.handlers = append([]coretrigger.Handler{}, ctx.GetHandlers()...)
	return nil
}

func (trigger *runtimeRestTrigger) Start() error {
	trigger.mu.Lock()
	if trigger.server != nil {
		trigger.mu.Unlock()
		return nil
	}
	settings := cloneStringAnyMap(trigger.settings)
	trigger.mu.Unlock()

	port := int(numberValue(settings["port"]))
	addr := "127.0.0.1:0"
	if port > 0 {
		addr = fmt.Sprintf("127.0.0.1:%d", port)
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}

	server := &http.Server{Handler: http.HandlerFunc(trigger.handleHTTP)}
	trigger.mu.Lock()
	trigger.listener = listener
	trigger.server = server
	trigger.endpoint = "http://" + listener.Addr().String()
	trigger.mu.Unlock()

	go func() {
		_ = server.Serve(listener)
	}()

	return nil
}

func (trigger *runtimeRestTrigger) Stop() error {
	trigger.mu.Lock()
	server := trigger.server
	listener := trigger.listener
	trigger.server = nil
	trigger.listener = nil
	trigger.endpoint = ""
	trigger.handlers = nil
	trigger.mu.Unlock()

	if server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = server.Shutdown(ctx)
		cancel()
	}
	if listener != nil {
		_ = listener.Close()
	}

	return nil
}

func (trigger *runtimeRestTrigger) Endpoint() string {
	trigger.mu.Lock()
	defer trigger.mu.Unlock()
	return trigger.endpoint
}

func (trigger *runtimeRestTrigger) handleHTTP(w http.ResponseWriter, r *http.Request) {
	handler, pathParams := trigger.matchHandler(r.Method, r.URL.Path)
	if handler == nil {
		http.NotFound(w, r)
		return
	}

	bodyBytes, _ := io.ReadAll(r.Body)
	triggerData := map[string]any{
		"method":      r.Method,
		"path":        r.URL.Path,
		"headers":     runtimeRESTHeaderValuesToMap(r.Header),
		"queryParams": runtimeRESTQueryValuesToMap(r.URL.Query()),
		"pathParams":  pathParams,
	}
	if len(bodyBytes) > 0 {
		decodedBody := runtimeRESTBodyValue(bodyBytes)
		triggerData["body"] = decodedBody
		triggerData["content"] = decodedBody
	}

	requestMappings, replyMappings := runtimeRESTHandlerMappings(handler)
	requestContext := mappingPreviewContext{
		Flow:     map[string]any{},
		Activity: map[string]map[string]any{},
		Env:      map[string]any{},
		Property: map[string]any{},
		Trigger:  triggerData,
	}
	mappedInput := runtimeRESTApplyMappings(requestMappings, requestContext)
	if len(mappedInput) == 0 {
		mappedInput = cloneStringAnyMap(triggerData)
	}

	results, err := handler.Handle(r.Context(), mappedInput)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	recorderEvidence := runtimeTraceRecorderSingleton.Evidence()
	flowEvidence := map[string]any{}
	if recorderEvidence != nil {
		if recordedOutput := recorderFlowOutputs(recorderEvidence.Done); len(recordedOutput) > 0 {
			flowEvidence = mergeRuntimeEvidenceMap(flowEvidence, recordedOutput)
		}
		if len(flowEvidence) == 0 {
			if recordedOutput := recorderFlowOutputs(recorderEvidence.Start); len(recordedOutput) > 0 {
				flowEvidence = mergeRuntimeEvidenceMap(flowEvidence, recordedOutput)
			}
		}
	}
	if runtimeResults := cloneStringAnyMap(mapValue(results)); len(runtimeResults) > 0 {
		flowEvidence = mergeRuntimeEvidenceMap(flowEvidence, runtimeResults)
	}
	if len(flowEvidence) == 0 {
		flowEvidence = cloneStringAnyMap(results)
	}
	if message, ok := flowEvidence["message"]; ok {
		if typed, ok := message.(string); ok && (strings.HasPrefix(typed, "=$") || strings.HasPrefix(typed, "$.")) {
			if mapped, exists := mappedInput["message"]; exists {
				flowEvidence["message"] = makeJSONSafe(mapped)
			} else if payload, exists := mappedInput["payload"]; exists {
				flowEvidence["message"] = makeJSONSafe(payload)
			} else if payload, exists := flowEvidence["payload"]; exists {
				flowEvidence["message"] = makeJSONSafe(payload)
			} else if content, exists := flowEvidence["content"]; exists {
				flowEvidence["message"] = makeJSONSafe(content)
			}
		}
	} else {
		if mapped, exists := mappedInput["message"]; exists {
			flowEvidence["message"] = makeJSONSafe(mapped)
		} else if payload, exists := mappedInput["payload"]; exists {
			flowEvidence["message"] = makeJSONSafe(payload)
		} else if payload, exists := flowEvidence["payload"]; exists {
			flowEvidence["message"] = makeJSONSafe(payload)
		} else if content, exists := flowEvidence["content"]; exists {
			flowEvidence["message"] = makeJSONSafe(content)
		}
	}

	replyContext := mappingPreviewContext{
		Flow:     flowEvidence,
		Activity: map[string]map[string]any{},
		Env:      map[string]any{},
		Property: map[string]any{},
		Trigger:  triggerData,
	}
	replyValues := runtimeRESTApplyMappings(replyMappings, replyContext)
	if len(replyValues) == 0 {
		replyValues = cloneStringAnyMap(flowEvidence)
	}

	statusCode := runtimeRESTStatusCode(replyValues)
	responseHeaders := runtimeRESTResponseHeaders(replyValues)
	responseBody := runtimeRESTResponseBody(replyValues)
	if responseBody == nil {
		if mapped, ok := mappedInput["message"]; ok {
			responseBody = makeJSONSafe(mapped)
			replyValues["data"] = responseBody
		} else if mapped, ok := mappedInput["payload"]; ok {
			responseBody = makeJSONSafe(mapped)
			replyValues["data"] = responseBody
		} else if mapped, ok := flowEvidence["message"]; ok {
			responseBody = makeJSONSafe(mapped)
			replyValues["data"] = responseBody
		} else if mapped, ok := flowEvidence["payload"]; ok {
			responseBody = makeJSONSafe(mapped)
			replyValues["data"] = responseBody
		}
	}

	for key, value := range responseHeaders {
		if value == nil {
			continue
		}
		switch typed := value.(type) {
		case []any:
			for _, item := range typed {
				w.Header().Add(key, fmt.Sprint(item))
			}
		case []string:
			for _, item := range typed {
				w.Header().Add(key, item)
			}
		default:
			w.Header().Set(key, fmt.Sprint(value))
		}
	}

	if responseBody != nil && w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/json")
	}
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	w.WriteHeader(statusCode)
	if responseBody == nil {
		return
	}

	switch typed := responseBody.(type) {
	case string:
		_, _ = w.Write([]byte(typed))
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			_, _ = w.Write([]byte(fmt.Sprint(typed)))
			return
		}
		_, _ = w.Write(encoded)
	}
}

func (trigger *runtimeRestTrigger) matchHandler(method string, requestPath string) (coretrigger.Handler, map[string]string) {
	trigger.mu.Lock()
	handlers := append([]coretrigger.Handler{}, trigger.handlers...)
	trigger.mu.Unlock()

	for _, handler := range handlers {
		settings := handler.Settings()
		handlerMethod := strings.ToUpper(strings.TrimSpace(stringValue(settings["method"])))
		handlerPath := strings.TrimSpace(stringValue(settings["path"]))
		if handlerPath == "" {
			continue
		}
		if handlerMethod != "" && !strings.EqualFold(handlerMethod, method) {
			continue
		}
		if params, ok := runtimeRESTPathParams(handlerPath, requestPath); ok {
			return handler, params
		}
	}

	return nil, map[string]string{}
}

func newRuntimeCliTrigger() *runtimeCliTrigger {
	return &runtimeCliTrigger{}
}

func (factory *runtimeCliTriggerFactory) Metadata() *coretrigger.Metadata {
	return runtimeCliTriggerMd
}

func (factory *runtimeCliTriggerFactory) New(config *coretrigger.Config) (coretrigger.Trigger, error) {
	trigger := runtimeCliTriggerSingleton
	trigger.mu.Lock()
	defer trigger.mu.Unlock()

	trigger.id = config.Id
	trigger.settings = cloneStringAnyMap(config.Settings)
	trigger.handlers = nil
	trigger.state = nil
	return trigger, nil
}

func (trigger *runtimeCliTrigger) Ref() string {
	return supportedRuntimeCLITriggerRef
}

func (trigger *runtimeCliTrigger) Metadata() *coretrigger.Metadata {
	return runtimeCliTriggerMd
}

func (trigger *runtimeCliTrigger) Initialize(ctx coretrigger.InitContext) error {
	trigger.mu.Lock()
	defer trigger.mu.Unlock()

	trigger.handlers = append([]coretrigger.Handler{}, ctx.GetHandlers()...)
	return nil
}

func (trigger *runtimeCliTrigger) Start() error {
	trigger.mu.Lock()
	if len(trigger.handlers) == 0 {
		trigger.mu.Unlock()
		return nil
	}
	handlers := append([]coretrigger.Handler{}, trigger.handlers...)
	settings := cloneStringAnyMap(trigger.settings)
	trigger.mu.Unlock()

	handler := trigger.matchHandler(handlers, runtimeCLIArgsValue(settings["args"]))
	if handler == nil {
		return fmt.Errorf("no CLI handler was available for the current runtime-backed slice")
	}

	commandName := strings.TrimSpace(stringValue(handler.Settings()["command"]))
	requestMappings, replyMappings := runtimeRESTHandlerMappings(handler)
	args := runtimeCLIArgsValue(settings["args"])
	flags := runtimeCLIFlagsValue(settings["flags"])
	handlerFlags := runtimeCLIStringFlags(handler.Settings()["flags"])
	triggerData := map[string]any{
		"command":   commandName,
		"args":      args,
		"flags":     flags,
		"singleCmd": boolValue(settings["singleCmd"]),
	}
	requestContext := mappingPreviewContext{
		Flow:     map[string]any{},
		Activity: map[string]map[string]any{},
		Env:      map[string]any{},
		Property: map[string]any{},
		Trigger:  triggerData,
	}
	mappedInput := runtimeRESTApplyMappings(requestMappings, requestContext)
	if len(mappedInput) == 0 {
		mappedInput = cloneStringAnyMap(triggerData)
	}

	results, err := handler.Handle(context.Background(), mappedInput)
	if err != nil {
		return err
	}

	recorderEvidence := runtimeTraceRecorderSingleton.Evidence()
	flowOutput := map[string]any{}
	if recorderEvidence != nil {
		if recordedOutput := recorderFlowOutputs(recorderEvidence.Done); len(recordedOutput) > 0 {
			flowOutput = mergeRuntimeEvidenceMap(flowOutput, recordedOutput)
		}
		if len(flowOutput) == 0 {
			if recordedOutput := recorderFlowOutputs(recorderEvidence.Start); len(recordedOutput) > 0 {
				flowOutput = mergeRuntimeEvidenceMap(flowOutput, recordedOutput)
			}
		}
	}
	if runtimeResults := cloneStringAnyMap(mapValue(results)); len(runtimeResults) > 0 {
		flowOutput = mergeRuntimeEvidenceMap(flowOutput, runtimeResults)
	}
	if len(flowOutput) == 0 {
		flowOutput = cloneStringAnyMap(mapValue(results))
	}

	replyContext := mappingPreviewContext{
		Flow:     flowOutput,
		Activity: map[string]map[string]any{},
		Env:      map[string]any{},
		Property: map[string]any{},
		Trigger:  triggerData,
	}
	replyValues := runtimeRESTApplyMappings(replyMappings, replyContext)
	if len(replyValues) == 0 {
		replyValues = cloneStringAnyMap(flowOutput)
	}

	replyStdout := runtimeCLIStdout(replyValues)
	trigger.mu.Lock()
	trigger.state = &runtimeCliTriggerExecutionState{
		SingleCmd:        boolValue(settings["singleCmd"]),
		HandlerName:      handler.Name(),
		CommandName:      commandName,
		Usage:            stringValue(handler.Settings()["usage"]),
		Short:            stringValue(handler.Settings()["short"]),
		Long:             stringValue(handler.Settings()["long"]),
		HandlerFlags:     handlerFlags,
		Args:             append([]string{}, args...),
		InvocationFlags:  cloneStringAnyMap(flags),
		RequestMappings:  cloneStringAnyMap(requestMappings),
		ReplyMappings:    cloneStringAnyMap(replyMappings),
		MappedFlowInput:  cloneStringAnyMap(mappedInput),
		MappedFlowOutput: cloneStringAnyMap(flowOutput),
		ReplyData:        makeJSONSafe(replyValues["data"]),
		ReplyStdout:      replyStdout,
	}
	trigger.mu.Unlock()

	return nil
}

func (trigger *runtimeCliTrigger) Stop() error {
	trigger.mu.Lock()
	trigger.handlers = nil
	trigger.settings = nil
	trigger.id = ""
	trigger.state = nil
	trigger.mu.Unlock()
	return nil
}

func (trigger *runtimeCliTrigger) Evidence() *runtimeCliTriggerExecutionState {
	trigger.mu.Lock()
	defer trigger.mu.Unlock()

	if trigger.state == nil {
		return nil
	}
	state := *trigger.state
	state.Args = append([]string{}, trigger.state.Args...)
	state.HandlerFlags = append([]string{}, trigger.state.HandlerFlags...)
	state.InvocationFlags = cloneStringAnyMap(trigger.state.InvocationFlags)
	state.RequestMappings = cloneStringAnyMap(trigger.state.RequestMappings)
	state.ReplyMappings = cloneStringAnyMap(trigger.state.ReplyMappings)
	state.MappedFlowInput = cloneStringAnyMap(trigger.state.MappedFlowInput)
	state.MappedFlowOutput = cloneStringAnyMap(trigger.state.MappedFlowOutput)
	state.Diagnostics = cloneDiagnostics(trigger.state.Diagnostics)
	return &state
}

func (trigger *runtimeCliTrigger) matchHandler(handlers []coretrigger.Handler, args []string) coretrigger.Handler {
	if len(handlers) == 0 {
		return nil
	}
	if len(handlers) == 1 {
		return handlers[0]
	}

	command := ""
	if len(args) > 0 {
		command = strings.TrimSpace(args[0])
	}
	for _, handler := range handlers {
		if strings.EqualFold(strings.TrimSpace(stringValue(handler.Settings()["command"])), command) {
			return handler
		}
	}
	return nil
}

func runtimeCLIArgsValue(value any) []string {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case []string:
		return append([]string{}, typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			result = append(result, fmt.Sprint(item))
		}
		return result
	case string:
		if strings.TrimSpace(typed) == "" {
			return nil
		}
		return []string{typed}
	default:
		return []string{fmt.Sprint(typed)}
	}
}

func runtimeCLIFlagsValue(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	if flags := mapValue(value); len(flags) > 0 {
		return cloneStringAnyMap(flags)
	}
	return map[string]any{}
}

func runtimeCLIStringFlags(value any) []string {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case []string:
		return append([]string{}, typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			result = append(result, fmt.Sprint(item))
		}
		return result
	default:
		return []string{fmt.Sprint(typed)}
	}
}

func runtimeCLIStdout(value any) string {
	if value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	default:
		encoded, err := json.Marshal(makeJSONSafe(typed))
		if err != nil {
			return fmt.Sprint(typed)
		}
		return string(encoded)
	}
}

func buildRuntimeCLIRequestBundle(prepared runtimeTracePreparedCLITrigger, sampleInput map[string]any) (runtimeCLIRequestBundle, error) {
	args := runtimeCLIArgsValue(sampleInput["args"])
	flags := runtimeCLIFlagsValue(sampleInput["flags"])
	if command := strings.TrimSpace(stringValue(sampleInput["command"])); command != "" && !strings.EqualFold(command, prepared.CommandName) {
		return runtimeCLIRequestBundle{}, fmt.Errorf("requested CLI command %q does not match the supported runtime-backed command %q", command, prepared.CommandName)
	}

	flagKeys := make([]string, 0, len(flags))
	for key := range flags {
		flagKeys = append(flagKeys, key)
	}
	sort.Strings(flagKeys)

	argv := []string{"flogo-helper-cli-runtime", prepared.CommandName}
	for _, key := range flagKeys {
		kind := prepared.FlagKinds[key]
		if kind == "" {
			return runtimeCLIRequestBundle{}, fmt.Errorf("unsupported CLI flag %q for the current runtime-backed slice", key)
		}
		switch kind {
		case "bool":
			value, err := runtimeCLIBoolFlagValue(flags[key])
			if err != nil {
				return runtimeCLIRequestBundle{}, fmt.Errorf("invalid boolean value for CLI flag %q: %w", key, err)
			}
			argv = append(argv, fmt.Sprintf("--%s=%t", key, value))
		default:
			value, err := runtimeCLIStringFlagValue(flags[key])
			if err != nil {
				return runtimeCLIRequestBundle{}, fmt.Errorf("invalid string value for CLI flag %q: %w", key, err)
			}
			argv = append(argv, fmt.Sprintf("--%s=%s", key, value))
		}
	}
	argv = append(argv, args...)

	return runtimeCLIRequestBundle{
		Args:  append([]string{}, args...),
		Flags: cloneStringAnyMap(flags),
		Argv:  argv,
	}, nil
}

func buildRuntimeChannelRequestBundle(prepared runtimeTracePreparedChannelTrigger, sampleInput map[string]any) (runtimeChannelRequestBundle, error) {
	if requestedChannel := strings.TrimSpace(stringValue(sampleInput["channel"])); requestedChannel != "" && !strings.EqualFold(requestedChannel, prepared.ChannelName) {
		return runtimeChannelRequestBundle{}, fmt.Errorf("requested channel %q does not match the supported runtime-backed channel %q", requestedChannel, prepared.ChannelName)
	}
	if value, ok := sampleInput["data"]; ok {
		return runtimeChannelRequestBundle{Data: makeJSONSafe(value)}, nil
	}
	if value, ok := sampleInput["message"]; ok {
		return runtimeChannelRequestBundle{Data: makeJSONSafe(value)}, nil
	}
	if len(sampleInput) > 0 {
		envelope := cloneStringAnyMap(sampleInput)
		delete(envelope, "channel")
		if len(envelope) > 0 {
			return runtimeChannelRequestBundle{Data: envelope}, nil
		}
	}
	return runtimeChannelRequestBundle{Data: map[string]any{}}, nil
}

func runtimeCLIBoolFlagValue(value any) (bool, error) {
	switch typed := value.(type) {
	case bool:
		return typed, nil
	case string:
		return strconv.ParseBool(strings.TrimSpace(typed))
	default:
		text := strings.TrimSpace(fmt.Sprint(value))
		if text == "" {
			return false, fmt.Errorf("empty value")
		}
		return strconv.ParseBool(text)
	}
}

func runtimeCLIStringFlagValue(value any) (string, error) {
	switch typed := value.(type) {
	case string:
		return typed, nil
	case bool, float64, float32, int, int32, int64, uint, uint32, uint64:
		return fmt.Sprint(typed), nil
	default:
		if reflect.TypeOf(value) == nil {
			return "", fmt.Errorf("nil value")
		}
		kind := reflect.TypeOf(value).Kind()
		if kind == reflect.Map || kind == reflect.Slice || kind == reflect.Array || kind == reflect.Struct {
			return "", fmt.Errorf("complex value %T is unsupported", value)
		}
		return fmt.Sprint(value), nil
	}
}

func runtimeRESTPathParams(pattern string, requestPath string) (map[string]string, bool) {
	normalizedPattern := normalizeRuntimeRESTPath(pattern)
	normalizedRequest := normalizeRuntimeRESTPath(requestPath)
	if normalizedPattern == normalizedRequest {
		return map[string]string{}, true
	}

	patternParts := strings.Split(strings.Trim(normalizedPattern, "/"), "/")
	requestParts := strings.Split(strings.Trim(normalizedRequest, "/"), "/")
	if len(patternParts) != len(requestParts) {
		return nil, false
	}

	params := map[string]string{}
	for index, patternPart := range patternParts {
		requestPart := requestParts[index]
		if strings.HasPrefix(patternPart, "{") && strings.HasSuffix(patternPart, "}") {
			name := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(patternPart, "{"), "}"))
			if name == "" {
				return nil, false
			}
			params[name] = requestPart
			continue
		}
		if patternPart != requestPart {
			return nil, false
		}
	}

	return params, true
}

func normalizeRuntimeRESTPath(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "/"
	}
	if !strings.HasPrefix(value, "/") {
		value = "/" + value
	}
	if value != "/" {
		value = strings.TrimRight(value, "/")
		if value == "" {
			value = "/"
		}
	}
	return value
}

func runtimeRESTHeaderValuesToMap(headers http.Header) map[string]any {
	if len(headers) == 0 {
		return map[string]any{}
	}

	result := map[string]any{}
	for key, values := range headers {
		if len(values) == 1 {
			result[key] = values[0]
			continue
		}
		list := make([]any, 0, len(values))
		for _, value := range values {
			list = append(list, value)
		}
		result[key] = list
	}
	return result
}

func runtimeRESTQueryValuesToMap(values map[string][]string) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}

	result := map[string]any{}
	for key, list := range values {
		if len(list) == 1 {
			result[key] = list[0]
			continue
		}
		items := make([]any, 0, len(list))
		for _, item := range list {
			items = append(items, item)
		}
		result[key] = items
	}
	return result
}

func runtimeRESTBodyValue(body []byte) any {
	if len(body) == 0 {
		return nil
	}

	var parsed any
	if err := json.Unmarshal(body, &parsed); err == nil {
		return makeJSONSafe(parsed)
	}

	return string(body)
}

func runtimeRESTHandlerMappings(handler coretrigger.Handler) (map[string]any, map[string]any) {
	settings := handler.Settings()
	requestMappings := map[string]any{}
	replyMappings := map[string]any{}
	if settings == nil {
		return requestMappings, replyMappings
	}
	if candidate := mapValue(settings["requestMappings"]); len(candidate) > 0 {
		requestMappings = cloneStringAnyMap(candidate)
	}
	if candidate := mapValue(settings["replyMappings"]); len(candidate) > 0 {
		replyMappings = cloneStringAnyMap(candidate)
	}
	return requestMappings, replyMappings
}

func runtimeRESTApplyMappings(mappings map[string]any, context mappingPreviewContext) map[string]any {
	if len(mappings) == 0 {
		return map[string]any{}
	}

	result := map[string]any{}
	for key, value := range mappings {
		resolved := makeJSONSafe(resolveValue(value, context))
		if typed, ok := resolved.(string); ok {
			switch {
			case strings.HasPrefix(typed, "=$.") || strings.HasPrefix(typed, "$."):
				path := strings.TrimPrefix(strings.TrimPrefix(typed, "=$."), "$.")
				if path != "" {
					if flowValue, ok := resolveByPath(context.Flow, path); ok {
						resolved = makeJSONSafe(flowValue)
					}
				}
			case strings.HasPrefix(typed, "="):
				resolved = strings.TrimPrefix(typed, "=")
			}
		}
		result[key] = resolved
	}
	return result
}

func runtimeRESTStatusCode(results map[string]any) int {
	if len(results) == 0 {
		return 0
	}
	switch typed := results["code"].(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	default:
		return 0
	}
}

func runtimeRESTResponseHeaders(results map[string]any) map[string]any {
	if len(results) == 0 {
		return map[string]any{}
	}
	if headers, ok := results["headers"].(map[string]any); ok {
		return headers
	}
	return map[string]any{}
}

func runtimeRESTResponseBody(results map[string]any) any {
	if len(results) == 0 {
		return nil
	}
	if data, ok := results["data"]; ok {
		return data
	}
	return nil
}

func buildRuntimeEvidence(kind, runtimeMode, fallbackReason string, recorder *runtimeTraceRecorderEvidence, taskEvents []map[string]any) *runtimeEvidence {
	evidence := &runtimeEvidence{
		Kind:           kind,
		RuntimeMode:    runtimeMode,
		FallbackReason: strings.TrimSpace(fallbackReason),
		TaskEvents:     cloneMapSlice(taskEvents),
	}
	if recorder != nil {
		evidence.RecorderBacked = len(recorder.Start) > 0 || len(recorder.Done) > 0 || len(recorder.Snapshots) > 0 || len(recorder.Steps) > 0
		if evidence.RecorderBacked {
			evidence.RecorderKind = runtimeTraceRecorderKind
			evidence.RecorderMode = recorder.RecordingMode
			evidence.FlowStart = cloneStringAnyMap(recorder.Start)
			evidence.FlowDone = cloneStringAnyMap(recorder.Done)
			evidence.Snapshots = cloneMapSlice(recorder.Snapshots)
			evidence.Steps = cloneMapSlice(recorder.Steps)
		}
	}
	if len(evidence.TaskEvents) == 0 {
		evidence.TaskEvents = nil
	}
	if len(evidence.FlowStart) == 0 {
		evidence.FlowStart = nil
	}
	if len(evidence.FlowDone) == 0 {
		evidence.FlowDone = nil
	}
	if len(evidence.Snapshots) == 0 {
		evidence.Snapshots = nil
	}
	if len(evidence.Steps) == 0 {
		evidence.Steps = nil
	}
	if !evidence.RecorderBacked {
		evidence.RecorderKind = ""
		evidence.RecorderMode = ""
	}
	if evidence.Kind == "" {
		evidence.Kind = runTraceEvidenceKindSimulatedFallback
	}
	if evidence.RuntimeMode == "" && evidence.Kind == runTraceEvidenceKindRuntimeBacked {
		evidence.RuntimeMode = runtimeBackedTraceMode
	}
	if evidence.Kind == runTraceEvidenceKindRuntimeBacked || evidence.Kind == runTraceEvidenceKindSimulatedFallback || evidence.RecorderBacked || len(evidence.TaskEvents) > 0 || evidence.FallbackReason != "" {
		return evidence
	}
	return nil
}

func buildNormalizedRuntimeSteps(app flogoApp, flowID string, capture runTraceCaptureOptions, traceSteps []runTraceTaskStep, evidence *runtimeEvidence) []runtimeNormalizedStep {
	if evidence == nil || evidence.Kind != runTraceEvidenceKindRuntimeBacked {
		return nil
	}

	flow, flowIndex := findFlowByID(app, flowID)
	if flowIndex < 0 {
		return nil
	}

	normalized := make([]runtimeNormalizedStep, 0, len(traceSteps))
	previousFlowState := recorderFlowInputs(evidence.FlowStart)
	recorderStepsByTaskID := map[string]map[string]any{}
	for index, step := range evidence.Steps {
		taskID := runtimeRecorderPrimaryTaskID(step)
		if taskID == "" {
			taskID = fmt.Sprintf("recorder_step_%d", index)
		}
		if _, exists := recorderStepsByTaskID[taskID]; !exists {
			recorderStepsByTaskID[taskID] = step
		}
	}

	for index, traceStep := range traceSteps {
		task, _ := findTaskByID(flow, traceStep.TaskID)
		fieldSources := map[string][]string{}
		unavailableFields := []string{}

		step := runtimeNormalizedStep{
			TaskID:      traceStep.TaskID,
			TaskName:    valueOrFallback(traceStep.TaskName, valueOrFallback(task.Name, task.ID)),
			ActivityRef: valueOrFallback(traceStep.ActivityRef, task.ActivityRef),
			Type:        valueOrFallback(traceStep.Type, valueOrFallback(task.Type, "activity")),
			Status:      valueOrFallback(traceStep.Status, "completed"),
			Error:       traceStep.Error,
			StartedAt:   traceStep.StartedAt,
			FinishedAt:  traceStep.FinishedAt,
			Diagnostics: cloneDiagnostics(traceStep.Diagnostics),
		}

		if len(task.Input) > 0 {
			step.DeclaredInputMappings = cloneStringAnyMap(task.Input)
			fieldSources["declaredInputMappings"] = []string{"app_metadata"}
		}
		if len(task.Output) > 0 {
			step.DeclaredOutputMappings = cloneStringAnyMap(task.Output)
			fieldSources["declaredOutputMappings"] = []string{"app_metadata"}
		}

		if capture.IncludeTaskInputs {
			step.ResolvedInputs = cloneStringAnyMap(traceStep.Input)
			if len(step.ResolvedInputs) > 0 {
				fieldSources["resolvedInputs"] = []string{"task_event"}
			} else {
				unavailableFields = append(unavailableFields, "resolvedInputs")
			}
		} else {
			unavailableFields = append(unavailableFields, "resolvedInputs")
		}

		if capture.IncludeTaskOutputs {
			step.ProducedOutputs = cloneStringAnyMap(traceStep.Output)
			if len(step.ProducedOutputs) == 0 && runtimeActivityStateLooksLikeOutput(traceStep.ActivityState) {
				step.ProducedOutputs = cloneStringAnyMap(traceStep.ActivityState)
			}
			if len(step.ProducedOutputs) > 0 {
				fieldSources["producedOutputs"] = []string{"task_event"}
			} else {
				unavailableFields = append(unavailableFields, "producedOutputs")
			}
		} else {
			unavailableFields = append(unavailableFields, "producedOutputs")
		}

		recorderStep := recorderStepsByTaskID[traceStep.TaskID]
		if len(recorderStep) == 0 && index < len(evidence.Steps) {
			recorderStep = evidence.Steps[index]
		}
		stateDelta := runtimeRecorderStateDelta(recorderStep)
		if len(stateDelta) > 0 {
			fieldSources["stateDelta"] = []string{"flow_state_recorder_step"}
		}

		if capture.IncludeFlowState {
			step.FlowStateBefore = cloneStringAnyMap(previousFlowState)
			if len(step.FlowStateBefore) > 0 {
				if index == 0 {
					fieldSources["flowStateBefore"] = []string{"flow_state_recorder_start"}
				} else {
					fieldSources["flowStateBefore"] = []string{"flow_state_recorder_snapshot"}
				}
			}

			flowStateAfter := map[string]any{}
			if index < len(evidence.Snapshots) {
				flowStateAfter = runtimeSnapshotAttrs(evidence.Snapshots[index])
				if len(flowStateAfter) > 0 {
					fieldSources["flowStateAfter"] = []string{"flow_state_recorder_snapshot"}
				}
			}
			if len(flowStateAfter) == 0 {
				flowStateAfter = applyRuntimeStateDelta(previousFlowState, stateDelta)
				if len(flowStateAfter) > 0 {
					fieldSources["flowStateAfter"] = []string{"flow_state_recorder_step", "derived_from_previous_state"}
				}
			}
			if len(stateDelta) == 0 && (len(step.FlowStateBefore) > 0 || len(flowStateAfter) > 0) {
				stateDelta = diffRuntimeState(step.FlowStateBefore, flowStateAfter)
				if len(stateDelta) > 0 {
					fieldSources["stateDelta"] = []string{"flow_state_recorder_snapshot", "derived_from_snapshot_diff"}
				}
			}

			step.FlowStateAfter = flowStateAfter
			step.StateDelta = stateDelta
			previousFlowState = cloneStringAnyMap(flowStateAfter)
		} else {
			unavailableFields = append(unavailableFields, "flowStateBefore", "flowStateAfter", "stateDelta")
			if len(stateDelta) > 0 {
				previousFlowState = applyRuntimeStateDelta(previousFlowState, stateDelta)
			} else if index < len(evidence.Snapshots) {
				previousFlowState = runtimeSnapshotAttrs(evidence.Snapshots[index])
			}
		}

		if len(fieldSources) > 0 {
			step.EvidenceSource = fieldSources
		}
		if len(unavailableFields) > 0 {
			step.UnavailableFields = dedupeStrings(unavailableFields)
		}

		normalized = append(normalized, step)
	}

	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func runtimeActivityStateLooksLikeOutput(state map[string]any) bool {
	if len(state) == 0 {
		return false
	}
	for _, reserved := range []string{"taskStatus", "statusHistory", "change"} {
		if _, exists := state[reserved]; exists {
			return false
		}
	}
	return true
}

func runtimeEvidenceHasNormalizedSteps(evidence *runtimeEvidence) bool {
	return evidence != nil && len(evidence.NormalizedSteps) > 0
}

func runtimeEvidenceHasRestTriggerRuntime(evidence *runtimeEvidence) bool {
	return evidence != nil && evidence.RestTriggerRuntime != nil
}

func runtimeEvidenceHasCLITriggerRuntime(evidence *runtimeEvidence) bool {
	return evidence != nil && evidence.CLITriggerRuntime != nil
}

func runtimeEvidenceHasChannelTriggerRuntime(evidence *runtimeEvidence) bool {
	return evidence != nil && evidence.ChannelTriggerRuntime != nil
}

func runtimeEvidenceHasTimerTriggerRuntime(evidence *runtimeEvidence) bool {
	return evidence != nil && evidence.TimerTriggerRuntime != nil
}

func runtimeRecorderPrimaryTaskID(step map[string]any) string {
	rootChange := runtimeRecorderRootFlowChange(step)
	if taskID := strings.TrimSpace(stringValue(rootChange["taskId"])); taskID != "" {
		return taskID
	}

	tasks := mapValue(rootChange["tasks"])
	if len(tasks) == 1 {
		for taskID := range tasks {
			return taskID
		}
	}

	if len(tasks) > 1 {
		keys := make([]string, 0, len(tasks))
		for key := range tasks {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		return keys[0]
	}

	return ""
}

func runtimeRecorderRootFlowChange(step map[string]any) map[string]any {
	flowChanges := mapValue(step["flowChanges"])
	if len(flowChanges) == 0 {
		return map[string]any{}
	}

	if change := mapValue(flowChanges["0"]); len(change) > 0 {
		return change
	}

	keys := make([]string, 0, len(flowChanges))
	for key := range flowChanges {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		change := mapValue(flowChanges[key])
		if len(change) == 0 {
			continue
		}
		if strings.TrimSpace(stringValue(change["taskId"])) != "" {
			return change
		}
		if len(mapValue(change["tasks"])) > 0 || len(mapValue(change["attrs"])) > 0 {
			return change
		}
	}

	return map[string]any{}
}

func runtimeRecorderStateDelta(step map[string]any) map[string]any {
	rootChange := runtimeRecorderRootFlowChange(step)
	if len(rootChange) == 0 {
		return map[string]any{}
	}
	return stripRuntimeTraceScopes(mapValue(rootChange["attrs"]))
}

func runtimeSnapshotAttrs(snapshot map[string]any) map[string]any {
	if len(snapshot) == 0 {
		return map[string]any{}
	}
	return stripRuntimeTraceScopes(mapValue(snapshot["attrs"]))
}

func applyRuntimeStateDelta(base map[string]any, delta map[string]any) map[string]any {
	if len(base) == 0 && len(delta) == 0 {
		return map[string]any{}
	}
	next := cloneStringAnyMap(base)
	for key, value := range delta {
		next[key] = makeJSONSafe(value)
	}
	return next
}

func diffRuntimeState(before, after map[string]any) map[string]any {
	if len(before) == 0 && len(after) == 0 {
		return map[string]any{}
	}
	keys := map[string]struct{}{}
	for key := range before {
		keys[key] = struct{}{}
	}
	for key := range after {
		keys[key] = struct{}{}
	}

	diff := map[string]any{}
	for key := range keys {
		if reflect.DeepEqual(normalizeRunComparisonValue(before[key]), normalizeRunComparisonValue(after[key])) {
			continue
		}
		diff[key] = makeJSONSafe(after[key])
	}
	return diff
}

func runtimeFallbackReasonFromDiagnostics(diagnostics []diagnostic) string {
	for _, entry := range diagnostics {
		if entry.Code == "flogo.run_trace.runtime_fallback" && strings.TrimSpace(entry.Message) != "" {
			return entry.Message
		}
	}
	return ""
}

func replayRuntimeEvidence(replay replayResult) *runtimeEvidence {
	if replay.RuntimeEvidence != nil {
		return replay.RuntimeEvidence
	}
	if replay.Trace != nil {
		return replay.Trace.RuntimeEvidence
	}
	return nil
}

type runtimeTraceListener struct {
	capture           runTraceCaptureOptions
	mu                sync.Mutex
	stepOrder         []string
	steps             map[string]*runTraceTaskStep
	taskEvents        []map[string]any
	flowInstanceID    string
	flowInput         map[string]any
	flowOutput        map[string]any
	flowError         string
	flowStatus        string
	flowEventCount    int
	taskEventCount    int
	done              chan struct{}
	terminalEventOnce sync.Once
}

type runtimeTraceTaskCatalog struct {
	flow             flogoFlow
	byID             map[string]flogoTask
	idsByName        map[string][]string
	idsByActivityRef map[string][]string
}

type runtimeTraceStepAccumulator struct {
	key                string
	step               runTraceTaskStep
	task               flogoTask
	hasTask            bool
	taskEvents         []map[string]any
	recorderInput      map[string]any
	recorderFlowState  map[string]any
	recorderActivity   map[string]any
	recorderTaskStatus string
	statusHistory      []string
	evidenceSources    map[string]struct{}
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
var activityReferencePattern = regexp.MustCompile(`\$activity\[([^\]]+)\]`)

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

var triggerImportRegistry = map[string]struct {
	Alias string
	Ref   string
}{
	"rest": {
		Alias: "rest",
		Ref:   "github.com/project-flogo/contrib/trigger/rest",
	},
	"timer": {
		Alias: "timer",
		Ref:   "github.com/project-flogo/contrib/trigger/timer",
	},
	"cli": {
		Alias: "cli",
		Ref:   "github.com/project-flogo/contrib/trigger/cli",
	},
	"channel": {
		Alias: "channel",
		Ref:   "github.com/project-flogo/contrib/trigger/channel",
	},
}

const (
	runTraceEvidenceKindRuntimeBacked     = "runtime_backed"
	runTraceEvidenceKindSimulatedFallback = "simulated_fallback"
	runtimeBackedTraceMode                = "independent_action"
	runtimeBackedRESTTriggerTraceMode     = "rest_trigger"
	runtimeBackedCLITriggerTraceMode      = "cli_trigger"
	runtimeBackedTimerTriggerTraceMode    = "timer_trigger"
	runtimeBackedChannelTriggerTraceMode  = "channel_trigger"
	runtimeBackedReplayMode               = "independent_action_replay"
	runtimeBackedRESTReplayMode           = "rest_trigger_replay"
	runtimeBackedCLIReplayMode            = "cli_trigger_replay"
	runtimeBackedTimerReplayMode          = "timer_trigger_replay"
	runtimeBackedChannelReplayMode        = "channel_trigger_replay"
	runtimeTraceRecorderKind              = "flow_state_recorder"
	supportedRuntimeFlowActionRef         = "github.com/project-flogo/flow"
	supportedRuntimeLogActivityRef        = "github.com/project-flogo/contrib/activity/log"
	supportedRuntimeRESTTriggerRef        = "github.com/project-flogo/contrib/trigger/rest"
	supportedRuntimeCLITriggerRef         = "github.com/project-flogo/contrib/trigger/cli"
	supportedRuntimeChannelTriggerRef     = "github.com/project-flogo/contrib/trigger/channel"
	legacyRuntimeCLITriggerRef            = "github.com/project-flogo/trigger/cli"
	supportedRuntimeTimerTriggerRef       = "github.com/project-flogo/contrib/trigger/timer"
	runtimeTraceRecorderServiceName       = "runtime-trace-recorder"
)

var runtimeTraceMutex sync.Mutex
var runtimeTraceSupportOnce sync.Once
var runtimeTraceRecorderSingleton = newRuntimeTraceRecorderBridge(runtimeTraceRecorderServiceName)
var runtimeRestTriggerSingleton = newRuntimeRestTrigger()
var runtimeCliTriggerSingleton = newRuntimeCliTrigger()
var runtimeTraceRecorderFactoryRef = ""

var supportedRuntimeActivityRefs = map[string]bool{
	supportedRuntimeLogActivityRef: true,
}

func main() {
	if len(os.Args) < 3 {
		fail("expected a command such as 'catalog contribs', 'inspect descriptor', 'preview mapping', 'contrib scaffold-activity', or 'contrib scaffold-trigger'")
	}

	command := strings.Join(os.Args[1:3], " ")
	if command == "contrib scaffold-activity" {
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(scaffoldActivity(loadActivityScaffoldRequest(requestPath)))
		return
	}
	if command == "contrib scaffold-trigger" {
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(scaffoldTrigger(loadTriggerScaffoldRequest(requestPath)))
		return
	}

	appPath := lookupFlag("--app")
	if appPath == "" {
		fail("missing required --app flag")
	}

	app := loadApp(appPath)

	switch command {
	case "flows contracts":
		flowID := lookupFlag("--flow")
		result := inferFlowContracts(app)
		if flowID != "" {
			filtered := []flowContract{}
			for _, contract := range result.Contracts {
				if contract.FlowID == flowID {
					filtered = append(filtered, contract)
				}
			}
			if len(filtered) == 0 {
				fail(fmt.Sprintf("flow contract %q was not found", flowID))
			}
			result.Contracts = filtered
		}
		encode(flowContractsResponse{Contracts: result})
	case "flows trace":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(traceFlow(app, loadRunTraceRequest(requestPath)))
	case "flows replay":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(replayFlow(app, loadReplayRequest(requestPath)))
	case "flows compare-runs":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(compareRuns(loadCompareRunsRequest(requestPath)))
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
	case "triggers bind":
		flowID := lookupFlag("--flow")
		profilePath := lookupFlag("--profile")
		if flowID == "" {
			fail("missing required --flow flag")
		}
		if profilePath == "" {
			fail("missing required --profile flag")
		}
		profile := loadTriggerProfile(profilePath)
		request := triggerBindingRequest{
			FlowID:          flowID,
			Profile:         profile,
			ValidateOnly:    hasFlag("--validate-only"),
			ReplaceExisting: hasFlag("--replace-existing"),
			HandlerName:     lookupFlag("--handler-name"),
			TriggerID:       lookupFlag("--trigger-id"),
		}
		encode(bindTrigger(app, request))
	case "flows extract-subflow":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(extractSubflow(app, loadSubflowExtractionRequest(requestPath)))
	case "flows inline-subflow":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(inlineSubflow(app, loadSubflowInliningRequest(requestPath)))
	case "flows add-iterator":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(addIterator(app, loadIteratorSynthesisRequest(requestPath)))
	case "flows add-retry-policy":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(addRetryPolicy(app, loadRetryPolicyRequest(requestPath)))
	case "flows add-dowhile":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(addDoWhile(app, loadDoWhileSynthesisRequest(requestPath)))
	case "flows add-error-path":
		requestPath := lookupFlag("--request")
		if requestPath == "" {
			fail("missing required --request flag")
		}
		encode(addErrorPath(app, loadErrorPathTemplateRequest(requestPath)))
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

func loadActivityScaffoldRequest(inputPath string) activityScaffoldRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request activityScaffoldRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.Version == "" {
		request.Version = "0.0.1"
	}
	if request.Settings == nil {
		request.Settings = []contribField{}
	}
	if request.Inputs == nil {
		request.Inputs = []contribField{}
	}
	if request.Outputs == nil {
		request.Outputs = []contribField{}
	}

	return request
}

func loadTriggerScaffoldRequest(inputPath string) triggerScaffoldRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request triggerScaffoldRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.Version == "" {
		request.Version = "0.0.1"
	}
	if request.Settings == nil {
		request.Settings = []contribField{}
	}
	if request.HandlerSettings == nil {
		request.HandlerSettings = []contribField{}
	}
	if request.Outputs == nil {
		request.Outputs = []contribField{}
	}
	if request.Replies == nil {
		request.Replies = []contribField{}
	}

	return request
}

const scaffoldedContributionCoreVersion = "v1.6.17"
const scaffoldedContributionGoVersion = "1.24.0"

func scaffoldActivity(request activityScaffoldRequest) activityScaffoldResponse {
	if err := validateActivityScaffoldRequest(request); err != nil {
		fail(err.Error())
	}

	packageName := sanitizePackageName(valueOrFallback(request.PackageName, request.ActivityName))
	descriptor := buildScaffoldedActivityDescriptor(request, packageName)
	bundleRoot, err := os.MkdirTemp("", fmt.Sprintf("flogo-activity-%s-", packageName))
	if err != nil {
		fail(err.Error())
	}

	files, err := writeScaffoldedActivityFiles(bundleRoot, request, descriptor, packageName)
	if err != nil {
		fail(err.Error())
	}

	validation, buildProof, testProof := runContributionScaffoldProof(
		bundleRoot,
		"Activity",
		"flogo.contrib.activity",
	)

	return activityScaffoldResponse{
		Result: activityScaffoldResult{
			Bundle: activityScaffoldBundle{
				Kind:        "activity",
				ModulePath:  strings.TrimSpace(request.ModulePath),
				PackageName: packageName,
				BundleRoot:  bundleRoot,
				Descriptor:  descriptor,
				Files:       files,
				ReadmePath:  filepath.ToSlash(filepath.Join(bundleRoot, "README.md")),
			},
			Validation: validation,
			Build:      buildProof,
			Test:       testProof,
		},
	}
}

func scaffoldTrigger(request triggerScaffoldRequest) triggerScaffoldResponse {
	if err := validateTriggerScaffoldRequest(request); err != nil {
		fail(err.Error())
	}

	packageName := sanitizePackageName(valueOrFallback(request.PackageName, request.TriggerName))
	descriptor := buildScaffoldedTriggerDescriptor(request, packageName)
	bundleRoot, err := os.MkdirTemp("", fmt.Sprintf("flogo-trigger-%s-", packageName))
	if err != nil {
		fail(err.Error())
	}

	files, err := writeScaffoldedTriggerFiles(bundleRoot, request, descriptor, packageName)
	if err != nil {
		fail(err.Error())
	}

	validation, buildProof, testProof := runContributionScaffoldProof(
		bundleRoot,
		"Trigger",
		"flogo.contrib.trigger",
	)

	return triggerScaffoldResponse{
		Result: triggerScaffoldResult{
			Bundle: triggerScaffoldBundle{
				Kind:        "trigger",
				ModulePath:  strings.TrimSpace(request.ModulePath),
				PackageName: packageName,
				BundleRoot:  bundleRoot,
				Descriptor:  descriptor,
				Files:       files,
				ReadmePath:  filepath.ToSlash(filepath.Join(bundleRoot, "README.md")),
			},
			Validation: validation,
			Build:      buildProof,
			Test:       testProof,
		},
	}
}

func validateActivityScaffoldRequest(request activityScaffoldRequest) error {
	problems := []string{}
	if strings.TrimSpace(request.ActivityName) == "" {
		problems = append(problems, "activityName is required")
	}
	if strings.TrimSpace(request.ModulePath) == "" {
		problems = append(problems, "modulePath is required")
	}
	if strings.TrimSpace(request.Title) == "" {
		problems = append(problems, "title is required")
	}
	if strings.TrimSpace(request.Description) == "" {
		problems = append(problems, "description is required")
	}

	for _, group := range []struct {
		name   string
		fields []contribField
	}{
		{name: "settings", fields: request.Settings},
		{name: "inputs", fields: request.Inputs},
		{name: "outputs", fields: request.Outputs},
	} {
		for _, field := range group.fields {
			if strings.TrimSpace(field.Name) == "" {
				problems = append(problems, fmt.Sprintf("%s field names must be non-empty", group.name))
			}
			switch normalizeScaffoldFieldType(field.Type) {
			case "string", "integer", "number", "boolean", "object", "array", "any":
			default:
				problems = append(problems, fmt.Sprintf("unsupported activity scaffold field type %q in %s", field.Type, group.name))
			}
		}
	}

	if len(problems) > 0 {
		return fmt.Errorf("%s", strings.Join(problems, "; "))
	}

	return nil
}

func validateTriggerScaffoldRequest(request triggerScaffoldRequest) error {
	problems := []string{}
	if strings.TrimSpace(request.TriggerName) == "" {
		problems = append(problems, "triggerName is required")
	}
	if strings.TrimSpace(request.ModulePath) == "" {
		problems = append(problems, "modulePath is required")
	}
	if strings.TrimSpace(request.Title) == "" {
		problems = append(problems, "title is required")
	}
	if strings.TrimSpace(request.Description) == "" {
		problems = append(problems, "description is required")
	}

	for _, group := range []struct {
		name   string
		fields []contribField
	}{
		{name: "settings", fields: request.Settings},
		{name: "handlerSettings", fields: request.HandlerSettings},
		{name: "outputs", fields: request.Outputs},
		{name: "replies", fields: request.Replies},
	} {
		for _, field := range group.fields {
			if strings.TrimSpace(field.Name) == "" {
				problems = append(problems, fmt.Sprintf("%s field names must be non-empty", group.name))
			}
			switch normalizeScaffoldFieldType(field.Type) {
			case "string", "integer", "number", "boolean", "object", "array", "any":
			default:
				problems = append(problems, fmt.Sprintf("unsupported trigger scaffold field type %q in %s", field.Type, group.name))
			}
		}
	}

	if len(problems) > 0 {
		return fmt.Errorf("%s", strings.Join(problems, "; "))
	}

	return nil
}

func buildScaffoldedActivityDescriptor(request activityScaffoldRequest, packageName string) contribDescriptor {
	descriptorName := slugify(valueOrFallback(request.ActivityName, packageName))
	return contribDescriptor{
		Ref:      strings.TrimSpace(request.ModulePath),
		Alias:    packageName,
		Type:     "activity",
		Name:     descriptorName,
		Version:  valueOrFallback(strings.TrimSpace(request.Version), "0.0.1"),
		Title:    strings.TrimSpace(request.Title),
		Settings: request.Settings,
		Inputs:   request.Inputs,
		Outputs:  request.Outputs,
		Examples: []string{fmt.Sprintf("Import %q and use %q in your Flogo app.", strings.TrimSpace(request.ModulePath), descriptorName)},
		Source:   "activity_scaffold",
		CompatibilityNotes: []string{
			"Generated by the Phase 4.1 activity scaffold foundation.",
			"Review the generated Eval logic before installing the activity into an application.",
		},
	}
}

func buildScaffoldedTriggerDescriptor(request triggerScaffoldRequest, packageName string) contribDescriptor {
	descriptorName := slugify(valueOrFallback(request.TriggerName, packageName))
	return contribDescriptor{
		Ref:             strings.TrimSpace(request.ModulePath),
		Alias:           packageName,
		Type:            "trigger",
		Name:            descriptorName,
		Version:         valueOrFallback(strings.TrimSpace(request.Version), "0.0.1"),
		Title:           strings.TrimSpace(request.Title),
		Settings:        request.Settings,
		HandlerSettings: request.HandlerSettings,
		Outputs:         request.Outputs,
		Reply:           request.Replies,
		Examples: []string{
			fmt.Sprintf("Import %q and bind %q to a flow handler before publishing the trigger.", strings.TrimSpace(request.ModulePath), descriptorName),
		},
		Source: "trigger_scaffold",
		CompatibilityNotes: []string{
			"Generated by the Phase 4.2 trigger scaffold foundation.",
			"Review Start, handler dispatch, and reply wiring before installing the trigger into an application.",
		},
	}
}

func writeScaffoldedActivityFiles(bundleRoot string, request activityScaffoldRequest, descriptor contribDescriptor, packageName string) ([]generatedContribFile, error) {
	if err := os.MkdirAll(bundleRoot, 0o755); err != nil {
		return nil, err
	}

	files := []generatedContribFile{}
	write := func(relPath string, kind string, content string) error {
		fullPath := filepath.Join(bundleRoot, relPath)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
			return err
		}
		files = append(files, generatedContribFile{
			Path:    filepath.ToSlash(fullPath),
			Kind:    kind,
			Bytes:   len(content),
			Content: content,
		})
		return nil
	}

	if err := write("descriptor.json", "descriptor", renderActivityDescriptorJSON(request, descriptor)); err != nil {
		return nil, err
	}
	if err := write("go.mod", "module", renderActivityGoMod(request)); err != nil {
		return nil, err
	}
	if err := write("metadata.go", "metadata", renderActivityMetadata(request, packageName)); err != nil {
		return nil, err
	}
	if err := write("activity.go", "implementation", renderActivityImplementation(request, packageName)); err != nil {
		return nil, err
	}
	if err := write("activity_test.go", "test", renderActivityTest(request, packageName)); err != nil {
		return nil, err
	}
	if err := write("README.md", "readme", renderActivityReadme(request, descriptor, packageName)); err != nil {
		return nil, err
	}

	return files, nil
}

func writeScaffoldedTriggerFiles(bundleRoot string, request triggerScaffoldRequest, descriptor contribDescriptor, packageName string) ([]generatedContribFile, error) {
	if err := os.MkdirAll(bundleRoot, 0o755); err != nil {
		return nil, err
	}

	files := []generatedContribFile{}
	write := func(relPath string, kind string, content string) error {
		fullPath := filepath.Join(bundleRoot, relPath)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
			return err
		}
		files = append(files, generatedContribFile{
			Path:    filepath.ToSlash(fullPath),
			Kind:    kind,
			Bytes:   len(content),
			Content: content,
		})
		return nil
	}

	if err := write("descriptor.json", "descriptor", renderTriggerDescriptorJSON(request, descriptor)); err != nil {
		return nil, err
	}
	if err := write("go.mod", "module", renderContributionGoMod(strings.TrimSpace(request.ModulePath))); err != nil {
		return nil, err
	}
	if err := write("metadata.go", "metadata", renderTriggerMetadata(request, packageName)); err != nil {
		return nil, err
	}
	if err := write("trigger.go", "implementation", renderTriggerImplementation(request, packageName)); err != nil {
		return nil, err
	}
	if err := write("trigger_test.go", "test", renderTriggerTest(request, packageName)); err != nil {
		return nil, err
	}
	if err := write("README.md", "readme", renderTriggerReadme(request, descriptor, packageName)); err != nil {
		return nil, err
	}

	return files, nil
}

func renderActivityDescriptorJSON(request activityScaffoldRequest, descriptor contribDescriptor) string {
	payload := map[string]any{
		"name":        descriptor.Name,
		"type":        "flogo:activity",
		"version":     descriptor.Version,
		"title":       descriptor.Title,
		"description": strings.TrimSpace(request.Description),
		"settings":    descriptor.Settings,
		"input":       descriptor.Inputs,
		"output":      descriptor.Outputs,
	}
	if request.Homepage != "" {
		payload["homepage"] = strings.TrimSpace(request.Homepage)
	}

	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		fail(err.Error())
	}
	return string(bytes) + "\n"
}

func renderTriggerDescriptorJSON(request triggerScaffoldRequest, descriptor contribDescriptor) string {
	payload := map[string]any{
		"name":        descriptor.Name,
		"type":        "flogo:trigger",
		"version":     descriptor.Version,
		"title":       descriptor.Title,
		"description": strings.TrimSpace(request.Description),
		"settings":    descriptor.Settings,
		"output":      descriptor.Outputs,
		"reply":       descriptor.Reply,
		"handler": map[string]any{
			"settings": descriptor.HandlerSettings,
		},
	}
	if request.Homepage != "" {
		payload["homepage"] = strings.TrimSpace(request.Homepage)
	}

	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		fail(err.Error())
	}
	return string(bytes) + "\n"
}

func renderContributionGoMod(modulePath string) string {
	return fmt.Sprintf("module %s\n\ngo %s\n\nrequire github.com/project-flogo/core %s\n",
		strings.TrimSpace(modulePath),
		scaffoldedContributionGoVersion,
		scaffoldedContributionCoreVersion,
	)
}

func renderActivityGoMod(request activityScaffoldRequest) string {
	return renderContributionGoMod(request.ModulePath)
}

func renderActivityMetadata(request activityScaffoldRequest, packageName string) string {
	useCoerce := scaffoldFieldsRequireCoerce(request.Inputs, request.Outputs)
	var builder strings.Builder
	builder.WriteString("package " + packageName + "\n\n")
	if useCoerce {
		builder.WriteString("import \"github.com/project-flogo/core/data/coerce\"\n\n")
	}

	builder.WriteString(renderMetadataStruct("Settings", request.Settings))
	builder.WriteString("\n")
	builder.WriteString(renderMetadataStruct("Input", request.Inputs))
	builder.WriteString("\n")
	builder.WriteString(renderFromMapMethod("Input", "r", request.Inputs))
	builder.WriteString("\n")
	builder.WriteString(renderToMapMethod("Input", "r", request.Inputs))
	builder.WriteString("\n")
	builder.WriteString(renderMetadataStruct("Output", request.Outputs))
	builder.WriteString("\n")
	builder.WriteString(renderFromMapMethod("Output", "o", request.Outputs))
	builder.WriteString("\n")
	builder.WriteString(renderToMapMethod("Output", "o", request.Outputs))

	return builder.String()
}

func renderTriggerMetadata(request triggerScaffoldRequest, packageName string) string {
	useCoerce := scaffoldFieldsRequireCoerce(request.Outputs, request.Replies)
	var builder strings.Builder
	builder.WriteString("package " + packageName + "\n\n")
	if useCoerce {
		builder.WriteString("import \"github.com/project-flogo/core/data/coerce\"\n\n")
	}

	builder.WriteString(renderMetadataStruct("Settings", request.Settings))
	builder.WriteString("\n")
	builder.WriteString(renderMetadataStruct("HandlerSettings", request.HandlerSettings))
	builder.WriteString("\n")
	builder.WriteString(renderMetadataStruct("Output", request.Outputs))
	builder.WriteString("\n")
	builder.WriteString(renderFromMapMethod("Output", "o", request.Outputs))
	builder.WriteString("\n")
	builder.WriteString(renderToMapMethod("Output", "o", request.Outputs))
	builder.WriteString("\n")
	builder.WriteString(renderMetadataStruct("Reply", request.Replies))
	builder.WriteString("\n")
	builder.WriteString(renderFromMapMethod("Reply", "r", request.Replies))
	builder.WriteString("\n")
	builder.WriteString(renderToMapMethod("Reply", "r", request.Replies))

	return builder.String()
}

func renderMetadataStruct(structName string, fields []contribField) string {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("type %s struct {\n", structName))
	for _, field := range fields {
		builder.WriteString(fmt.Sprintf("\t%s %s `%s`\n",
			exportedIdentifier(field.Name),
			goTypeForField(field),
			metadataTag(field),
		))
	}
	builder.WriteString("}\n")
	return builder.String()
}

func renderFromMapMethod(structName string, receiver string, fields []contribField) string {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("func (%s *%s) FromMap(values map[string]interface{}) error {\n", receiver, structName))
	if len(fields) == 0 {
		builder.WriteString("\treturn nil\n}\n")
		return builder.String()
	}
	for index, field := range fields {
		goField := exportedIdentifier(field.Name)
		valueName := fmt.Sprintf("value%d", index)
		if normalizeScaffoldFieldType(field.Type) == "any" {
			builder.WriteString(fmt.Sprintf("\t%s.%s = values[%q]\n", receiver, goField, field.Name))
			continue
		}
		builder.WriteString(fmt.Sprintf("\t%s, err := %s(values[%q])\n", valueName, coerceFuncForField(field), field.Name))
		builder.WriteString("\tif err != nil {\n\t\treturn err\n\t}\n")
		builder.WriteString(fmt.Sprintf("\t%s.%s = %s\n", receiver, goField, valueName))
	}
	builder.WriteString("\treturn nil\n}\n")
	return builder.String()
}

func renderToMapMethod(structName string, receiver string, fields []contribField) string {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("func (%s *%s) ToMap() map[string]interface{} {\n", receiver, structName))
	builder.WriteString("\treturn map[string]interface{}{\n")
	for _, field := range fields {
		builder.WriteString(fmt.Sprintf("\t\t%q: %s.%s,\n", field.Name, receiver, exportedIdentifier(field.Name)))
	}
	builder.WriteString("\t}\n}\n")
	return builder.String()
}

func renderActivityImplementation(request activityScaffoldRequest, packageName string) string {
	var builder strings.Builder
	builder.WriteString("package " + packageName + "\n\n")
	builder.WriteString("import (\n")
	builder.WriteString("\t\"github.com/project-flogo/core/activity\"\n")
	builder.WriteString("\t\"github.com/project-flogo/core/data/metadata\"\n")
	builder.WriteString(")\n\n")
	builder.WriteString("func init() {\n")
	builder.WriteString("\t_ = activity.Register(&Activity{}, New)\n")
	builder.WriteString("}\n\n")
	builder.WriteString("var activityMd = activity.ToMetadata(&Settings{}, &Input{}, &Output{})\n\n")
	builder.WriteString("// New creates one activity instance per configured handler.\n")
	builder.WriteString("func New(ctx activity.InitContext) (activity.Activity, error) {\n")
	builder.WriteString("\tsettings := &Settings{}\n")
	builder.WriteString("\tif err := metadata.MapToStruct(ctx.Settings(), settings, true); err != nil {\n")
	builder.WriteString("\t\treturn nil, err\n\t}\n")
	builder.WriteString("\treturn &Activity{}, nil\n")
	builder.WriteString("}\n\n")
	builder.WriteString("// Activity is a scaffolded Flogo activity. Review Eval before production use.\n")
	builder.WriteString("type Activity struct{}\n\n")
	builder.WriteString("func (a *Activity) Metadata() *activity.Metadata {\n")
	builder.WriteString("\treturn activityMd\n")
	builder.WriteString("}\n\n")
	builder.WriteString("func (a *Activity) Eval(ctx activity.Context) (done bool, err error) {\n")
	builder.WriteString("\tinput := &Input{}\n")
	builder.WriteString("\tif err = ctx.GetInputObject(input); err != nil {\n")
	builder.WriteString("\t\treturn true, err\n\t}\n")
	builder.WriteString("\toutput := &Output{}\n")
	builder.WriteString("\tif err = ctx.SetOutputObject(output); err != nil {\n")
	builder.WriteString("\t\treturn true, err\n\t}\n")
	builder.WriteString("\treturn true, nil\n")
	builder.WriteString("}\n")
	return builder.String()
}

func renderTriggerImplementation(request triggerScaffoldRequest, packageName string) string {
	var builder strings.Builder
	builder.WriteString("package " + packageName + "\n\n")
	builder.WriteString("import (\n")
	builder.WriteString("\t\"github.com/project-flogo/core/data/metadata\"\n")
	builder.WriteString("\t\"github.com/project-flogo/core/trigger\"\n")
	builder.WriteString(")\n\n")
	builder.WriteString("func init() {\n")
	builder.WriteString("\t_ = trigger.Register(&Trigger{}, &Factory{})\n")
	builder.WriteString("}\n\n")
	builder.WriteString("var triggerMd = trigger.NewMetadata(&Settings{}, &HandlerSettings{}, &Output{}, &Reply{})\n\n")
	builder.WriteString("// Factory creates configured trigger instances for the generated scaffold.\n")
	builder.WriteString("type Factory struct{}\n\n")
	builder.WriteString("func (f *Factory) Metadata() *trigger.Metadata {\n")
	builder.WriteString("\treturn triggerMd\n")
	builder.WriteString("}\n\n")
	builder.WriteString("func (f *Factory) New(config *trigger.Config) (trigger.Trigger, error) {\n")
	builder.WriteString("\tsettings := &Settings{}\n")
	builder.WriteString("\tif err := metadata.MapToStruct(config.Settings, settings, true); err != nil {\n")
	builder.WriteString("\t\treturn nil, err\n\t}\n")
	builder.WriteString("\treturn &Trigger{settings: settings}, nil\n")
	builder.WriteString("}\n\n")
	builder.WriteString("// Trigger is a scaffolded Flogo trigger. Review handler dispatch before production use.\n")
	builder.WriteString("type Trigger struct {\n")
	builder.WriteString("\tsettings *Settings\n")
	builder.WriteString("\thandlers []trigger.Handler\n")
	builder.WriteString("}\n\n")
	builder.WriteString("func (t *Trigger) Metadata() *trigger.Metadata {\n")
	builder.WriteString("\treturn triggerMd\n")
	builder.WriteString("}\n\n")
	builder.WriteString("func (t *Trigger) Initialize(ctx trigger.InitContext) error {\n")
	builder.WriteString("\tt.handlers = ctx.GetHandlers()\n")
	builder.WriteString("\tfor _, handler := range t.handlers {\n")
	builder.WriteString("\t\thandlerSettings := &HandlerSettings{}\n")
	builder.WriteString("\t\tif err := metadata.MapToStruct(handler.Settings(), handlerSettings, true); err != nil {\n")
	builder.WriteString("\t\t\treturn err\n\t\t}\n")
	builder.WriteString("\t}\n")
	builder.WriteString("\treturn nil\n")
	builder.WriteString("}\n\n")
	builder.WriteString("// Start is where the scaffold should connect its event source to configured handlers.\n")
	builder.WriteString("func (t *Trigger) Start() error {\n")
	builder.WriteString("\treturn nil\n")
	builder.WriteString("}\n\n")
	builder.WriteString("func (t *Trigger) Stop() error {\n")
	builder.WriteString("\treturn nil\n")
	builder.WriteString("}\n")
	return builder.String()
}

func renderActivityTest(request activityScaffoldRequest, packageName string) string {
	var builder strings.Builder
	builder.WriteString("package " + packageName + "\n\n")
	builder.WriteString("import (\n")
	builder.WriteString("\t\"testing\"\n\n")
	builder.WriteString("\t\"github.com/project-flogo/core/activity\"\n")
	builder.WriteString("\t\"github.com/project-flogo/core/support/test\"\n")
	builder.WriteString(")\n\n")
	builder.WriteString("func TestRegister(t *testing.T) {\n")
	builder.WriteString("\tref := activity.GetRef(&Activity{})\n")
	builder.WriteString("\tif activity.Get(ref) == nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"expected activity %s to be registered\", ref)\n\t}\n")
	builder.WriteString("}\n\n")
	builder.WriteString("func TestEval(t *testing.T) {\n")
	builder.WriteString("\tact := &Activity{}\n")
	builder.WriteString("\ttc := test.NewActivityContext(act.Metadata())\n")
	builder.WriteString("\tinput := &Input{\n")
	for _, field := range request.Inputs {
		builder.WriteString(fmt.Sprintf("\t\t%s: %s,\n", exportedIdentifier(field.Name), goLiteralForField(field)))
	}
	builder.WriteString("\t}\n")
	builder.WriteString("\tif err := tc.SetInputObject(input); err != nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"set input: %v\", err)\n\t}\n")
	builder.WriteString("\tdone, err := act.Eval(tc)\n")
	builder.WriteString("\tif err != nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"eval: %v\", err)\n\t}\n")
	builder.WriteString("\tif !done {\n")
	builder.WriteString("\t\tt.Fatal(\"expected Eval to report done\")\n\t}\n")
	builder.WriteString("\toutput := &Output{}\n")
	builder.WriteString("\tif err := tc.GetOutputObject(output); err != nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"get output: %v\", err)\n\t}\n")
	builder.WriteString("}\n")
	return builder.String()
}

func renderTriggerTest(request triggerScaffoldRequest, packageName string) string {
	var builder strings.Builder
	builder.WriteString("package " + packageName + "\n\n")
	builder.WriteString("import (\n")
	builder.WriteString("\t\"testing\"\n\n")
	builder.WriteString("\t\"github.com/project-flogo/core/support\"\n")
	builder.WriteString("\t\"github.com/project-flogo/core/trigger\"\n")
	builder.WriteString(")\n\n")
	builder.WriteString("func TestRegister(t *testing.T) {\n")
	builder.WriteString("\tref := support.GetRef(&Trigger{})\n")
	builder.WriteString("\tif trigger.GetFactory(ref) == nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"expected trigger factory %s to be registered\", ref)\n\t}\n")
	builder.WriteString("}\n\n")
	builder.WriteString("func TestFactoryNew(t *testing.T) {\n")
	builder.WriteString("\tfactory := &Factory{}\n")
	builder.WriteString("\tinstance, err := factory.New(&trigger.Config{\n")
	builder.WriteString("\t\tId: \"sample-trigger\",\n")
	builder.WriteString("\t\tSettings: map[string]interface{}{\n")
	for _, field := range request.Settings {
		builder.WriteString(fmt.Sprintf("\t\t\t%q: %s,\n", field.Name, goLiteralForField(field)))
	}
	builder.WriteString("\t\t},\n")
	builder.WriteString("\t})\n")
	builder.WriteString("\tif err != nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"new trigger: %v\", err)\n\t}\n")
	builder.WriteString("\tif instance == nil {\n")
	builder.WriteString("\t\tt.Fatal(\"expected trigger instance\")\n\t}\n")
	builder.WriteString("\tif factory.Metadata() == nil {\n")
	builder.WriteString("\t\tt.Fatal(\"expected metadata to be initialized\")\n\t}\n")
	builder.WriteString("\tif err := instance.Start(); err != nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"start trigger: %v\", err)\n\t}\n")
	builder.WriteString("\tif err := instance.Stop(); err != nil {\n")
	builder.WriteString("\t\tt.Fatalf(\"stop trigger: %v\", err)\n\t}\n")
	builder.WriteString("}\n")
	return builder.String()
}

func renderActivityReadme(request activityScaffoldRequest, descriptor contribDescriptor, packageName string) string {
	var builder strings.Builder
	builder.WriteString("# " + valueOrFallback(strings.TrimSpace(request.Title), request.ActivityName) + "\n\n")
	builder.WriteString(strings.TrimSpace(request.Description) + "\n\n")
	builder.WriteString("## Generated bundle\n\n")
	builder.WriteString("- module path: `" + strings.TrimSpace(request.ModulePath) + "`\n")
	builder.WriteString("- package name: `" + packageName + "`\n")
	builder.WriteString("- activity ref: `" + descriptor.Ref + "`\n")
	builder.WriteString("- version: `" + descriptor.Version + "`\n\n")
	builder.WriteString("## Files\n\n")
	builder.WriteString("- `descriptor.json`\n")
	builder.WriteString("- `go.mod`\n")
	builder.WriteString("- `metadata.go`\n")
	builder.WriteString("- `activity.go`\n")
	builder.WriteString("- `activity_test.go`\n\n")
	builder.WriteString("## Review note\n\n")
	builder.WriteString("This is a scaffold foundation bundle. Review `Eval` and metadata before publishing or wiring it into an app.\n")
	return builder.String()
}

func renderTriggerReadme(request triggerScaffoldRequest, descriptor contribDescriptor, packageName string) string {
	var builder strings.Builder
	builder.WriteString("# " + valueOrFallback(strings.TrimSpace(request.Title), request.TriggerName) + "\n\n")
	builder.WriteString(strings.TrimSpace(request.Description) + "\n\n")
	builder.WriteString("## Generated bundle\n\n")
	builder.WriteString("- module path: `" + strings.TrimSpace(request.ModulePath) + "`\n")
	builder.WriteString("- package name: `" + packageName + "`\n")
	builder.WriteString("- trigger ref: `" + descriptor.Ref + "`\n")
	builder.WriteString("- version: `" + descriptor.Version + "`\n\n")
	builder.WriteString("## Files\n\n")
	builder.WriteString("- `descriptor.json`\n")
	builder.WriteString("- `go.mod`\n")
	builder.WriteString("- `metadata.go`\n")
	builder.WriteString("- `trigger.go`\n")
	builder.WriteString("- `trigger_test.go`\n\n")
	builder.WriteString("## Review note\n\n")
	builder.WriteString("This is a scaffold foundation bundle. Review handler dispatch, reply wiring, and Start/Stop behavior before publishing or wiring the trigger into an app.\n")
	if strings.TrimSpace(request.Usage) != "" {
		builder.WriteString("\n## Usage note\n\n")
		builder.WriteString(strings.TrimSpace(request.Usage) + "\n")
	}
	return builder.String()
}

func runGoContributionCommand(dir string, args ...string) contribProofStep {
	command := append([]string{"go"}, args...)
	cmd := exec.Command("go", args...)
	cmd.Dir = dir
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		exitCode = 1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}
	output := strings.TrimSpace(stdout.String())
	if stderr.String() != "" {
		if output != "" {
			output += "\n"
		}
		output += strings.TrimSpace(stderr.String())
	}
	kind := "build"
	if len(args) > 0 && args[0] == "test" {
		kind = "test"
	}
	summary := fmt.Sprintf("go %s succeeded", strings.Join(args, " "))
	if err != nil {
		summary = fmt.Sprintf("go %s failed", strings.Join(args, " "))
	}
	return contribProofStep{
		Kind:     kind,
		Ok:       err == nil,
		Command:  command,
		ExitCode: exitCode,
		Summary:  summary,
		Output:   output,
	}
}

func runContributionScaffoldProof(bundleRoot string, contributionLabel string, diagnosticPrefix string) (validationReport, contribProofStep, contribProofStep) {
	prepareProof := runGoContributionCommand(bundleRoot, "mod", "tidy")
	testProof := runGoContributionCommand(bundleRoot, "test", "./...")
	buildProof := runGoContributionCommand(bundleRoot, "build", "./...")
	validation := buildContributionScaffoldValidation(contributionLabel, diagnosticPrefix, prepareProof, testProof, buildProof)
	return validation, buildProof, testProof
}

func buildContributionScaffoldValidation(contributionLabel string, diagnosticPrefix string, prepareProof contribProofStep, testProof contribProofStep, buildProof contribProofStep) validationReport {
	stages := []validationStageResult{
		{Stage: "structural", Ok: prepareProof.Ok, Diagnostics: diagnosticsForProof(prepareProof, diagnosticPrefix+".module_prepare_failed")},
		{Stage: "regression", Ok: testProof.Ok, Diagnostics: diagnosticsForProof(testProof, diagnosticPrefix+".test_failed")},
		{Stage: "build", Ok: buildProof.Ok, Diagnostics: diagnosticsForProof(buildProof, diagnosticPrefix+".build_failed")},
	}
	ok := prepareProof.Ok && buildProof.Ok && testProof.Ok
	summary := fmt.Sprintf("%s scaffold generated and passed isolated go test/build proof.", contributionLabel)
	if !ok {
		summary = fmt.Sprintf("%s scaffold generated but isolated go test/build proof failed.", contributionLabel)
	}
	return validationReport{
		Ok:        ok,
		Stages:    stages,
		Summary:   summary,
		Artifacts: []map[string]any{},
	}
}

func diagnosticsForProof(step contribProofStep, code string) []diagnostic {
	if step.Ok {
		return []diagnostic{}
	}
	return []diagnostic{{
		Code:     code,
		Message:  step.Summary,
		Severity: "error",
		Details: map[string]any{
			"command": step.Command,
			"output":  step.Output,
		},
	}}
}

func metadataTag(field contribField) string {
	if field.Required {
		return fmt.Sprintf("md:\"%s,required\"", field.Name)
	}
	return fmt.Sprintf("md:\"%s\"", field.Name)
}

func scaffoldFieldsRequireCoerce(groups ...[]contribField) bool {
	for _, fields := range groups {
		for _, field := range fields {
			if normalizeScaffoldFieldType(field.Type) != "any" {
				return true
			}
		}
	}
	return false
}

func normalizeScaffoldFieldType(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return "any"
	}
	return normalized
}

func goTypeForField(field contribField) string {
	switch normalizeScaffoldFieldType(field.Type) {
	case "string":
		return "string"
	case "integer":
		return "int"
	case "number":
		return "float64"
	case "boolean":
		return "bool"
	case "object":
		return "map[string]interface{}"
	case "array":
		return "[]interface{}"
	default:
		return "interface{}"
	}
}

func coerceFuncForField(field contribField) string {
	switch normalizeScaffoldFieldType(field.Type) {
	case "string":
		return "coerce.ToString"
	case "integer":
		return "coerce.ToInt"
	case "number":
		return "coerce.ToFloat64"
	case "boolean":
		return "coerce.ToBool"
	case "object":
		return "coerce.ToObject"
	case "array":
		return "coerce.ToArray"
	default:
		return ""
	}
}

func goLiteralForField(field contribField) string {
	switch normalizeScaffoldFieldType(field.Type) {
	case "string":
		return "\"sample\""
	case "integer":
		return "7"
	case "number":
		return "7.5"
	case "boolean":
		return "true"
	case "object":
		return "map[string]interface{}{\"sample\": \"value\"}"
	case "array":
		return "[]interface{}{\"sample\"}"
	default:
		return "\"sample\""
	}
}

func sanitizePackageName(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(normalized, "_")
	normalized = strings.Trim(normalized, "_")
	if normalized == "" {
		return "activity"
	}
	if normalized[0] >= '0' && normalized[0] <= '9' {
		return "activity_" + normalized
	}
	return normalized
}

func exportedIdentifier(value string) string {
	parts := regexp.MustCompile(`[^a-zA-Z0-9]+`).Split(strings.TrimSpace(value), -1)
	var builder strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		lower := strings.ToLower(part)
		builder.WriteString(strings.ToUpper(lower[:1]))
		if len(lower) > 1 {
			builder.WriteString(lower[1:])
		}
	}
	identifier := builder.String()
	if identifier == "" {
		return "Field"
	}
	if identifier[0] >= '0' && identifier[0] <= '9' {
		return "Field" + identifier
	}
	return identifier
}

func loadTriggerProfile(inputPath string) triggerProfile {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var raw map[string]any
	if err := json.Unmarshal(contents, &raw); err != nil {
		fail(err.Error())
	}

	var profile triggerProfile
	if err := json.Unmarshal(contents, &profile); err != nil {
		fail(err.Error())
	}
	if profile.Kind == "" {
		fail("trigger profile is missing kind")
	}
	if profile.Kind == "cli" {
		if _, ok := raw["singleCmd"]; !ok {
			profile.SingleCmd = true
		}
	}
	if profile.Kind == "rest" {
		if profile.ReplyMode == "" {
			profile.ReplyMode = "json"
		}
		if profile.RequestMappingMode == "" {
			profile.RequestMappingMode = "auto"
		}
		if profile.ReplyMappingMode == "" {
			profile.ReplyMappingMode = "auto"
		}
	}
	if profile.Kind == "timer" && strings.TrimSpace(profile.RunMode) == "" {
		profile.RunMode = "repeat"
	}
	if profile.Kind == "cli" && profile.CommandName == "" {
		fail("trigger profile is missing commandName")
	}
	if profile.Kind == "channel" && strings.TrimSpace(profile.Channel) == "" {
		fail("trigger profile is missing channel")
	}
	if profile.Kind == "rest" && (strings.TrimSpace(profile.Method) == "" || strings.TrimSpace(profile.Path) == "" || profile.Port <= 0) {
		fail("trigger profile is missing one or more required REST fields")
	}
	return profile
}

func loadSubflowExtractionRequest(inputPath string) subflowExtractionRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request subflowExtractionRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.FlowID == "" {
		fail("subflow extraction request is missing flowId")
	}
	if len(request.TaskIDs) == 0 {
		fail("subflow extraction request is missing taskIds")
	}
	return request
}

func loadSubflowInliningRequest(inputPath string) subflowInliningRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request subflowInliningRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.ParentFlowID == "" {
		fail("subflow inlining request is missing parentFlowId")
	}
	if request.InvocationTaskID == "" {
		fail("subflow inlining request is missing invocationTaskId")
	}
	return request
}

func loadIteratorSynthesisRequest(inputPath string) iteratorSynthesisRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request iteratorSynthesisRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.FlowID == "" {
		fail("iterator synthesis request is missing flowId")
	}
	if request.TaskID == "" {
		fail("iterator synthesis request is missing taskId")
	}
	if strings.TrimSpace(request.IterateExpr) == "" {
		fail("iterator synthesis request is missing iterateExpr")
	}
	return request
}

func loadRetryPolicyRequest(inputPath string) retryPolicyRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request retryPolicyRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.FlowID == "" {
		fail("retry policy request is missing flowId")
	}
	if request.TaskID == "" {
		fail("retry policy request is missing taskId")
	}
	return request
}

func loadDoWhileSynthesisRequest(inputPath string) doWhileSynthesisRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request doWhileSynthesisRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.FlowID == "" {
		fail("doWhile synthesis request is missing flowId")
	}
	if request.TaskID == "" {
		fail("doWhile synthesis request is missing taskId")
	}
	if strings.TrimSpace(request.Condition) == "" {
		fail("doWhile synthesis request is missing condition")
	}
	return request
}

func loadErrorPathTemplateRequest(inputPath string) errorPathTemplateRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}

	var request errorPathTemplateRequest
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if request.FlowID == "" {
		fail("error path request is missing flowId")
	}
	if request.TaskID == "" {
		fail("error path request is missing taskId")
	}
	if request.Template == "" {
		fail("error path request is missing template")
	}
	return request
}

func loadRunTraceRequest(inputPath string) runTraceRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}
	request := runTraceRequest{
		SampleInput: map[string]any{},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
	}
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if strings.TrimSpace(request.FlowID) == "" {
		fail("run trace request is missing flowId")
	}
	if request.SampleInput == nil {
		request.SampleInput = map[string]any{}
	}
	if !request.Capture.IncludeFlowState && !request.Capture.IncludeActivityOutputs && !request.Capture.IncludeTaskInputs && !request.Capture.IncludeTaskOutputs {
		request.Capture = runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		}
	}
	return request
}

func loadReplayRequest(inputPath string) replayRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}
	request := replayRequest{
		BaseInput: map[string]any{},
		Overrides: map[string]any{},
		Capture: runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		},
	}
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if strings.TrimSpace(request.FlowID) == "" {
		fail("replay request is missing flowId")
	}
	if request.TraceArtifactID != "" && request.BaseInput != nil && len(request.BaseInput) > 0 {
		fail("replay request must not provide both traceArtifactId and baseInput")
	}
	if request.TraceArtifactID == "" && request.BaseInput == nil {
		fail("replay request requires either traceArtifactId or baseInput")
	}
	if request.TraceArtifactID != "" && request.BaseInput == nil {
		fail("replay helper requires resolved baseInput when traceArtifactId is used")
	}
	if request.Overrides == nil {
		request.Overrides = map[string]any{}
	}
	if !request.Capture.IncludeFlowState && !request.Capture.IncludeActivityOutputs && !request.Capture.IncludeTaskInputs && !request.Capture.IncludeTaskOutputs {
		request.Capture = runTraceCaptureOptions{
			IncludeFlowState:       true,
			IncludeActivityOutputs: true,
			IncludeTaskInputs:      true,
			IncludeTaskOutputs:     true,
		}
	}
	return request
}

func loadCompareRunsRequest(inputPath string) runComparisonRequest {
	contents, err := os.ReadFile(inputPath)
	if err != nil {
		fail(err.Error())
	}
	request := runComparisonRequest{
		Compare: runComparisonOptions{
			IncludeStepInputs:    true,
			IncludeStepOutputs:   true,
			IncludeFlowState:     true,
			IncludeActivityState: true,
			IncludeDiagnostics:   true,
		},
	}
	if err := json.Unmarshal(contents, &request); err != nil {
		fail(err.Error())
	}
	if strings.TrimSpace(request.LeftArtifact.ArtifactID) == "" {
		fail("run comparison request is missing leftArtifact.artifactId")
	}
	if strings.TrimSpace(request.RightArtifact.ArtifactID) == "" {
		fail("run comparison request is missing rightArtifact.artifactId")
	}
	if request.LeftArtifact.Kind != "run_trace" && request.LeftArtifact.Kind != "replay_report" {
		fail("run comparison request has invalid leftArtifact.kind")
	}
	if request.RightArtifact.Kind != "run_trace" && request.RightArtifact.Kind != "replay_report" {
		fail("run comparison request has invalid rightArtifact.kind")
	}
	return request
}

func hasFlag(flag string) bool {
	for _, value := range os.Args[1:] {
		if value == flag {
			return true
		}
	}
	return false
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
		Raw:        cloneStringAnyMap(raw),
	}

	return app
}

func stageResult(stage string, diagnostics []diagnostic) validationStageResult {
	items := dedupeDiagnostics(diagnostics)
	ok := true
	for _, item := range items {
		if item.Severity == "error" {
			ok = false
			break
		}
	}
	return validationStageResult{
		Stage:       stage,
		Ok:          ok,
		Diagnostics: items,
	}
}

func validateFlogoApp(app flogoApp) validationReport {
	stages := []validationStageResult{
		validateStructural(app),
		validateSemantic(app),
		validateMappings(app),
		validateDependencies(app),
	}

	ok := true
	for _, stage := range stages {
		if !stage.Ok {
			ok = false
			break
		}
	}

	summary := "Flogo application passed structural, semantic, mapping, and dependency validation."
	if !ok {
		summary = "Flogo application has validation errors that must be resolved before build or runtime checks."
	}

	return validationReport{
		Ok:        ok,
		Stages:    stages,
		Summary:   summary,
		Artifacts: []map[string]any{},
	}
}

func flattenValidationDiagnostics(report validationReport) []diagnostic {
	diagnostics := []diagnostic{}
	for _, stage := range report.Stages {
		diagnostics = append(diagnostics, stage.Diagnostics...)
	}
	return dedupeDiagnostics(diagnostics)
}

func validateStructural(app flogoApp) validationStageResult {
	diagnostics := []diagnostic{}
	importAliases := map[string]bool{}
	triggerIDs := map[string]bool{}
	resourceIDs := map[string]bool{}

	for _, entry := range app.Imports {
		alias := strings.TrimSpace(entry.Alias)
		if alias == "" {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.alias.blank",
				Message:  "Import alias cannot be blank",
				Severity: "error",
				Path:     "imports",
			})
			continue
		}
		if importAliases[alias] {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.alias.duplicate",
				Message:  fmt.Sprintf("Import alias %q is defined more than once", alias),
				Severity: "error",
				Path:     "imports." + alias,
			})
		}
		importAliases[alias] = true
		if strings.TrimSpace(entry.Ref) == "" {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.structural.blank_import_ref",
				Message:  fmt.Sprintf("Import %q is missing a ref", alias),
				Severity: "error",
				Path:     "imports." + alias,
			})
		}
	}

	for _, trigger := range app.Triggers {
		triggerID := strings.TrimSpace(trigger.ID)
		if triggerID == "" {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.structural.blank_trigger_id",
				Message:  "Trigger id cannot be blank",
				Severity: "error",
				Path:     "triggers",
			})
		} else if triggerIDs[triggerID] {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.structural.duplicate_trigger_id",
				Message:  fmt.Sprintf("Trigger %q is defined more than once", triggerID),
				Severity: "error",
				Path:     "triggers." + triggerID,
			})
		}
		triggerIDs[triggerID] = true
	}

	for _, flow := range app.Resources {
		flowID := strings.TrimSpace(flow.ID)
		if flowID == "" {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.structural.blank_flow_id",
				Message:  "Flow id cannot be blank",
				Severity: "error",
				Path:     "resources",
			})
			continue
		}
		if resourceIDs[flowID] {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.structural.duplicate_flow_id",
				Message:  fmt.Sprintf("Flow %q is defined more than once", flowID),
				Severity: "error",
				Path:     "resources." + flowID,
			})
		}
		resourceIDs[flowID] = true

		taskIDs := map[string]bool{}
		for _, task := range flow.Tasks {
			taskID := strings.TrimSpace(task.ID)
			if taskID == "" {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.structural.blank_task_id",
					Message:  fmt.Sprintf("Flow %q contains a task without an id", flowID),
					Severity: "error",
					Path:     "resources." + flowID + ".tasks",
				})
				continue
			}
			if taskIDs[taskID] {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.structural.duplicate_task_id",
					Message:  fmt.Sprintf("Task %q is defined more than once in flow %q", taskID, flowID),
					Severity: "error",
					Path:     "resources." + flowID + ".tasks." + taskID,
				})
			}
			taskIDs[taskID] = true
		}
	}

	return stageResult("structural", diagnostics)
}

func validateSemantic(app flogoApp) validationStageResult {
	diagnostics := []diagnostic{}
	resourceIDs := map[string]bool{}
	importAliases := map[string]bool{}

	for _, flow := range app.Resources {
		resourceIDs[flow.ID] = true
	}
	for _, entry := range app.Imports {
		importAliases[entry.Alias] = true
	}

	for _, trigger := range app.Triggers {
		inferredAlias := inferAliasFromRef(trigger.Ref)
		if strings.HasPrefix(trigger.Ref, "#") && inferredAlias != "" && inferredAlias != "flow" && !importAliases[inferredAlias] {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.semantic.inferred_trigger_alias",
				Message:  fmt.Sprintf("Trigger %q uses alias %q without an explicit import", trigger.ID, inferredAlias),
				Severity: "warning",
				Path:     "triggers." + trigger.ID + ".ref",
			})
		}

		for _, handler := range trigger.Handlers {
			ref := resolveHandlerFlowRef(handler)
			if strings.HasPrefix(ref, "#flow:") {
				flowID := strings.TrimPrefix(ref, "#flow:")
				if !resourceIDs[flowID] {
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.semantic.missing_flow",
						Message:  fmt.Sprintf("Handler action ref %q does not match a known flow resource", ref),
						Severity: "error",
						Path:     "triggers." + trigger.ID + ".handlers",
					})
				}
			}
		}
	}

	for _, flow := range app.Resources {
		for _, task := range flow.Tasks {
			if strings.TrimSpace(task.ActivityRef) == "" {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.semantic.missing_activity_ref",
					Message:  fmt.Sprintf("Task %q is missing an activity ref", task.ID),
					Severity: "warning",
					Path:     "resources." + flow.ID + ".tasks." + task.ID,
				})
				continue
			}

			flowRef := normalizeFlowActionRef(task.ActivityRef, stringValue(task.Settings["flowURI"]))
			if strings.HasPrefix(flowRef, "#flow:") {
				targetFlowID := strings.TrimPrefix(flowRef, "#flow:")
				if !resourceIDs[targetFlowID] {
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.semantic.missing_flow",
						Message:  fmt.Sprintf("Task %q points to missing flow %q", task.ID, targetFlowID),
						Severity: "error",
						Path:     "resources." + flow.ID + ".tasks." + task.ID + ".settings.flowURI",
					})
				}
				continue
			}

			if strings.HasPrefix(task.ActivityRef, "#") {
				alias := inferAliasFromRef(task.ActivityRef)
				if alias != "" && alias != "flow" && alias != "rest" && !importAliases[alias] {
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.semantic.missing_import",
						Message:  fmt.Sprintf("Task %q references missing import alias %q", task.ID, "#"+alias),
						Severity: "error",
						Path:     "resources." + flow.ID + ".tasks." + task.ID + ".activityRef",
					})
				}
			}
		}
	}

	return stageResult("semantic", diagnostics)
}

func validateMappings(app flogoApp) validationStageResult {
	diagnostics := []diagnostic{}

	for _, flow := range app.Resources {
		seenTasks := map[string]bool{}

		for _, task := range flow.Tasks {
			preExecutionRefs := map[string]bool{}
			collectActivityReferences(task.Input, preExecutionRefs)
			collectActivityReferences(task.Settings, preExecutionRefs)

			for reference := range preExecutionRefs {
				if !seenTasks[reference] {
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.mapping.invalid_activity_scope",
						Message:  fmt.Sprintf("Task %q references activity %q before it exists in flow order", task.ID, reference),
						Severity: "error",
						Path:     "resources." + flow.ID + ".tasks." + task.ID,
					})
				}
			}

			outputRefs := map[string]bool{}
			collectActivityReferences(task.Output, outputRefs)
			for reference := range outputRefs {
				if !seenTasks[reference] && reference != task.ID {
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.mapping.invalid_activity_scope",
						Message:  fmt.Sprintf("Task %q references activity %q before it exists in flow order", task.ID, reference),
						Severity: "error",
						Path:     "resources." + flow.ID + ".tasks." + task.ID,
					})
				}
			}

			seenTasks[task.ID] = true
		}
	}

	return stageResult("semantic", diagnostics)
}

func validateDependencies(app flogoApp) validationStageResult {
	diagnostics := []diagnostic{}
	for _, entry := range app.Imports {
		if !strings.Contains(entry.Ref, "/") && !strings.HasPrefix(entry.Ref, "#") {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.dependency.invalid_ref",
				Message:  fmt.Sprintf("Import %q has a non-package ref %q", entry.Alias, entry.Ref),
				Severity: "warning",
				Path:     "imports." + entry.Alias,
			})
		}
	}
	return stageResult("dependency", diagnostics)
}

func collectActivityReferences(value any, references map[string]bool) {
	switch typed := value.(type) {
	case string:
		matches := activityReferencePattern.FindAllStringSubmatch(typed, -1)
		for _, match := range matches {
			if len(match) > 1 && strings.TrimSpace(match[1]) != "" {
				references[match[1]] = true
			}
		}
	case []any:
		for _, item := range typed {
			collectActivityReferences(item, references)
		}
	case map[string]any:
		for _, item := range typed {
			collectActivityReferences(item, references)
		}
	}
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
			actionSettings := map[string]any{}
			actionInput := map[string]any{}
			actionOutput := map[string]any{}
			if action, ok := handlerRecord["action"].(map[string]any); ok {
				actionRef = stringValue(action["ref"])
				if strings.HasPrefix(actionRef, "flow:") {
					actionRef = "#" + actionRef
				}
				actionSettings = mapValue(action["settings"])
				actionInput = mapValue(action["input"])
				actionOutput = mapValue(action["output"])
			}
			handlerInput := cloneStringAnyMap(actionInput)
			for key, value := range mapValue(handlerRecord["input"]) {
				handlerInput[key] = value
			}
			handlerOutput := cloneStringAnyMap(actionOutput)
			for key, value := range mapValue(handlerRecord["output"]) {
				handlerOutput[key] = value
			}
			handlers = append(handlers, flogoHandler{
				ID:             stringValue(handlerRecord["id"]),
				ActionRef:      actionRef,
				ActionSettings: actionSettings,
				Settings:       mapValue(handlerRecord["settings"]),
				Input:          handlerInput,
				Output:         handlerOutput,
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
		Links:          normalizeLinks(data["links"]),
	}

	return flow
}

func normalizeLinks(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return []map[string]any{}
	}

	links := make([]map[string]any, 0, len(items))
	for _, item := range items {
		record, ok := item.(map[string]any)
		if ok {
			links = append(links, record)
		}
	}

	return links
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
			Type:        stringValue(record["type"]),
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
			if flowRef := resolveHandlerFlowRef(handler); flowRef != "" {
				trackUsage(flowRef, "triggers."+trigger.ID+".handlers.action", "flow", false)
			} else {
				trackUsage(handler.ActionRef, "triggers."+trigger.ID+".handlers.action", "action", false)
			}
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

func inferFlowContracts(app flogoApp) flowContracts {
	diagnostics := []diagnostic{}
	contracts := make([]flowContract, 0, len(app.Resources))
	for _, flow := range app.Resources {
		contract := inferFlowContract(app, flow, &diagnostics)
		contracts = append(contracts, contract)
	}
	sort.Slice(contracts, func(i, j int) bool {
		return contracts[i].FlowID < contracts[j].FlowID
	})
	return flowContracts{
		AppName:     app.Name,
		Contracts:   contracts,
		Diagnostics: dedupeDiagnostics(diagnostics),
	}
}

func inferFlowContract(app flogoApp, flow flogoFlow, sharedDiagnostics *[]diagnostic) flowContract {
	diagnostics := []diagnostic{}
	inputs := map[string]flowParam{}
	outputs := map[string]flowParam{}
	metadataInputs := normalizeFlowMetadataParams(flow.MetadataInput, "metadata")
	metadataOutputs := normalizeFlowMetadataParams(flow.MetadataOutput, "metadata")
	for _, param := range metadataInputs {
		inputs[param.Name] = param
	}
	for _, param := range metadataOutputs {
		outputs[param.Name] = param
	}
	if len(metadataInputs) == 0 && len(metadataOutputs) == 0 {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.flow_contract.missing_metadata",
			Message:  fmt.Sprintf("Flow %q does not declare explicit input/output metadata.", flow.ID),
			Severity: "warning",
			Path:     "resources." + flow.ID + ".data.metadata",
		})
	}

	usage := buildFlowUsage(app, flow)
	diagnostics = append(diagnostics, usage.Diagnostics...)
	*sharedDiagnostics = append(*sharedDiagnostics, usage.Diagnostics...)

	for _, param := range usage.InferredInputs {
		inputs[param.Name] = mergeFlowParam(inputs[param.Name], param)
	}
	for _, param := range usage.InferredOutputs {
		outputs[param.Name] = mergeFlowParam(outputs[param.Name], param)
	}

	inputList := mapFlowParams(inputs)
	outputList := mapFlowParams(outputs)
	evidenceLevel := "metadata_only"
	if usage.UsesMappings {
		evidenceLevel = "metadata_plus_mapping"
	} else if usage.UsedByCount > 0 {
		evidenceLevel = "metadata_plus_usage"
	}

	return flowContract{
		FlowID:      flow.ID,
		Name:        valueOrFallback(flow.Name, flow.ID),
		ResourceRef: "#flow:" + flow.ID,
		Inputs:      inputList,
		Outputs:     outputList,
		Reusable:    usage.UsedByCount > 1 || len(inputList) > 0 || len(outputList) > 0,
		Usage: flowUsage{
			FlowID:      flow.ID,
			HandlerRefs: usage.HandlerRefs,
			TriggerRefs: usage.TriggerRefs,
			ActionRefs:  usage.ActionRefs,
			UsedByCount: usage.UsedByCount,
		},
		Diagnostics:   dedupeDiagnostics(diagnostics),
		EvidenceLevel: evidenceLevel,
	}
}

func traceFlow(app flogoApp, request runTraceRequest) runTraceResponse {
	validation := preflightRunTrace(app, request)
	if request.ValidateOnly || !validation.Ok {
		return runTraceResponse{
			Validation: &validation,
		}
	}

	if trace, fallbackDiagnostics, ok := traceFlowRuntime(app, request); ok {
		return runTraceResponse{Trace: trace}
	} else if len(fallbackDiagnostics) > 0 {
		return traceFlowSimulated(app, request, fallbackDiagnostics...)
	}

	return traceFlowSimulated(app, request)
}

func traceFlowSimulated(app flogoApp, request runTraceRequest, additionalDiagnostics ...diagnostic) runTraceResponse {
	flowIndex := -1
	for index, candidate := range app.Resources {
		if candidate.ID == request.FlowID {
			flowIndex = index
			break
		}
	}
	if flowIndex < 0 {
		fail(fmt.Sprintf("flow %q was not found", request.FlowID))
	}

	validation := preflightRunTrace(app, request)
	if request.ValidateOnly || !validation.Ok {
		return runTraceResponse{
			Validation: &validation,
		}
	}

	propertyState := buildPropertyState(app)
	flowState := cloneStringAnyMap(request.SampleInput)
	activityState := map[string]map[string]any{}
	steps := []runTraceTaskStep{}
	diagnostics := []diagnostic{}
	var traceErr string
	flow := app.Resources[flowIndex]
	taskIndex := buildTraceTaskIndex(flow)
	currentTaskID := ""
	if len(flow.Tasks) > 0 {
		currentTaskID = flow.Tasks[0].ID
	}
	visited := map[string]int{}
	for currentTaskID != "" {
		task, ok := taskIndex[currentTaskID]
		if !ok {
			break
		}
		visited[currentTaskID]++
		if visited[currentTaskID] > len(flow.Tasks)+1 {
			traceErr = fmt.Sprintf("Detected a cyclic trace path at task %q", currentTaskID)
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.run_trace.cycle_detected",
				Message:  traceErr,
				Severity: "error",
				Path:     "resources." + request.FlowID + ".tasks." + currentTaskID,
			})
			break
		}
		startedAt := nowRFC3339()
		stepDiagnostics := []diagnostic{}
		stepStatus := "completed"
		stepInput := map[string]any{}
		stepOutput := map[string]any{}
		activitySnapshot := map[string]any{}
		resolvedInput := map[string]any{}

		if len(task.Input) > 0 {
			for key, value := range task.Input {
				resolved := makeJSONSafe(resolveValue(value, mappingPreviewContext{
					Flow:     flowState,
					Activity: activityState,
					Env:      map[string]any{},
					Property: propertyState,
					Trigger:  map[string]any{},
				}))
				resolvedInput[key] = resolved
			}
		}
		if request.Capture.IncludeTaskInputs {
			stepInput = cloneStringAnyMap(resolvedInput)
		}

		switch {
		case strings.TrimSpace(task.ActivityRef) == "":
			stepStatus = "failed"
			traceErr = fmt.Sprintf("Task %q is missing activityRef", task.ID)
			stepDiagnostics = append(stepDiagnostics, diagnostic{
				Code:     "flogo.run_trace.missing_activity_ref",
				Message:  traceErr,
				Severity: "error",
				Path:     "resources." + request.FlowID + ".tasks." + task.ID,
			})
		case normalizeFlowActionRef(task.ActivityRef, stringValue(task.Settings["flowURI"])) != "" &&
			strings.HasPrefix(normalizeFlowActionRef(task.ActivityRef, stringValue(task.Settings["flowURI"])), "#flow:"):
			childFlowID := strings.TrimPrefix(normalizeFlowActionRef(task.ActivityRef, stringValue(task.Settings["flowURI"])), "#flow:")
			childTrace := traceFlow(app, runTraceRequest{
				FlowID:       childFlowID,
				SampleInput:  cloneStringAnyMap(resolvedInput),
				Capture:      request.Capture,
				ValidateOnly: false,
			})
			if childTrace.Trace == nil {
				stepStatus = "failed"
				traceErr = fmt.Sprintf("Subflow %q could not be traced", childFlowID)
				if childTrace.Validation != nil {
					stepDiagnostics = append(stepDiagnostics, childTrace.Validation.Stages[0].Diagnostics...)
				}
			} else {
				stepOutput = cloneStringAnyMap(childTrace.Trace.Summary.Output)
				activitySnapshot = cloneStringAnyMap(stepOutput)
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.run_trace.subflow",
					Message:  fmt.Sprintf("Captured nested trace for subflow %q", childFlowID),
					Severity: "info",
					Path:     "resources." + request.FlowID + ".tasks." + task.ID,
				})
			}
		default:
			stepOutput = evaluateTaskOutput(task, flowState, activityState, propertyState)
			activitySnapshot = cloneStringAnyMap(stepOutput)
			if task.Type == "iterator" || task.Type == "doWhile" {
				stepDiagnostics = append(stepDiagnostics, diagnostic{
					Code:     "flogo.run_trace.simulated_control_flow",
					Message:  fmt.Sprintf("Task %q with type %q was traced in single-pass simulation mode", task.ID, task.Type),
					Severity: "info",
					Path:     "resources." + request.FlowID + ".tasks." + task.ID,
				})
			}
		}

		if stepStatus == "completed" {
			for key, value := range stepOutput {
				flowState[key] = value
			}
			activityState[task.ID] = cloneStringAnyMap(stepOutput)
		}

		step := runTraceTaskStep{
			TaskID:      task.ID,
			TaskName:    task.Name,
			ActivityRef: task.ActivityRef,
			Type:        valueOrFallback(task.Type, "activity"),
			Status:      stepStatus,
			Diagnostics: dedupeDiagnostics(stepDiagnostics),
			StartedAt:   startedAt,
			FinishedAt:  nowRFC3339(),
		}
		if request.Capture.IncludeTaskInputs && len(stepInput) > 0 {
			step.Input = stepInput
		}
		if request.Capture.IncludeTaskOutputs && len(stepOutput) > 0 {
			step.Output = cloneStringAnyMap(stepOutput)
		}
		if request.Capture.IncludeFlowState {
			step.FlowState = cloneStringAnyMap(flowState)
		}
		if request.Capture.IncludeActivityOutputs && len(activitySnapshot) > 0 {
			step.ActivityState = activitySnapshot
		}
		if traceErr != "" && stepStatus == "failed" {
			step.Error = traceErr
		}
		steps = append(steps, step)
		diagnostics = append(diagnostics, step.Diagnostics...)
		if stepStatus == "failed" {
			break
		}
		currentTaskID = nextTraceTaskID(flow, task, false)
	}

	contract := inferFlowContract(app, app.Resources[flowIndex], &[]diagnostic{})
	finalOutput := map[string]any{}
	if len(contract.Outputs) > 0 {
		for _, output := range contract.Outputs {
			if value, ok := flowState[output.Name]; ok {
				finalOutput[output.Name] = makeJSONSafe(value)
			}
		}
	}
	if len(finalOutput) == 0 {
		finalOutput = cloneStringAnyMap(flowState)
	}

	status := "completed"
	if traceErr != "" {
		status = "failed"
	}
	allDiagnostics := dedupeDiagnostics(append(cloneDiagnostics(additionalDiagnostics), diagnostics...))

	return runTraceResponse{
		Trace: &runTrace{
			AppName:      app.Name,
			FlowID:       request.FlowID,
			EvidenceKind: runTraceEvidenceKindSimulatedFallback,
			RuntimeEvidence: &runtimeEvidence{
				Kind:           runTraceEvidenceKindSimulatedFallback,
				FallbackReason: runtimeFallbackReasonFromDiagnostics(additionalDiagnostics),
			},
			Summary: runTraceSummary{
				FlowID:      request.FlowID,
				Status:      status,
				Input:       cloneStringAnyMap(request.SampleInput),
				Output:      finalOutput,
				Error:       traceErr,
				StepCount:   len(steps),
				Diagnostics: allDiagnostics,
			},
			Steps:       steps,
			Diagnostics: allDiagnostics,
		},
	}
}

func traceFlowRuntime(app flogoApp, request runTraceRequest) (*runTrace, []diagnostic, bool) {
	runtimeDiagnostics := []diagnostic{}
	restExecutionFailed := false

	if preparedREST, restDiagnostics, ok, err := prepareRuntimeTraceRESTTrigger(app, request.FlowID); err != nil {
		runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
			Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
			Message:  fmt.Sprintf("Falling back from the REST trigger runtime-backed slice because setup failed: %s", err.Error()),
			Severity: "warning",
			Path:     "triggers",
		})
	} else if ok {
		preparedFlow, unsupportedReason, flowErr := prepareRuntimeTraceFlow(app, request.FlowID)
		if flowErr != nil {
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Falling back from the REST trigger runtime-backed slice because flow setup failed: %s", flowErr.Error()),
				Severity: "warning",
				Path:     "resources." + request.FlowID,
			})
		} else if unsupportedReason != "" {
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Falling back from the REST trigger runtime-backed slice because the flow is not eligible yet: %s", unsupportedReason),
				Severity: "info",
				Path:     "resources." + request.FlowID,
			})
		} else {
			trace, execErr := executeRuntimeRESTTrace(app, preparedFlow, preparedREST, request)
			if execErr != nil {
				restExecutionFailed = true
				runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
					Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Falling back from the REST trigger runtime-backed slice because setup or request execution failed: %s", execErr.Error()),
					Severity: "warning",
					Path:     "triggers." + preparedREST.TriggerID,
				})
			} else {
				trace.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(restDiagnostics), append(cloneDiagnostics(runtimeDiagnostics), trace.Diagnostics...)...))
				trace.Summary.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(restDiagnostics), append(cloneDiagnostics(runtimeDiagnostics), trace.Summary.Diagnostics...)...))
				return trace, nil, true
			}
		}
	} else if len(restDiagnostics) > 0 {
		runtimeDiagnostics = append(runtimeDiagnostics, restDiagnostics...)
		runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
			Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
			Message:  "Falling back from the REST trigger runtime-backed slice because this trigger shape is outside the currently supported narrow REST runtime path.",
			Severity: "info",
			Path:     "triggers",
		})
	}

	if !restExecutionFailed {
		if preparedCLI, cliDiagnostics, ok, err := prepareRuntimeTraceCLITrigger(app, request.FlowID); err != nil {
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Falling back from the CLI trigger runtime-backed slice because setup failed: %s", err.Error()),
				Severity: "warning",
				Path:     "triggers",
			})
		} else if ok {
			preparedFlow, unsupportedReason, flowErr := prepareRuntimeTraceFlow(app, request.FlowID)
			if flowErr != nil {
				runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
					Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Falling back from the CLI trigger runtime-backed slice because flow setup failed: %s", flowErr.Error()),
					Severity: "warning",
					Path:     "resources." + request.FlowID,
				})
			} else if unsupportedReason != "" {
				runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
					Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Falling back from the CLI trigger runtime-backed slice because the flow is not eligible yet: %s", unsupportedReason),
					Severity: "info",
					Path:     "resources." + request.FlowID,
				})
			} else {
				trace, execErr := executeRuntimeCLITrace(app, preparedFlow, preparedCLI, request)
				if execErr != nil {
					runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
						Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
						Message:  fmt.Sprintf("Falling back from the CLI trigger runtime-backed slice because setup or CLI invocation failed: %s", execErr.Error()),
						Severity: "warning",
						Path:     "triggers." + preparedCLI.TriggerID,
					})
				} else {
					trace.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(cliDiagnostics), append(cloneDiagnostics(runtimeDiagnostics), trace.Diagnostics...)...))
					trace.Summary.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(cliDiagnostics), append(cloneDiagnostics(runtimeDiagnostics), trace.Summary.Diagnostics...)...))
					return trace, nil, true
				}
			}
		} else if len(cliDiagnostics) > 0 {
			runtimeDiagnostics = append(runtimeDiagnostics, cliDiagnostics...)
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
				Message:  "Falling back from the CLI trigger runtime-backed slice because this trigger shape is outside the currently supported narrow CLI runtime path.",
				Severity: "info",
				Path:     "triggers",
			})
		}
	}

	if !restExecutionFailed {
		if preparedTimer, timerDiagnostics, ok, err := prepareRuntimeTraceTimerTrigger(app, request.FlowID); err != nil {
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Falling back from the timer trigger runtime-backed slice because setup failed: %s", err.Error()),
				Severity: "warning",
				Path:     "triggers",
			})
		} else if ok {
			preparedFlow, unsupportedReason, flowErr := prepareRuntimeTraceFlow(app, request.FlowID)
			if flowErr != nil {
				runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
					Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Falling back from the timer trigger runtime-backed slice because flow setup failed: %s", flowErr.Error()),
					Severity: "warning",
					Path:     "resources." + request.FlowID,
				})
			} else if unsupportedReason != "" {
				runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
					Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Falling back from the timer trigger runtime-backed slice because the flow is not eligible yet: %s", unsupportedReason),
					Severity: "info",
					Path:     "resources." + request.FlowID,
				})
			} else {
				trace, execErr := executeRuntimeTimerTrace(app, preparedFlow, preparedTimer, request)
				if execErr != nil {
					runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
						Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
						Message:  fmt.Sprintf("Falling back from the timer trigger runtime-backed slice because setup or trigger execution failed: %s", execErr.Error()),
						Severity: "warning",
						Path:     "triggers." + preparedTimer.TriggerID,
					})
				} else {
					trace.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(runtimeDiagnostics), trace.Diagnostics...))
					trace.Summary.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(runtimeDiagnostics), trace.Summary.Diagnostics...))
					return trace, nil, true
				}
			}
		} else if len(timerDiagnostics) > 0 {
			runtimeDiagnostics = append(runtimeDiagnostics, timerDiagnostics...)
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
				Message:  "Falling back from the timer trigger runtime-backed slice because this trigger shape is outside the currently supported narrow timer runtime path.",
				Severity: "info",
				Path:     "triggers",
			})
		}
		if preparedChannel, channelDiagnostics, ok, err := prepareRuntimeTraceChannelTrigger(app, request.FlowID); err != nil {
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Falling back from the Channel trigger runtime-backed slice because setup failed: %s", err.Error()),
				Severity: "warning",
				Path:     "triggers",
			})
		} else if ok {
			preparedFlow, unsupportedReason, flowErr := prepareRuntimeTraceFlow(app, request.FlowID)
			if flowErr != nil {
				runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
					Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Falling back from the Channel trigger runtime-backed slice because flow setup failed: %s", flowErr.Error()),
					Severity: "warning",
					Path:     "resources." + request.FlowID,
				})
			} else if unsupportedReason != "" {
				runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
					Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Falling back from the Channel trigger runtime-backed slice because the flow is not eligible yet: %s", unsupportedReason),
					Severity: "info",
					Path:     "resources." + request.FlowID,
				})
			} else {
				trace, execErr := executeRuntimeChannelTrace(app, preparedFlow, preparedChannel, request)
				if execErr != nil {
					runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
						Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
						Message:  fmt.Sprintf("Falling back from the Channel trigger runtime-backed slice because setup or publish failed: %s", execErr.Error()),
						Severity: "warning",
						Path:     "triggers." + preparedChannel.TriggerID,
					})
				} else {
					trace.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(channelDiagnostics), append(cloneDiagnostics(runtimeDiagnostics), trace.Diagnostics...)...))
					trace.Summary.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(channelDiagnostics), append(cloneDiagnostics(runtimeDiagnostics), trace.Summary.Diagnostics...)...))
					return trace, nil, true
				}
			}
		} else if len(channelDiagnostics) > 0 {
			runtimeDiagnostics = append(runtimeDiagnostics, channelDiagnostics...)
			runtimeDiagnostics = append(runtimeDiagnostics, diagnostic{
				Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
				Message:  "Falling back from the Channel trigger runtime-backed slice because this trigger shape is outside the currently supported narrow Channel runtime path.",
				Severity: "info",
				Path:     "triggers",
			})
		}
	}

	prepared, unsupportedReason, err := prepareRuntimeTraceFlow(app, request.FlowID)
	if err != nil {
		return nil, append(runtimeDiagnostics, diagnostic{
			Code:     "flogo.run_trace.runtime_fallback",
			Message:  fmt.Sprintf("Falling back to the simulated trace path because runtime-backed setup failed: %s", err.Error()),
			Severity: "warning",
			Path:     "resources." + request.FlowID,
		}), false
	}
	if unsupportedReason != "" {
		return nil, append(runtimeDiagnostics, diagnostic{
			Code:     "flogo.run_trace.runtime_fallback",
			Message:  fmt.Sprintf("Falling back to the simulated trace path because the current runtime-backed foundation does not support this flow yet: %s", unsupportedReason),
			Severity: "info",
			Path:     "resources." + request.FlowID,
		}), false
	}

	trace, err := executeRuntimeTrace(app, prepared, request)
	if err != nil {
		return nil, append(runtimeDiagnostics, diagnostic{
			Code:     "flogo.run_trace.runtime_fallback",
			Message:  fmt.Sprintf("Falling back to the simulated trace path because runtime-backed execution setup failed: %s", err.Error()),
			Severity: "warning",
			Path:     "resources." + request.FlowID,
		}), false
	}
	if len(runtimeDiagnostics) > 0 {
		trace.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(runtimeDiagnostics), trace.Diagnostics...))
		trace.Summary.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(runtimeDiagnostics), trace.Summary.Diagnostics...))
	}

	return trace, nil, true
}

func prepareRuntimeTraceFlow(app flogoApp, flowID string) (runtimeTracePreparedFlow, string, error) {
	if len(app.Raw) == 0 {
		return runtimeTracePreparedFlow{}, "raw app document is unavailable", nil
	}

	rawFlow, ok := lookupRawFlowRecord(app.Raw, flowID)
	if !ok {
		return runtimeTracePreparedFlow{}, "raw flow document is unavailable", nil
	}

	data := cloneStringAnyMap(mapValue(rawFlow["data"]))
	if len(data) == 0 {
		return runtimeTracePreparedFlow{}, "raw flow data is unavailable", nil
	}

	if strings.TrimSpace(stringValue(data["name"])) == "" {
		data["name"] = flowID
	}

	data["metadata"] = normalizeRuntimeTraceMetadata(mapValue(data["metadata"]))
	taskItems, ok := data["tasks"].([]any)
	if !ok || len(taskItems) == 0 {
		return runtimeTracePreparedFlow{}, "runtime-backed tracing requires a concrete task list", nil
	}

	for index, item := range taskItems {
		task, ok := item.(map[string]any)
		if !ok {
			return runtimeTracePreparedFlow{}, fmt.Sprintf("task %d has an unsupported shape", index), nil
		}

		if taskType := strings.TrimSpace(stringValue(task["type"])); taskType != "" && taskType != "activity" {
			return runtimeTracePreparedFlow{}, fmt.Sprintf("task %q uses unsupported type %q", stringValue(task["id"]), taskType), nil
		}

		settings := mapValue(task["settings"])
		if len(settings) > 0 {
			if _, ok := settings["retryOnError"]; ok {
				return runtimeTracePreparedFlow{}, fmt.Sprintf("task %q uses retryOnError settings", stringValue(task["id"])), nil
			}
			if _, ok := settings["iterate"]; ok {
				return runtimeTracePreparedFlow{}, fmt.Sprintf("task %q uses iterator settings", stringValue(task["id"])), nil
			}
			if _, ok := settings["condition"]; ok {
				return runtimeTracePreparedFlow{}, fmt.Sprintf("task %q uses conditional loop settings", stringValue(task["id"])), nil
			}
		}

		activityConfig := cloneStringAnyMap(mapValue(task["activity"]))
		if len(activityConfig) == 0 {
			activityConfig = map[string]any{}
		}
		if strings.TrimSpace(stringValue(activityConfig["ref"])) == "" {
			activityConfig["ref"] = stringValue(task["activityRef"])
		}
		if _, ok := activityConfig["input"]; !ok && len(mapValue(task["input"])) > 0 {
			activityConfig["input"] = cloneStringAnyMap(mapValue(task["input"]))
		}
		if _, ok := activityConfig["output"]; !ok && len(mapValue(task["output"])) > 0 {
			activityConfig["output"] = cloneStringAnyMap(mapValue(task["output"]))
		}
		if _, ok := activityConfig["settings"]; !ok && len(settings) > 0 {
			activityConfig["settings"] = cloneStringAnyMap(settings)
		}

		resolvedActivityRef := normalizeFlowActionRef(stringValue(activityConfig["ref"]), stringValue(mapValue(activityConfig["settings"])["flowURI"]))
		if strings.HasPrefix(resolvedActivityRef, "#flow:") {
			return runtimeTracePreparedFlow{}, fmt.Sprintf("task %q invokes a subflow", stringValue(task["id"])), nil
		}

		runtimeActivityRef, supported := resolveRuntimeActivityRef(app, stringValue(activityConfig["ref"]))
		if !supported {
			return runtimeTracePreparedFlow{}, fmt.Sprintf("task %q uses unsupported activity %q", stringValue(task["id"]), stringValue(activityConfig["ref"])), nil
		}
		activityConfig["ref"] = runtimeActivityRef
		task["activity"] = activityConfig
	}

	resourceData, err := json.Marshal(data)
	if err != nil {
		return runtimeTracePreparedFlow{}, "", err
	}

	runtimeResourceID := runtimeTraceResourceID(app, flowID, resourceData)

	return runtimeTracePreparedFlow{
		FlowID:            flowID,
		FlowName:          stringValue(data["name"]),
		ResourceData:      resourceData,
		RuntimeResourceID: runtimeResourceID,
		RuntimeFlowURI:    "res://" + runtimeResourceID,
	}, "", nil
}

func runtimeTraceResourceID(app flogoApp, flowID string, resourceData []byte) string {
	hashInput := valueOrFallback(app.Name, "runtime-trace-app") + "|" + flowID + "|" + string(resourceData)
	sum := sha256.Sum256([]byte(hashInput))
	return fmt.Sprintf("flow:%s_%x", flowID, sum[:6])
}

func prepareRuntimeTraceRESTTrigger(app flogoApp, flowID string) (runtimeTracePreparedRESTTrigger, []diagnostic, bool, error) {
	matches := []struct {
		trigger flogoTrigger
		handler flogoHandler
	}{}

	for _, trigger := range app.Triggers {
		triggerAlias := strings.TrimPrefix(trigger.Ref, "#")
		triggerRef := resolveImportRef(app, trigger.Ref, triggerAlias)
		if triggerRef != supportedRuntimeRESTTriggerRef {
			continue
		}
		for _, handler := range trigger.Handlers {
			if resolveHandlerFlowRef(handler) != "#flow:"+flowID {
				continue
			}
			matches = append(matches, struct {
				trigger flogoTrigger
				handler flogoHandler
			}{trigger: trigger, handler: handler})
		}
	}

	if len(matches) == 0 {
		return runtimeTracePreparedRESTTrigger{}, nil, false, nil
	}
	if len(matches) > 1 {
		return runtimeTracePreparedRESTTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Found %d REST handlers for flow %q; the current REST runtime slice requires exactly one matching handler.", len(matches), flowID),
				Severity: "info",
				Path:     "triggers",
			},
		}, false, nil
	}

	trigger := matches[0].trigger
	handler := matches[0].handler
	method := strings.ToUpper(strings.TrimSpace(stringValue(handler.Settings["method"])))
	path := strings.TrimSpace(stringValue(handler.Settings["path"]))
	if method != "POST" && method != "PUT" && method != "PATCH" {
		return runtimeTracePreparedRESTTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
				Message:  fmt.Sprintf("REST handler %q uses unsupported method %q; the current runtime-backed REST slice only supports POST, PUT, and PATCH handlers.", handler.ID, method),
				Severity: "info",
				Path:     "triggers." + trigger.ID,
			},
		}, false, nil
	}
	if path == "" || strings.Contains(path, ":") || strings.Contains(path, "*") {
		return runtimeTracePreparedRESTTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
				Message:  fmt.Sprintf("REST handler %q uses unsupported path %q; the current runtime-backed REST slice only supports static paths.", handler.ID, path),
				Severity: "info",
				Path:     "triggers." + trigger.ID,
			},
		}, false, nil
	}
	if len(handler.Input) == 0 || len(handler.Output) == 0 {
		return runtimeTracePreparedRESTTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
				Message:  fmt.Sprintf("REST handler %q requires explicit request and reply mappings for the current runtime-backed slice.", handler.ID),
				Severity: "info",
				Path:     "triggers." + trigger.ID,
			},
		}, false, nil
	}

	runtimeRequestMappings, requestDiagnostics, requestSupported := normalizeSupportedRuntimeRESTMappings(handler.Input, "request", trigger.ID, handler.ID)
	runtimeReplyMappings, replyDiagnostics, replySupported := normalizeSupportedRuntimeRESTMappings(handler.Output, "reply", trigger.ID, handler.ID)
	translationDiagnostics := append(requestDiagnostics, replyDiagnostics...)
	if !requestSupported || !replySupported {
		return runtimeTracePreparedRESTTrigger{}, translationDiagnostics, false, nil
	}

	port, err := reserveRuntimeRESTPort()
	if err != nil {
		return runtimeTracePreparedRESTTrigger{}, nil, false, err
	}
	handlerName := strings.TrimSpace(handler.ID)
	if handlerName == "" {
		handlerName = trigger.ID + "_handler1"
	}

	return runtimeTracePreparedRESTTrigger{
		TriggerID:              trigger.ID,
		TriggerRef:             supportedRuntimeRESTTriggerRef,
		HandlerName:            handlerName,
		Method:                 method,
		Path:                   path,
		Port:                   port,
		RequestMappings:        cloneStringAnyMap(handler.Input),
		ReplyMappings:          cloneStringAnyMap(handler.Output),
		RuntimeRequestMappings: runtimeRequestMappings,
		RuntimeReplyMappings:   runtimeReplyMappings,
	}, translationDiagnostics, true, nil
}

func prepareRuntimeTraceCLITrigger(app flogoApp, flowID string) (runtimeTracePreparedCLITrigger, []diagnostic, bool, error) {
	matches := []struct {
		trigger flogoTrigger
		handler flogoHandler
	}{}

	for _, trigger := range app.Triggers {
		triggerAlias := strings.TrimPrefix(trigger.Ref, "#")
		triggerRef := resolveImportRef(app, trigger.Ref, triggerAlias)
		if triggerRef != supportedRuntimeCLITriggerRef && triggerRef != legacyRuntimeCLITriggerRef {
			continue
		}
		for _, handler := range trigger.Handlers {
			if resolveHandlerFlowRef(handler) != "#flow:"+flowID {
				continue
			}
			matches = append(matches, struct {
				trigger flogoTrigger
				handler flogoHandler
			}{trigger: trigger, handler: handler})
		}
	}

	if len(matches) == 0 {
		return runtimeTracePreparedCLITrigger{}, nil, false, nil
	}
	if len(matches) > 1 {
		return runtimeTracePreparedCLITrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Found %d CLI handlers for flow %q; the current CLI runtime slice requires exactly one matching handler.", len(matches), flowID),
				Severity: "info",
				Path:     "triggers",
			},
		}, false, nil
	}

	trigger := matches[0].trigger
	handler := matches[0].handler
	singleCmd, hasSingleCmd := cliTriggerSingleCmd(trigger.Settings)
	if !hasSingleCmd {
		singleCmd = true
	}
	commandName := resolveCLICommandName(handler)
	if strings.TrimSpace(commandName) == "" {
		return runtimeTracePreparedCLITrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
				Message:  fmt.Sprintf("CLI handler %q does not expose a usable command identity for the current runtime-backed slice.", handler.ID),
				Severity: "info",
				Path:     "triggers." + trigger.ID,
			},
		}, false, nil
	}

	flagDescriptions, flagKinds, flagErr := parseCLIFlagDescriptions(handler.Settings["flags"])
	if flagErr != nil {
		return runtimeTracePreparedCLITrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
				Message:  fmt.Sprintf("CLI handler %q uses unsupported flag settings for the current runtime-backed slice: %s", handler.ID, flagErr.Error()),
				Severity: "info",
				Path:     "triggers." + trigger.ID,
			},
		}, false, nil
	}

	runtimeInputMappings, inputDiagnostics, inputSupported := normalizeSupportedRuntimeCLIMappings(handler.Input, "request", trigger.ID, commandName)
	runtimeOutputMappings, outputDiagnostics, outputSupported := normalizeSupportedRuntimeCLIMappings(handler.Output, "reply", trigger.ID, commandName)
	translationDiagnostics := append(inputDiagnostics, outputDiagnostics...)
	if !inputSupported || !outputSupported {
		return runtimeTracePreparedCLITrigger{}, translationDiagnostics, false, nil
	}

	return runtimeTracePreparedCLITrigger{
		TriggerID:             trigger.ID,
		TriggerRef:            supportedRuntimeCLITriggerRef,
		CommandName:           commandName,
		SingleCmd:             singleCmd,
		Usage:                 strings.TrimSpace(stringValue(trigger.Settings["usage"])),
		Long:                  strings.TrimSpace(stringValue(trigger.Settings["long"])),
		HandlerUsage:          strings.TrimSpace(stringValue(handler.Settings["usage"])),
		HandlerShort:          strings.TrimSpace(stringValue(handler.Settings["short"])),
		HandlerLong:           strings.TrimSpace(stringValue(handler.Settings["long"])),
		FlagDescriptions:      flagDescriptions,
		FlagKinds:             flagKinds,
		InputMappings:         cloneStringAnyMap(handler.Input),
		OutputMappings:        cloneStringAnyMap(handler.Output),
		RuntimeInputMappings:  runtimeInputMappings,
		RuntimeOutputMappings: runtimeOutputMappings,
	}, translationDiagnostics, true, nil
}

func prepareRuntimeTraceTimerTrigger(app flogoApp, flowID string) (runtimeTracePreparedTimerTrigger, []diagnostic, bool, error) {
	matches := []struct {
		trigger flogoTrigger
		handler flogoHandler
	}{}

	for _, trigger := range app.Triggers {
		triggerAlias := strings.TrimPrefix(trigger.Ref, "#")
		triggerRef := resolveImportRef(app, trigger.Ref, triggerAlias)
		if triggerRef != supportedRuntimeTimerTriggerRef {
			continue
		}
		for _, handler := range trigger.Handlers {
			if resolveHandlerFlowRef(handler) != "#flow:"+flowID {
				continue
			}
			matches = append(matches, struct {
				trigger flogoTrigger
				handler flogoHandler
			}{trigger: trigger, handler: handler})
		}
	}

	if len(matches) == 0 {
		return runtimeTracePreparedTimerTrigger{}, nil, false, nil
	}
	if len(matches) > 1 {
		return runtimeTracePreparedTimerTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Found %d timer handlers for flow %q; the current timer runtime slice requires exactly one matching handler.", len(matches), flowID),
				Severity: "info",
				Path:     "triggers",
			},
		}, false, nil
	}

	trigger := matches[0].trigger
	handler := matches[0].handler
	startDelay := strings.TrimSpace(stringValue(handler.Settings["startDelay"]))
	repeatInterval := strings.TrimSpace(stringValue(handler.Settings["repeatInterval"]))
	if repeatInterval != "" {
		return runtimeTracePreparedTimerTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Timer handler %q uses repeatInterval %q; the current runtime-backed timer slice only supports one-shot timers.", handler.ID, repeatInterval),
				Severity: "info",
				Path:     "triggers." + trigger.ID,
			},
		}, false, nil
	}
	if startDelay != "" {
		if _, err := time.ParseDuration(startDelay); err != nil {
			return runtimeTracePreparedTimerTrigger{}, []diagnostic{
				{
					Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
					Message:  fmt.Sprintf("Timer handler %q uses an invalid startDelay %q: %s", handler.ID, startDelay, err.Error()),
					Severity: "info",
					Path:     "triggers." + trigger.ID,
				},
			}, false, nil
		}
	}
	if len(handler.Input) > 0 || len(handler.Output) > 0 {
		return runtimeTracePreparedTimerTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.timer_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Timer handler %q requires no explicit request or reply mappings for the current runtime-backed slice.", handler.ID),
				Severity: "info",
				Path:     "triggers." + trigger.ID,
			},
		}, false, nil
	}

	handlerName := strings.TrimSpace(handler.ID)
	if handlerName == "" {
		handlerName = trigger.ID + "_handler1"
	}

	return runtimeTracePreparedTimerTrigger{
		TriggerID:      trigger.ID,
		TriggerRef:     supportedRuntimeTimerTriggerRef,
		HandlerName:    handlerName,
		StartDelay:     startDelay,
		RepeatInterval: repeatInterval,
	}, nil, true, nil
}

func prepareRuntimeTraceChannelTrigger(app flogoApp, flowID string) (runtimeTracePreparedChannelTrigger, []diagnostic, bool, error) {
	matches := []struct {
		trigger       flogoTrigger
		handler       flogoHandler
		channelName   string
		channelBuffer int
		channelDescs  []string
	}{}

	rawChannels := runtimeTraceChannelDescriptors(app.Raw)

	for _, trigger := range app.Triggers {
		triggerAlias := strings.TrimPrefix(trigger.Ref, "#")
		triggerRef := resolveImportRef(app, trigger.Ref, triggerAlias)
		if triggerRef != supportedRuntimeChannelTriggerRef {
			continue
		}
		for _, handler := range trigger.Handlers {
			if resolveHandlerFlowRef(handler) != "#flow:"+flowID {
				continue
			}
			channelName := strings.TrimSpace(stringValue(handler.Settings["channel"]))
			if channelName == "" {
				return runtimeTracePreparedChannelTrigger{}, []diagnostic{
					{
						Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
						Message:  fmt.Sprintf("Channel handler %q does not declare a channel name for the current runtime-backed slice.", handler.ID),
						Severity: "info",
						Path:     "triggers." + trigger.ID,
					},
				}, false, nil
			}
			channelDescriptor, channelBuffer, ok := runtimeTraceChannelDescriptorForName(rawChannels, channelName)
			if !ok {
				return runtimeTracePreparedChannelTrigger{}, []diagnostic{
					{
						Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
						Message:  fmt.Sprintf("Channel handler %q targets channel %q, but the app does not define a matching engine channel descriptor for the current runtime-backed slice.", handler.ID, channelName),
						Severity: "info",
						Path:     "triggers." + trigger.ID,
					},
				}, false, nil
			}
			if len(handler.Input) == 0 {
				return runtimeTracePreparedChannelTrigger{}, []diagnostic{
					{
						Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
						Message:  fmt.Sprintf("Channel handler %q requires explicit input mappings for the current runtime-backed slice.", handler.ID),
						Severity: "info",
						Path:     "triggers." + trigger.ID,
					},
				}, false, nil
			}
			matches = append(matches, struct {
				trigger       flogoTrigger
				handler       flogoHandler
				channelName   string
				channelBuffer int
				channelDescs  []string
			}{
				trigger:       trigger,
				handler:       handler,
				channelName:   channelName,
				channelBuffer: channelBuffer,
				channelDescs:  append([]string{}, rawChannels...),
			})
			_ = channelDescriptor
		}
	}

	if len(matches) == 0 {
		return runtimeTracePreparedChannelTrigger{}, nil, false, nil
	}
	if len(matches) > 1 {
		return runtimeTracePreparedChannelTrigger{}, []diagnostic{
			{
				Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Found %d Channel handlers for flow %q; the current Channel runtime slice requires exactly one matching handler.", len(matches), flowID),
				Severity: "info",
				Path:     "triggers",
			},
		}, false, nil
	}

	trigger := matches[0].trigger
	handler := matches[0].handler
	channelName := matches[0].channelName
	channelDescriptor, channelBuffer, _ := runtimeTraceChannelDescriptorForName(rawChannels, channelName)
	if channelDescriptor == "" {
		channelDescriptor = channelName
	}
	runtimeInputMappings, translationDiagnostics, inputSupported := normalizeSupportedRuntimeChannelMappings(handler.Input, trigger.ID, valueOrFallback(strings.TrimSpace(handler.ID), trigger.ID+"_handler1"))
	if !inputSupported {
		return runtimeTracePreparedChannelTrigger{}, translationDiagnostics, false, nil
	}

	return runtimeTracePreparedChannelTrigger{
		TriggerID:             trigger.ID,
		TriggerRef:            supportedRuntimeChannelTriggerRef,
		HandlerName:           valueOrFallback(strings.TrimSpace(handler.ID), trigger.ID+"_handler1"),
		ChannelName:           channelName,
		ChannelDescriptors:    cloneStringSlice(matches[0].channelDescs),
		ChannelBufferSize:     channelBuffer,
		InputMappings:         cloneStringAnyMap(handler.Input),
		OutputMappings:        cloneStringAnyMap(handler.Output),
		RuntimeInputMappings:  runtimeInputMappings,
		RuntimeOutputMappings: map[string]any{},
	}, translationDiagnostics, true, nil
}

func runtimeTraceChannelDescriptors(rawApp map[string]any) []string {
	if len(rawApp) == 0 {
		return []string{}
	}
	items, ok := rawApp["channels"].([]any)
	if !ok || len(items) == 0 {
		return []string{}
	}
	descriptors := []string{}
	for _, item := range items {
		if descriptor, ok := item.(string); ok {
			descriptor = strings.TrimSpace(descriptor)
			if descriptor != "" {
				descriptors = append(descriptors, descriptor)
			}
		}
	}
	return descriptors
}

func runtimeTraceChannelDescriptorForName(descriptors []string, channelName string) (string, int, bool) {
	channelName = strings.TrimSpace(channelName)
	if channelName == "" {
		return "", 0, false
	}
	for _, descriptor := range descriptors {
		name, bufferSize := corechannels.Decode(descriptor)
		if strings.EqualFold(strings.TrimSpace(name), channelName) {
			return descriptor, bufferSize, true
		}
	}
	return "", 0, false
}

func normalizeSupportedRuntimeChannelMappings(mappings map[string]any, triggerID string, handlerName string) (map[string]any, []diagnostic, bool) {
	if len(mappings) == 0 {
		return map[string]any{}, nil, true
	}

	keys := make([]string, 0, len(mappings))
	for key := range mappings {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	normalized := map[string]any{}
	diagnostics := []diagnostic{}
	supported := true
	translatedCount := 0

	for _, key := range keys {
		value, translated, ok := normalizeSupportedRuntimeRESTMappingValue(mappings[key], "request")
		if !ok {
			supported = false
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.run_trace.channel_trigger_runtime_fallback",
				Message:  fmt.Sprintf("Channel handler %q uses an unsupported request mapping at %q for the current runtime-backed slice.", handlerName, key),
				Severity: "info",
				Path:     "triggers." + triggerID,
				Details: map[string]any{
					"handlerName": handlerName,
					"mapping":     key,
					"value":       makeJSONSafe(mappings[key]),
				},
			})
			continue
		}
		if translated {
			translatedCount++
		}
		normalized[key] = value
	}

	if translatedCount > 0 {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_trace.channel_trigger_runtime_mapping_translation",
			Message:  fmt.Sprintf("Translated %d request mapping expressions from stored Channel trigger notation into the official trigger runtime mapper scope.", translatedCount),
			Severity: "info",
			Path:     "triggers." + triggerID,
			Details: map[string]any{
				"handlerName":     handlerName,
				"translatedCount": translatedCount,
			},
		})
	}

	return normalized, diagnostics, supported
}

func cliTriggerSingleCmd(settings map[string]any) (bool, bool) {
	if len(settings) == 0 {
		return false, false
	}
	value, ok := settings["singleCmd"]
	if !ok {
		return false, false
	}
	switch typed := value.(type) {
	case bool:
		return typed, true
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return false, false
		}
		parsed, err := strconv.ParseBool(trimmed)
		if err != nil {
			return false, false
		}
		return parsed, true
	default:
		return boolValue(value), true
	}
}

func resolveCLICommandName(handler flogoHandler) string {
	if command := strings.TrimSpace(stringValue(handler.Settings["command"])); command != "" {
		return command
	}
	if command := strings.TrimSpace(handler.ID); command != "" {
		return command
	}
	return ""
}

func parseCLIFlagDescriptions(value any) ([]string, map[string]string, error) {
	items, ok := value.([]any)
	if !ok || len(items) == 0 {
		return []string{}, map[string]string{}, nil
	}

	descriptions := make([]string, 0, len(items))
	kinds := map[string]string{}
	for _, item := range items {
		raw, ok := item.(string)
		if !ok {
			return nil, nil, fmt.Errorf("flag descriptions must be strings")
		}
		parts := strings.Split(raw, "||")
		if len(parts) < 3 {
			return nil, nil, fmt.Errorf("flag description %q does not match name||default||description", raw)
		}
		name := strings.TrimSpace(parts[0])
		if name == "" {
			return nil, nil, fmt.Errorf("flag description %q is missing a flag name", raw)
		}
		defaultValue := strings.TrimSpace(parts[1])
		kind := "string"
		if strings.EqualFold(defaultValue, "true") || strings.EqualFold(defaultValue, "false") {
			kind = "bool"
		}
		kinds[name] = kind
		descriptions = append(descriptions, raw)
	}
	return descriptions, kinds, nil
}

func normalizeSupportedRuntimeCLIMappings(mappings map[string]any, direction string, triggerID string, commandName string) (map[string]any, []diagnostic, bool) {
	if len(mappings) == 0 {
		return map[string]any{}, nil, true
	}

	keys := make([]string, 0, len(mappings))
	for key := range mappings {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	normalized := map[string]any{}
	diagnostics := []diagnostic{}
	supported := true
	translatedCount := 0

	for _, key := range keys {
		value, translated, ok := normalizeSupportedRuntimeCLIMappingValue(mappings[key], direction)
		if !ok {
			supported = false
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.run_trace.cli_trigger_runtime_fallback",
				Message:  fmt.Sprintf("CLI command %q uses an unsupported %s mapping at %q for the current runtime-backed slice.", commandName, direction, key),
				Severity: "info",
				Path:     "triggers." + triggerID,
				Details: map[string]any{
					"commandName": commandName,
					"direction":   direction,
					"mapping":     key,
					"value":       makeJSONSafe(mappings[key]),
				},
			})
			continue
		}
		if translated {
			translatedCount++
		}
		normalized[key] = value
	}

	if translatedCount > 0 {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_trace.cli_trigger_runtime_mapping_translation",
			Message:  fmt.Sprintf("Translated %d %s mapping expressions from stored CLI trigger notation into the official CLI trigger runtime mapper scope.", translatedCount, direction),
			Severity: "info",
			Path:     "triggers." + triggerID,
			Details: map[string]any{
				"commandName":     commandName,
				"direction":       direction,
				"translatedCount": translatedCount,
			},
		})
	}

	return normalized, diagnostics, supported
}

func normalizeSupportedRuntimeCLIMappingValue(value any, direction string) (any, bool, bool) {
	switch typed := value.(type) {
	case string:
		return normalizeSupportedRuntimeCLIMappingExpression(typed, direction)
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		result := map[string]any{}
		translated := false
		for _, key := range keys {
			normalized, nestedTranslated, ok := normalizeSupportedRuntimeCLIMappingValue(typed[key], direction)
			if !ok {
				return nil, false, false
			}
			if nestedTranslated {
				translated = true
			}
			result[key] = normalized
		}
		return result, translated, true
	case []any:
		result := make([]any, 0, len(typed))
		translated := false
		for _, item := range typed {
			normalized, nestedTranslated, ok := normalizeSupportedRuntimeCLIMappingValue(item, direction)
			if !ok {
				return nil, false, false
			}
			if nestedTranslated {
				translated = true
			}
			result = append(result, normalized)
		}
		return result, translated, true
	default:
		return makeJSONSafe(value), false, true
	}
}

func normalizeSupportedRuntimeCLIMappingExpression(expression string, direction string) (string, bool, bool) {
	trimmed := strings.TrimSpace(expression)
	if trimmed == "" {
		return expression, false, true
	}
	if strings.HasPrefix(trimmed, "=$.") || trimmed == "=$" {
		return trimmed, false, true
	}
	if strings.HasPrefix(trimmed, "$.") || trimmed == "$" {
		return "=" + trimmed, true, true
	}

	switch direction {
	case "request":
		switch {
		case trimmed == "$trigger" || trimmed == "=$trigger":
			return "=$", true, true
		case strings.HasPrefix(trimmed, "$trigger."):
			return "=$." + strings.TrimPrefix(trimmed, "$trigger."), true, true
		case strings.HasPrefix(trimmed, "=$trigger."):
			return "=$." + strings.TrimPrefix(trimmed, "=$trigger."), true, true
		}
	case "reply":
		switch {
		case trimmed == "$flow" || trimmed == "=$flow":
			return "=$", true, true
		case strings.HasPrefix(trimmed, "$flow."):
			return "=$." + strings.TrimPrefix(trimmed, "$flow."), true, true
		case strings.HasPrefix(trimmed, "=$flow."):
			return "=$." + strings.TrimPrefix(trimmed, "=$flow."), true, true
		}
	}

	if strings.HasPrefix(trimmed, "$") || strings.HasPrefix(trimmed, "=$") || strings.HasPrefix(trimmed, "=") {
		return "", false, false
	}

	return expression, false, true
}

func normalizeSupportedRuntimeRESTMappings(mappings map[string]any, direction string, triggerID string, handlerID string) (map[string]any, []diagnostic, bool) {
	if len(mappings) == 0 {
		return map[string]any{}, nil, true
	}

	keys := make([]string, 0, len(mappings))
	for key := range mappings {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	normalized := map[string]any{}
	diagnostics := []diagnostic{}
	supported := true
	translatedCount := 0

	for _, key := range keys {
		value, translated, ok := normalizeSupportedRuntimeRESTMappingValue(mappings[key], direction)
		if !ok {
			supported = false
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.run_trace.rest_trigger_runtime_fallback",
				Message:  fmt.Sprintf("REST handler %q uses an unsupported %s mapping at %q for the current runtime-backed slice.", handlerID, direction, key),
				Severity: "info",
				Path:     "triggers." + triggerID,
				Details: map[string]any{
					"handlerId": handlerID,
					"direction": direction,
					"mapping":   key,
					"value":     makeJSONSafe(mappings[key]),
				},
			})
			continue
		}
		if translated {
			translatedCount++
		}
		normalized[key] = value
	}

	if translatedCount > 0 {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_trace.rest_trigger_runtime_mapping_translation",
			Message:  fmt.Sprintf("Translated %d %s mapping expressions from stored Flogo-agent trigger notation into the official trigger handler runtime mapper scope.", translatedCount, direction),
			Severity: "info",
			Path:     "triggers." + triggerID,
			Details: map[string]any{
				"handlerId":       handlerID,
				"direction":       direction,
				"translatedCount": translatedCount,
			},
		})
	}

	return normalized, diagnostics, supported
}

func normalizeSupportedRuntimeRESTMappingValue(value any, direction string) (any, bool, bool) {
	switch typed := value.(type) {
	case string:
		return normalizeSupportedRuntimeRESTMappingExpression(typed, direction)
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		result := map[string]any{}
		translated := false
		for _, key := range keys {
			normalized, nestedTranslated, ok := normalizeSupportedRuntimeRESTMappingValue(typed[key], direction)
			if !ok {
				return nil, false, false
			}
			if nestedTranslated {
				translated = true
			}
			result[key] = normalized
		}
		return result, translated, true
	case []any:
		result := make([]any, 0, len(typed))
		translated := false
		for _, item := range typed {
			normalized, nestedTranslated, ok := normalizeSupportedRuntimeRESTMappingValue(item, direction)
			if !ok {
				return nil, false, false
			}
			if nestedTranslated {
				translated = true
			}
			result = append(result, normalized)
		}
		return result, translated, true
	default:
		return makeJSONSafe(value), false, true
	}
}

func normalizeSupportedRuntimeRESTMappingExpression(expression string, direction string) (string, bool, bool) {
	trimmed := strings.TrimSpace(expression)
	if trimmed == "" {
		return expression, false, true
	}
	if strings.HasPrefix(trimmed, "=$.") || trimmed == "=$" {
		return trimmed, false, true
	}
	if strings.HasPrefix(trimmed, "$.") || trimmed == "$" {
		return "=" + trimmed, true, true
	}

	switch direction {
	case "request":
		switch {
		case trimmed == "$trigger" || trimmed == "=$trigger":
			return "=$", true, true
		case strings.HasPrefix(trimmed, "$trigger."):
			return "=$." + strings.TrimPrefix(trimmed, "$trigger."), true, true
		case strings.HasPrefix(trimmed, "=$trigger."):
			return "=$." + strings.TrimPrefix(trimmed, "=$trigger."), true, true
		}
	case "reply":
		switch {
		case trimmed == "$flow" || trimmed == "=$flow":
			return "=$", true, true
		case strings.HasPrefix(trimmed, "$flow."):
			return "=$." + strings.TrimPrefix(trimmed, "$flow."), true, true
		case strings.HasPrefix(trimmed, "=$flow."):
			return "=$." + strings.TrimPrefix(trimmed, "=$flow."), true, true
		}
	}

	if strings.HasPrefix(trimmed, "$") || strings.HasPrefix(trimmed, "=$") || strings.HasPrefix(trimmed, "=") {
		return "", false, false
	}

	return expression, false, true
}

func reserveRuntimeRESTPort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || address.Port == 0 {
		return 0, fmt.Errorf("unable to reserve an HTTP port for the REST trigger runtime slice")
	}
	return address.Port, nil
}

func executeRuntimeTrace(app flogoApp, prepared runtimeTracePreparedFlow, request runTraceRequest) (*runTrace, error) {
	runtimeTraceMutex.Lock()
	defer runtimeTraceMutex.Unlock()

	registerRuntimeTraceSupport()
	runtimeTraceRecorderSingleton.Reset("full")
	defer runtimeTraceRecorderSingleton.Reset("")

	runtimeAppConfig := buildRuntimeTraceAppConfig(app, prepared)
	engineConfigJSON, err := buildRuntimeTraceEngineConfigJSON(prepared.FlowID)
	if err != nil {
		return nil, err
	}

	runtimeEngine, err := coreengine.New(runtimeAppConfig, coreengine.ConfigOption(engineConfigJSON, false))
	if err != nil {
		return nil, err
	}

	flowFactory := coreaction.GetFactory(supportedRuntimeFlowActionRef)
	if flowFactory == nil {
		return nil, fmt.Errorf("runtime-backed flow action factory is unavailable")
	}

	actionConfig := &coreaction.Config{
		Ref: supportedRuntimeFlowActionRef,
		Settings: map[string]interface{}{
			"flowURI": prepared.RuntimeFlowURI,
		},
	}
	actionInstance, err := flowFactory.New(actionConfig)
	if err != nil {
		return nil, err
	}

	listener := newRuntimeTraceListener(request.Capture)
	listenerName := fmt.Sprintf("runtime-trace-%d", time.Now().UnixNano())
	eventTypes := []string{flowevent.TaskEventType, flowevent.FlowEventType}
	if err := coreevent.RegisterListener(listenerName, listener, eventTypes); err != nil {
		return nil, err
	}
	defer coreevent.UnRegisterListener(listenerName, eventTypes)

	runtimeOutput, runtimeErr := corerunner.NewDirect().RunAction(context.Background(), actionInstance, cloneStringAnyMap(request.SampleInput))

	select {
	case <-listener.done:
	case <-time.After(250 * time.Millisecond):
	}

	recorderEvidence := runtimeTraceRecorderSingleton.Evidence()
	trace := listener.buildTrace(app, prepared, request, runtimeBackedTraceMode, runtimeOutput, runtimeErr)
	attachRuntimeTraceEvidence(trace, app, prepared.FlowID, request, runtimeBackedTraceMode, recorderEvidence, listener.taskEvents)
	if runtimeEngine != nil && runtimeErr == nil && trace.Summary.Status == "" {
		trace.Summary.Status = "completed"
	}
	return trace, nil
}

func executeRuntimeRESTTrace(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedREST runtimeTracePreparedRESTTrigger, request runTraceRequest) (*runTrace, error) {
	runtimeTraceMutex.Lock()
	defer runtimeTraceMutex.Unlock()

	registerRuntimeTraceSupport()
	runtimeTraceRecorderSingleton.Reset("full")
	defer runtimeTraceRecorderSingleton.Reset("")

	runtimeAppConfig := buildRuntimeTraceRESTAppConfig(app, preparedFlow, preparedREST)
	engineConfigJSON, err := buildRuntimeTraceEngineConfigJSON(preparedFlow.FlowID)
	if err != nil {
		return nil, err
	}

	runtimeEngine, err := coreengine.New(runtimeAppConfig, coreengine.ConfigOption(engineConfigJSON, false))
	if err != nil {
		return nil, err
	}
	defer func() {
		if runtimeEngine != nil {
			_ = runtimeEngine.Stop()
		}
	}()

	listener := newRuntimeTraceListener(request.Capture)
	listenerName := fmt.Sprintf("runtime-rest-trace-%d", time.Now().UnixNano())
	eventTypes := []string{flowevent.TaskEventType, flowevent.FlowEventType}
	if err := coreevent.RegisterListener(listenerName, listener, eventTypes); err != nil {
		return nil, err
	}
	defer coreevent.UnRegisterListener(listenerName, eventTypes)

	if err := runtimeEngine.Start(); err != nil {
		return nil, err
	}

	if err := waitForRuntimeRESTTrigger(preparedREST.Port, 2*time.Second); err != nil {
		return nil, err
	}

	triggerRequest, triggerReply, runtimeErr := executeRuntimeRESTTriggerRequest(preparedREST, request.SampleInput)

	select {
	case <-listener.done:
	case <-time.After(500 * time.Millisecond):
	}

	recorderEvidence := runtimeTraceRecorderSingleton.Evidence()
	trace := listener.buildTrace(app, preparedFlow, request, runtimeBackedRESTTriggerTraceMode, nil, runtimeErr)
	attachRuntimeTraceEvidence(trace, app, preparedFlow.FlowID, request, runtimeBackedRESTTriggerTraceMode, recorderEvidence, listener.taskEvents)
	if trace.RuntimeEvidence != nil {
		trace.RuntimeEvidence.RestTriggerRuntime = buildRuntimeRESTTriggerEvidence(preparedREST, request.SampleInput, triggerRequest, triggerReply, trace.RuntimeEvidence)
		if flowInput := recorderFlowInputs(trace.RuntimeEvidence.FlowStart); len(flowInput) > 0 {
			trace.Summary.Input = flowInput
		}
		if flowOutput := recorderFlowOutputs(trace.RuntimeEvidence.FlowDone); len(flowOutput) > 0 {
			trace.Summary.Output = flowOutput
		}
	}

	triggerDiagnostics := []diagnostic{
		{
			Code:     "flogo.run_trace.rest_trigger_runtime_backed",
			Message:  "Captured runtime-backed REST trigger execution evidence from an actual HTTP request through the official Flogo REST trigger, handler mapping, flow action, and reply mapping path.",
			Severity: "info",
			Path:     "triggers." + preparedREST.TriggerID,
			Details: map[string]any{
				"mode":        runtimeBackedRESTTriggerTraceMode,
				"triggerId":   preparedREST.TriggerID,
				"handlerName": preparedREST.HandlerName,
				"method":      preparedREST.Method,
				"path":        preparedREST.Path,
				"port":        preparedREST.Port,
			},
		},
	}
	trace.Diagnostics = dedupeDiagnostics(append(triggerDiagnostics, trace.Diagnostics...))
	trace.Summary.Diagnostics = dedupeDiagnostics(append(triggerDiagnostics, trace.Summary.Diagnostics...))

	if trace.RuntimeEvidence != nil && trace.RuntimeEvidence.RecorderBacked {
		recorderDiagnostics := []diagnostic{
			{
				Code:     "flogo.run_trace.recorder_backed",
				Message:  "Captured recorder-backed Flow state evidence through the official Flogo Flow recorder interface.",
				Severity: "info",
				Path:     "resources." + request.FlowID,
				Details: map[string]any{
					"recordingMode": trace.RuntimeEvidence.RecorderMode,
					"snapshotCount": len(trace.RuntimeEvidence.Snapshots),
					"stepCount":     len(trace.RuntimeEvidence.Steps),
					"hasStart":      len(trace.RuntimeEvidence.FlowStart) > 0,
					"hasDone":       len(trace.RuntimeEvidence.FlowDone) > 0,
				},
			},
		}
		trace.Diagnostics = dedupeDiagnostics(append(recorderDiagnostics, trace.Diagnostics...))
		trace.Summary.Diagnostics = dedupeDiagnostics(append(recorderDiagnostics, trace.Summary.Diagnostics...))
	}

	return trace, runtimeErr
}

func executeRuntimeCLITrace(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedCLI runtimeTracePreparedCLITrigger, request runTraceRequest) (*runTrace, error) {
	runtimeTraceMutex.Lock()
	defer runtimeTraceMutex.Unlock()

	registerRuntimeTraceSupport()
	runtimeTraceRecorderSingleton.Reset("full")
	defer runtimeTraceRecorderSingleton.Reset("")

	requestBundle, err := buildRuntimeCLIRequestBundle(preparedCLI, request.SampleInput)
	if err != nil {
		return nil, err
	}

	runtimeAppConfig := buildRuntimeTraceCLIAppConfig(app, preparedFlow, preparedCLI)
	engineConfigJSON, err := buildRuntimeTraceEngineConfigJSON(preparedFlow.FlowID)
	if err != nil {
		return nil, err
	}

	runtimeEngine, err := coreengine.New(runtimeAppConfig, coreengine.ConfigOption(engineConfigJSON, false))
	if err != nil {
		return nil, err
	}
	defer func() {
		if runtimeEngine != nil {
			_ = runtimeEngine.Stop()
		}
	}()

	listener := newRuntimeTraceListener(request.Capture)
	listenerName := fmt.Sprintf("runtime-cli-trace-%d", time.Now().UnixNano())
	eventTypes := []string{flowevent.TaskEventType, flowevent.FlowEventType}
	if err := coreevent.RegisterListener(listenerName, listener, eventTypes); err != nil {
		return nil, err
	}
	defer coreevent.UnRegisterListener(listenerName, eventTypes)

	if err := runtimeEngine.Start(); err != nil {
		return nil, err
	}

	originalArgs := append([]string{}, os.Args...)
	defer func() {
		os.Args = originalArgs
	}()
	os.Args = append([]string{}, requestBundle.Argv...)

	replyStdout, runtimeErr := clicontrib.Invoke()

	select {
	case <-listener.done:
	case <-time.After(500 * time.Millisecond):
	}

	recorderEvidence := runtimeTraceRecorderSingleton.Evidence()
	trace := listener.buildTrace(app, preparedFlow, request, runtimeBackedCLITriggerTraceMode, nil, runtimeErr)
	attachRuntimeTraceEvidence(trace, app, preparedFlow.FlowID, request, runtimeBackedCLITriggerTraceMode, recorderEvidence, listener.taskEvents)
	if trace.RuntimeEvidence != nil {
		trace.RuntimeEvidence.CLITriggerRuntime = buildRuntimeCLITriggerEvidence(preparedCLI, requestBundle, replyStdout, trace.RuntimeEvidence)
		if trace.RuntimeEvidence.CLITriggerRuntime != nil {
			if len(trace.RuntimeEvidence.CLITriggerRuntime.FlowInput) > 0 {
				trace.Summary.Input = cloneStringAnyMap(trace.RuntimeEvidence.CLITriggerRuntime.FlowInput)
			}
			if len(trace.RuntimeEvidence.CLITriggerRuntime.FlowOutput) > 0 {
				trace.Summary.Output = cloneStringAnyMap(trace.RuntimeEvidence.CLITriggerRuntime.FlowOutput)
			}
		}
	}

	cliDiagnostics := []diagnostic{
		{
			Code:     "flogo.run_trace.cli_trigger_runtime_backed",
			Message:  "Captured runtime-backed CLI trigger execution evidence from the official Flogo CLI trigger, command parsing, flow action, and reply mapping path.",
			Severity: "info",
			Path:     "triggers." + preparedCLI.TriggerID,
			Details: map[string]any{
				"mode":        runtimeBackedCLITriggerTraceMode,
				"triggerId":   preparedCLI.TriggerID,
				"commandName": preparedCLI.CommandName,
				"singleCmd":   preparedCLI.SingleCmd,
				"argCount":    len(requestBundle.Args),
				"flagCount":   len(requestBundle.Flags),
			},
		},
	}
	trace.Diagnostics = dedupeDiagnostics(append(cliDiagnostics, trace.Diagnostics...))
	trace.Summary.Diagnostics = dedupeDiagnostics(append(cliDiagnostics, trace.Summary.Diagnostics...))

	return trace, runtimeErr
}

func executeRuntimeChannelTrace(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedChannel runtimeTracePreparedChannelTrigger, request runTraceRequest) (*runTrace, error) {
	runtimeTraceMutex.Lock()
	defer runtimeTraceMutex.Unlock()

	registerRuntimeTraceSupport()
	runtimeTraceRecorderSingleton.Reset("full")
	defer runtimeTraceRecorderSingleton.Reset("")

	requestBundle, err := buildRuntimeChannelRequestBundle(preparedChannel, request.SampleInput)
	if err != nil {
		return nil, err
	}

	tempDir, err := os.MkdirTemp("", "flogo-helper-channel-flow-*")
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = os.RemoveAll(tempDir)
	}()

	flowPath := filepath.Join(tempDir, "flow.json")
	if err := os.WriteFile(flowPath, preparedFlow.ResourceData, 0o600); err != nil {
		return nil, err
	}
	channelFlowURI := "file://" + filepath.ToSlash(flowPath)

	runtimeAppConfig := buildRuntimeTraceChannelAppConfig(app, preparedFlow, preparedChannel, channelFlowURI)
	engineConfigJSON, err := buildRuntimeTraceEngineConfigJSON(preparedFlow.FlowID)
	if err != nil {
		return nil, err
	}

	defer func() {
		_ = corechannels.Stop()
	}()

	runtimeEngine, err := coreengine.New(runtimeAppConfig, coreengine.ConfigOption(engineConfigJSON, false))
	if err != nil {
		return nil, err
	}
	defer func() {
		if runtimeEngine != nil {
			_ = runtimeEngine.Stop()
		}
	}()

	listener := newRuntimeTraceListener(request.Capture)
	listenerName := fmt.Sprintf("runtime-channel-trace-%d", time.Now().UnixNano())
	eventTypes := []string{flowevent.TaskEventType, flowevent.FlowEventType}
	if err := coreevent.RegisterListener(listenerName, listener, eventTypes); err != nil {
		return nil, err
	}
	defer coreevent.UnRegisterListener(listenerName, eventTypes)

	if err := runtimeEngine.Start(); err != nil {
		return nil, err
	}

	runtimeChannel := corechannels.Get(preparedChannel.ChannelName)
	if runtimeChannel == nil {
		return nil, fmt.Errorf("unknown engine channel %q", preparedChannel.ChannelName)
	}
	runtimeChannel.Publish(requestBundle.Data)

	select {
	case <-listener.done:
	case <-time.After(2 * time.Second):
		listener.mu.Lock()
		taskEventsObserved := listener.taskEventCount > 0
		listener.mu.Unlock()
		if !taskEventsObserved {
			return nil, fmt.Errorf("timed out waiting for the Channel trigger runtime-backed slice to complete")
		}
	}

	recorderEvidence := runtimeTraceRecorderSingleton.Evidence()
	trace := listener.buildTrace(app, preparedFlow, request, runtimeBackedChannelTriggerTraceMode, nil, nil)
	attachRuntimeTraceEvidence(trace, app, preparedFlow.FlowID, request, runtimeBackedChannelTriggerTraceMode, recorderEvidence, listener.taskEvents)
	if trace.RuntimeEvidence != nil {
		trace.RuntimeEvidence.ChannelTriggerRuntime = buildRuntimeChannelTriggerEvidence(preparedChannel, requestBundle, trace.RuntimeEvidence)
		if trace.RuntimeEvidence.ChannelTriggerRuntime != nil {
			trace.Summary.Input = map[string]any{
				"channel": preparedChannel.ChannelName,
				"data":    makeJSONSafe(requestBundle.Data),
			}
			if len(trace.RuntimeEvidence.ChannelTriggerRuntime.FlowOutput) > 0 {
				trace.Summary.Output = cloneStringAnyMap(trace.RuntimeEvidence.ChannelTriggerRuntime.FlowOutput)
			}
		}
	}

	channelDiagnostics := []diagnostic{
		{
			Code:     "flogo.run_trace.channel_trigger_runtime_backed",
			Message:  "Captured runtime-backed Channel trigger execution evidence from a named engine channel, flow action, and recorder-backed flow state path.",
			Severity: "info",
			Path:     "triggers." + preparedChannel.TriggerID,
			Details: map[string]any{
				"mode":       runtimeBackedChannelTriggerTraceMode,
				"triggerId":  preparedChannel.TriggerID,
				"channel":    preparedChannel.ChannelName,
				"hasData":    requestBundle.Data != nil,
				"hasFlowOut": trace.RuntimeEvidence != nil && trace.RuntimeEvidence.ChannelTriggerRuntime != nil && len(trace.RuntimeEvidence.ChannelTriggerRuntime.FlowOutput) > 0,
			},
		},
	}
	trace.Diagnostics = dedupeDiagnostics(append(channelDiagnostics, trace.Diagnostics...))
	trace.Summary.Diagnostics = dedupeDiagnostics(append(channelDiagnostics, trace.Summary.Diagnostics...))

	return trace, nil
}

func executeRuntimeTimerTrace(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedTimer runtimeTracePreparedTimerTrigger, request runTraceRequest) (*runTrace, error) {
	runtimeTraceMutex.Lock()
	defer runtimeTraceMutex.Unlock()

	registerRuntimeTraceSupport()
	runtimeTraceRecorderSingleton.Reset("full")
	defer runtimeTraceRecorderSingleton.Reset("")

	tempDir, err := os.MkdirTemp("", "flogo-helper-timer-flow-*")
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = os.RemoveAll(tempDir)
	}()

	flowPath := filepath.Join(tempDir, "flow.json")
	if err := os.WriteFile(flowPath, preparedFlow.ResourceData, 0o600); err != nil {
		return nil, err
	}
	timerFlowURI := "file://" + filepath.ToSlash(flowPath)

	runtimeAppConfig := buildRuntimeTraceTimerAppConfig(app, preparedFlow, preparedTimer, timerFlowURI)
	engineConfigJSON, err := buildRuntimeTraceEngineConfigJSON(preparedFlow.FlowID)
	if err != nil {
		return nil, err
	}

	runtimeEngine, err := coreengine.New(runtimeAppConfig, coreengine.ConfigOption(engineConfigJSON, false))
	if err != nil {
		return nil, err
	}
	defer func() {
		if runtimeEngine != nil {
			_ = runtimeEngine.Stop()
		}
	}()

	listener := newRuntimeTraceListener(request.Capture)
	listenerName := fmt.Sprintf("runtime-timer-trace-%d", time.Now().UnixNano())
	eventTypes := []string{flowevent.TaskEventType, flowevent.FlowEventType}
	if err := coreevent.RegisterListener(listenerName, listener, eventTypes); err != nil {
		return nil, err
	}
	defer coreevent.UnRegisterListener(listenerName, eventTypes)

	startedAt := time.Now().UTC()
	if err := runtimeEngine.Start(); err != nil {
		return nil, err
	}

	firedAt := time.Time{}
	select {
	case <-listener.done:
		firedAt = time.Now().UTC()
	case <-time.After(2 * time.Second):
		return nil, fmt.Errorf("timed out waiting for the timer trigger runtime-backed slice to complete")
	}

	recorderEvidence := runtimeTraceRecorderSingleton.Evidence()
	trace := listener.buildTrace(app, preparedFlow, request, runtimeBackedTimerTriggerTraceMode, nil, nil)
	attachRuntimeTraceEvidence(trace, app, preparedFlow.FlowID, request, runtimeBackedTimerTriggerTraceMode, recorderEvidence, listener.taskEvents)
	if trace.RuntimeEvidence != nil {
		trace.RuntimeEvidence.TimerTriggerRuntime = buildRuntimeTimerTriggerEvidence(preparedTimer, trace.RuntimeEvidence, startedAt, firedAt)
		if trace.RuntimeEvidence.TimerTriggerRuntime != nil {
			trace.Summary.Input = cloneStringAnyMap(trace.RuntimeEvidence.TimerTriggerRuntime.FlowInput)
			if len(trace.RuntimeEvidence.TimerTriggerRuntime.FlowOutput) > 0 {
				trace.Summary.Output = cloneStringAnyMap(trace.RuntimeEvidence.TimerTriggerRuntime.FlowOutput)
			}
		}
	}
	timerDiagnostics := []diagnostic{
		{
			Code:     "flogo.run_trace.timer_trigger_runtime_backed",
			Message:  "Captured runtime-backed timer trigger execution evidence from the official Flogo timer trigger and flow action path.",
			Severity: "info",
			Path:     "triggers." + preparedTimer.TriggerID,
			Details: map[string]any{
				"mode":           runtimeBackedTimerTriggerTraceMode,
				"triggerId":      preparedTimer.TriggerID,
				"handlerName":    preparedTimer.HandlerName,
				"startDelay":     preparedTimer.StartDelay,
				"repeatInterval": preparedTimer.RepeatInterval,
			},
		},
	}
	trace.Diagnostics = dedupeDiagnostics(append(timerDiagnostics, trace.Diagnostics...))
	trace.Summary.Diagnostics = dedupeDiagnostics(append(timerDiagnostics, trace.Summary.Diagnostics...))

	return trace, nil
}

func registerRuntimeTraceSupport() {
	runtimeTraceSupportOnce.Do(func() {
		runtimeTraceRecorderFactoryRef = support.GetRef(&runtimeTraceRecorderFactory{})
		_ = coreservice.RegisterFactory(&runtimeTraceRecorderFactory{})
		_ = coretrigger.Register(runtimeCliTriggerSingleton, &runtimeCliTriggerFactory{})
	})
}

func buildRuntimeTraceAppConfig(app flogoApp, prepared runtimeTracePreparedFlow) *coreapp.Config {
	name := valueOrFallback(app.Name, "runtime-trace-app")
	version := valueOrFallback(app.AppModel, "1.1.0")

	return &coreapp.Config{
		Name:    name,
		Type:    valueOrFallback(app.Type, "flogo:app"),
		Version: version,
		Resources: []*coreresource.Config{
			{
				ID:   prepared.RuntimeResourceID,
				Data: prepared.ResourceData,
			},
		},
	}
}

func buildRuntimeTraceRESTAppConfig(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedREST runtimeTracePreparedRESTTrigger) *coreapp.Config {
	name := valueOrFallback(app.Name, "runtime-rest-trace-app")
	version := valueOrFallback(app.AppModel, "1.1.0")

	return &coreapp.Config{
		Name:    name,
		Type:    valueOrFallback(app.Type, "flogo:app"),
		Version: version,
		Resources: []*coreresource.Config{
			{
				ID:   preparedFlow.RuntimeResourceID,
				Data: preparedFlow.ResourceData,
			},
		},
		Triggers: []*coretrigger.Config{
			{
				Id:       preparedREST.TriggerID,
				Ref:      preparedREST.TriggerRef,
				Settings: map[string]any{"port": preparedREST.Port},
				Handlers: []*coretrigger.HandlerConfig{
					{
						Name: preparedREST.HandlerName,
						Settings: map[string]any{
							"method": preparedREST.Method,
							"path":   preparedREST.Path,
						},
						Actions: []*coretrigger.ActionConfig{
							{
								Config: &coreaction.Config{
									Ref: supportedRuntimeFlowActionRef,
									Settings: map[string]any{
										"flowURI": preparedFlow.RuntimeFlowURI,
									},
								},
								Input:  cloneStringAnyMap(preparedREST.RuntimeRequestMappings),
								Output: cloneStringAnyMap(preparedREST.RuntimeReplyMappings),
							},
						},
					},
				},
			},
		},
	}
}

func buildRuntimeTraceCLIAppConfig(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedCLI runtimeTracePreparedCLITrigger) *coreapp.Config {
	name := valueOrFallback(app.Name, "runtime-cli-trace-app")
	version := valueOrFallback(app.AppModel, "1.1.0")

	triggerSettings := map[string]any{
		"singleCmd": preparedCLI.SingleCmd,
	}
	if preparedCLI.Usage != "" {
		triggerSettings["usage"] = preparedCLI.Usage
	}
	if preparedCLI.Long != "" {
		triggerSettings["long"] = preparedCLI.Long
	}

	handlerSettings := map[string]any{}
	if preparedCLI.HandlerUsage != "" {
		handlerSettings["usage"] = preparedCLI.HandlerUsage
	}
	if preparedCLI.HandlerShort != "" {
		handlerSettings["short"] = preparedCLI.HandlerShort
	}
	if preparedCLI.HandlerLong != "" {
		handlerSettings["long"] = preparedCLI.HandlerLong
	}
	if len(preparedCLI.FlagDescriptions) > 0 {
		flags := make([]any, 0, len(preparedCLI.FlagDescriptions))
		for _, flag := range preparedCLI.FlagDescriptions {
			flags = append(flags, flag)
		}
		handlerSettings["flags"] = flags
	}

	return &coreapp.Config{
		Name:    name,
		Type:    valueOrFallback(app.Type, "flogo:app"),
		Version: version,
		Resources: []*coreresource.Config{
			{
				ID:   preparedFlow.RuntimeResourceID,
				Data: preparedFlow.ResourceData,
			},
		},
		Triggers: []*coretrigger.Config{
			{
				Id:       preparedCLI.TriggerID,
				Ref:      preparedCLI.TriggerRef,
				Settings: triggerSettings,
				Handlers: []*coretrigger.HandlerConfig{
					{
						Name:     preparedCLI.CommandName,
						Settings: handlerSettings,
						Actions: []*coretrigger.ActionConfig{
							{
								Config: &coreaction.Config{
									Ref: supportedRuntimeFlowActionRef,
									Settings: map[string]any{
										"flowURI": preparedFlow.RuntimeFlowURI,
									},
								},
								Input:  cloneStringAnyMap(preparedCLI.RuntimeInputMappings),
								Output: cloneStringAnyMap(preparedCLI.RuntimeOutputMappings),
							},
						},
					},
				},
			},
		},
	}
}

func buildRuntimeTraceTimerAppConfig(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedTimer runtimeTracePreparedTimerTrigger, flowURI string) *coreapp.Config {
	name := valueOrFallback(app.Name, "runtime-timer-trace-app")
	version := valueOrFallback(app.AppModel, "1.1.0")

	handlerSettings := map[string]any{}
	if preparedTimer.StartDelay != "" {
		handlerSettings["startDelay"] = preparedTimer.StartDelay
	}
	if preparedTimer.RepeatInterval != "" {
		handlerSettings["repeatInterval"] = preparedTimer.RepeatInterval
	}

	return &coreapp.Config{
		Name:    name,
		Type:    valueOrFallback(app.Type, "flogo:app"),
		Version: version,
		Resources: []*coreresource.Config{
			{
				ID:   preparedFlow.RuntimeResourceID,
				Data: preparedFlow.ResourceData,
			},
		},
		Triggers: []*coretrigger.Config{
			{
				Id:  preparedTimer.TriggerID,
				Ref: preparedTimer.TriggerRef,
				Handlers: []*coretrigger.HandlerConfig{
					{
						Name:     preparedTimer.HandlerName,
						Settings: handlerSettings,
						Actions: []*coretrigger.ActionConfig{
							{
								Config: &coreaction.Config{
									Ref: supportedRuntimeFlowActionRef,
									Settings: map[string]any{
										"flowURI": flowURI,
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

func buildRuntimeTraceChannelAppConfig(app flogoApp, preparedFlow runtimeTracePreparedFlow, preparedChannel runtimeTracePreparedChannelTrigger, flowURI string) *coreapp.Config {
	name := valueOrFallback(app.Name, "runtime-channel-trace-app")
	version := valueOrFallback(app.AppModel, "1.1.0")

	handlerSettings := map[string]any{
		"channel": preparedChannel.ChannelName,
	}

	return &coreapp.Config{
		Name:     name,
		Type:     valueOrFallback(app.Type, "flogo:app"),
		Version:  version,
		Channels: append([]string{}, preparedChannel.ChannelDescriptors...),
		Resources: []*coreresource.Config{
			{
				ID:   "flow:" + preparedFlow.FlowID,
				Data: preparedFlow.ResourceData,
			},
		},
		Triggers: []*coretrigger.Config{
			{
				Id:  preparedChannel.TriggerID,
				Ref: preparedChannel.TriggerRef,
				Handlers: []*coretrigger.HandlerConfig{
					{
						Name:     preparedChannel.HandlerName,
						Settings: handlerSettings,
						Actions: []*coretrigger.ActionConfig{
							{
								Config: &coreaction.Config{
									Ref: supportedRuntimeFlowActionRef,
									Settings: map[string]any{
										"flowURI": flowURI,
									},
								},
								Input:  cloneStringAnyMap(preparedChannel.RuntimeInputMappings),
								Output: cloneStringAnyMap(preparedChannel.RuntimeOutputMappings),
							},
						},
					},
				},
			},
		},
	}
}

func buildRuntimeTraceImports(app flogoApp, requiredImports map[string]string) []string {
	imports := make([]string, 0, len(app.Imports)+len(requiredImports))
	seenSpecs := map[string]bool{}
	seenRefs := map[string]bool{}

	for _, entry := range app.Imports {
		ref := strings.TrimSpace(entry.Ref)
		if ref == "" {
			continue
		}
		seenRefs[ref] = true
		importSpec := ref
		if alias := strings.TrimSpace(entry.Alias); alias != "" {
			importSpec = alias + " " + ref
		}
		if seenSpecs[importSpec] {
			continue
		}
		seenSpecs[importSpec] = true
		imports = append(imports, importSpec)
	}

	requiredAliases := make([]string, 0, len(requiredImports))
	for alias := range requiredImports {
		requiredAliases = append(requiredAliases, alias)
	}
	sort.Strings(requiredAliases)
	for _, alias := range requiredAliases {
		ref := requiredImports[alias]
		if seenRefs[ref] {
			continue
		}
		imports = append(imports, alias+" "+ref)
	}

	return imports
}

func waitForRuntimeRESTTrigger(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	address := fmt.Sprintf("127.0.0.1:%d", port)
	for {
		connection, err := net.DialTimeout("tcp", address, 100*time.Millisecond)
		if err == nil {
			_ = connection.Close()
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out waiting for the REST trigger listener on %s", address)
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func executeRuntimeRESTTriggerRequest(prepared runtimeTracePreparedRESTTrigger, sampleInput map[string]any) (*restTriggerRuntimeRequestEvidence, *restTriggerRuntimeReplyEvidence, error) {
	requestBody := cloneStringAnyMap(sampleInput)
	queryParams := mapValue(requestBody["queryParams"])
	if len(queryParams) > 0 {
		delete(requestBody, "queryParams")
	}
	requestHeaders := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json",
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return nil, nil, err
	}

	requestURL := fmt.Sprintf("http://127.0.0.1:%d%s", prepared.Port, prepared.Path)
	if len(queryParams) > 0 {
		values := url.Values{}
		for key, value := range queryParams {
			values.Set(key, fmt.Sprint(value))
		}
		encodedQuery := values.Encode()
		if encodedQuery != "" {
			requestURL += "?" + encodedQuery
		}
	}
	httpRequest, err := http.NewRequest(prepared.Method, requestURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, nil, err
	}
	for key, value := range requestHeaders {
		httpRequest.Header.Set(key, value)
	}

	client := &http.Client{Timeout: 2 * time.Second}
	httpResponse, err := client.Do(httpRequest)
	if err != nil {
		return nil, nil, err
	}
	defer httpResponse.Body.Close()

	responseBytes, err := io.ReadAll(httpResponse.Body)
	if err != nil {
		return nil, nil, err
	}
	responseBody := decodeRuntimeRESTBody(responseBytes, httpResponse.Header.Get("Content-Type"))

	requestEvidence := &restTriggerRuntimeRequestEvidence{
		Method:      prepared.Method,
		Path:        prepared.Path,
		Headers:     runtimeHTTPHeadersToMap(httpRequest.Header),
		QueryParams: map[string]any{},
		PathParams:  map[string]any{},
		Body:        makeJSONSafe(requestBody),
		Content:     makeJSONSafe(requestBody),
	}
	replyEvidence := &restTriggerRuntimeReplyEvidence{
		Status:  httpResponse.StatusCode,
		Headers: runtimeHTTPHeadersToMap(httpResponse.Header),
		Body:    responseBody,
		Data:    responseBody,
	}
	return requestEvidence, replyEvidence, nil
}

func decodeRuntimeRESTBody(body []byte, contentType string) any {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return nil
	}
	if strings.Contains(strings.ToLower(contentType), "json") {
		var parsed any
		if err := json.Unmarshal(body, &parsed); err == nil {
			return makeJSONSafe(parsed)
		}
	}
	return trimmed
}

func runtimeHTTPHeadersToMap(headers http.Header) map[string]any {
	if len(headers) == 0 {
		return map[string]any{}
	}
	result := map[string]any{}
	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, strings.ToLower(key))
	}
	sort.Strings(keys)
	for _, key := range keys {
		values := headers.Values(http.CanonicalHeaderKey(key))
		if len(values) == 0 {
			continue
		}
		result[key] = strings.Join(values, ",")
	}
	return result
}

func buildRuntimeRESTTriggerEvidence(prepared runtimeTracePreparedRESTTrigger, sampleInput map[string]any, requestEvidence *restTriggerRuntimeRequestEvidence, replyEvidence *restTriggerRuntimeReplyEvidence, evidence *runtimeEvidence) *restTriggerRuntimeEvidence {
	if evidence == nil {
		return nil
	}

	flowInput := recorderFlowInputs(evidence.FlowStart)
	flowOutput := recorderFlowOutputs(evidence.FlowDone)
	if len(flowInput) == 0 && requestEvidence != nil {
		flowInput = cloneStringAnyMap(mapValue(requestEvidence.Content))
	}
	if len(flowOutput) == 0 && replyEvidence != nil {
		if candidate := cloneStringAnyMap(mapValue(replyEvidence.Data)); len(candidate) > 0 {
			flowOutput = candidate
		} else {
			for _, mapping := range prepared.ReplyMappings {
				expression := strings.TrimSpace(stringValue(mapping))
				if strings.HasPrefix(expression, "$flow.") && replyEvidence.Data != nil {
					flowOutput = map[string]any{
						strings.TrimPrefix(expression, "$flow."): replyEvidence.Data,
					}
					break
				}
			}
		}
	}
	if evidence.FlowStart == nil {
		evidence.FlowStart = map[string]any{}
	}
	if evidence.FlowDone == nil {
		evidence.FlowDone = map[string]any{}
	}
	if requestEvidence != nil {
		evidence.FlowStart["triggerRequest"] = requestEvidence
	}
	if replyEvidence != nil {
		evidence.FlowDone["triggerReply"] = replyEvidence
	}
	if len(flowInput) > 0 {
		evidence.FlowStart["flow_inputs"] = cloneStringAnyMap(flowInput)
		evidence.FlowStart["mappedFlowInput"] = cloneStringAnyMap(flowInput)
	}
	if len(flowOutput) > 0 {
		evidence.FlowDone["flow_outputs"] = cloneStringAnyMap(flowOutput)
		evidence.FlowDone["mappedFlowOutput"] = cloneStringAnyMap(flowOutput)
	}
	unavailableFields := []string{}
	if len(flowInput) == 0 {
		unavailableFields = append(unavailableFields, "flowInput")
	}
	if len(flowOutput) == 0 {
		unavailableFields = append(unavailableFields, "flowOutput")
	}
	if replyEvidence == nil {
		unavailableFields = append(unavailableFields, "reply")
	}

	mappingUnavailable := []string{}
	if len(flowInput) == 0 {
		mappingUnavailable = append(mappingUnavailable, "mappedFlowInput")
	}
	if len(flowOutput) == 0 {
		mappingUnavailable = append(mappingUnavailable, "mappedFlowOutput")
	}

	return &restTriggerRuntimeEvidence{
		Kind:       "rest",
		Request:    requestEvidence,
		FlowInput:  cloneStringAnyMap(flowInput),
		FlowOutput: cloneStringAnyMap(flowOutput),
		Reply:      replyEvidence,
		Mapping: &restTriggerRuntimeMappingEvidence{
			RequestMappingMode: "explicit",
			ReplyMappingMode:   "explicit",
			MappedFlowInput:    cloneStringAnyMap(flowInput),
			MappedFlowOutput:   cloneStringAnyMap(flowOutput),
			RequestMappings:    cloneStringAnyMap(prepared.RequestMappings),
			ReplyMappings:      cloneStringAnyMap(prepared.ReplyMappings),
			UnavailableFields:  dedupeStrings(mappingUnavailable),
			Diagnostics:        []diagnostic{},
		},
		UnavailableFields: dedupeStrings(unavailableFields),
		Diagnostics: []diagnostic{
			{
				Code:     "flogo.run_trace.rest_trigger_evidence",
				Message:  "Captured request, mapped flow input/output, and reply evidence for the supported REST trigger runtime slice.",
				Severity: "info",
				Path:     "triggers." + prepared.TriggerID,
				Details: map[string]any{
					"handlerName": prepared.HandlerName,
					"method":      prepared.Method,
					"path":        prepared.Path,
					"body":        makeJSONSafe(sampleInput),
				},
			},
		},
	}
}

func buildRuntimeCLITriggerEvidence(prepared runtimeTracePreparedCLITrigger, bundle runtimeCLIRequestBundle, replyStdout string, evidence *runtimeEvidence) *cliTriggerRuntimeEvidence {
	if evidence == nil {
		return nil
	}

	triggerData := map[string]any{
		"args":  append([]string{}, bundle.Args...),
		"flags": cloneStringAnyMap(bundle.Flags),
	}
	mappedFlowInput := runtimeRESTApplyMappings(prepared.RuntimeInputMappings, mappingPreviewContext{
		Flow:     map[string]any{},
		Activity: map[string]map[string]any{},
		Env:      map[string]any{},
		Property: map[string]any{},
		Trigger:  triggerData,
	})

	flowInput := recorderFlowInputs(evidence.FlowStart)
	if len(flowInput) == 0 {
		flowInput = cloneStringAnyMap(mappedFlowInput)
	}
	flowOutput := map[string]any{}

	replyData := any(nil)
	if len(flowOutput) > 0 {
		replyValues := runtimeRESTApplyMappings(prepared.RuntimeOutputMappings, mappingPreviewContext{
			Flow:     flowOutput,
			Activity: map[string]map[string]any{},
			Env:      map[string]any{},
			Property: map[string]any{},
			Trigger:  triggerData,
		})
		if value, ok := replyValues["data"]; ok {
			replyData = makeJSONSafe(value)
		}
	}
	if replyData == nil && strings.TrimSpace(replyStdout) != "" {
		replyData = replyStdout
	}

	if evidence.FlowStart == nil {
		evidence.FlowStart = map[string]any{}
	}
	if evidence.FlowDone == nil {
		evidence.FlowDone = map[string]any{}
	}
	if len(flowInput) > 0 {
		evidence.FlowStart["flow_inputs"] = cloneStringAnyMap(flowInput)
		evidence.FlowStart["mappedFlowInput"] = cloneStringAnyMap(flowInput)
	}
	if len(flowOutput) > 0 {
		evidence.FlowDone["flow_outputs"] = cloneStringAnyMap(flowOutput)
		evidence.FlowDone["mappedFlowOutput"] = cloneStringAnyMap(flowOutput)
	}
	if strings.TrimSpace(replyStdout) != "" {
		evidence.FlowDone["cliReplyStdout"] = replyStdout
	}
	if replyData != nil {
		evidence.FlowDone["cliReplyData"] = makeJSONSafe(replyData)
	}

	unavailableFields := []string{}
	if len(flowInput) == 0 {
		unavailableFields = append(unavailableFields, "flowInput")
	}
	if len(flowOutput) == 0 {
		unavailableFields = append(unavailableFields, "flowOutput")
	}
	if replyData == nil {
		unavailableFields = append(unavailableFields, "reply")
	}
	if strings.TrimSpace(replyStdout) == "" {
		unavailableFields = append(unavailableFields, "stdout")
	}

	var replyEvidence *cliTriggerRuntimeReplyEvidence
	if replyData != nil || strings.TrimSpace(replyStdout) != "" {
		replyEvidence = &cliTriggerRuntimeReplyEvidence{
			Data:   makeJSONSafe(replyData),
			Stdout: replyStdout,
		}
	}

	return &cliTriggerRuntimeEvidence{
		Kind: "cli",
		Settings: &cliTriggerRuntimeSettingsEvidence{
			SingleCmd: prepared.SingleCmd,
			Usage:     prepared.Usage,
			Long:      prepared.Long,
		},
		Handler: &cliTriggerRuntimeHandlerEvidence{
			Command: prepared.CommandName,
			Usage:   prepared.HandlerUsage,
			Short:   prepared.HandlerShort,
			Long:    prepared.HandlerLong,
			Flags:   cloneStringSlice(prepared.FlagDescriptions),
		},
		Args:              append([]string{}, bundle.Args...),
		Flags:             cloneStringAnyMap(bundle.Flags),
		FlowInput:         cloneStringAnyMap(flowInput),
		FlowOutput:        cloneStringAnyMap(flowOutput),
		Reply:             replyEvidence,
		UnavailableFields: dedupeStrings(unavailableFields),
		Diagnostics: []diagnostic{
			{
				Code:     "flogo.run_trace.cli_trigger_evidence",
				Message:  "Captured CLI command identity, args, flags, mapped flow input/output, and reply evidence for the supported CLI runtime slice.",
				Severity: "info",
				Path:     "triggers." + prepared.TriggerID,
				Details: map[string]any{
					"commandName": prepared.CommandName,
					"singleCmd":   prepared.SingleCmd,
					"args":        append([]string{}, bundle.Args...),
					"flags":       cloneStringAnyMap(bundle.Flags),
				},
			},
		},
	}
}

func buildRuntimeChannelTriggerEvidence(prepared runtimeTracePreparedChannelTrigger, bundle runtimeChannelRequestBundle, evidence *runtimeEvidence) *channelTriggerRuntimeEvidence {
	if evidence == nil {
		return nil
	}

	triggerData := map[string]any{
		"data": makeJSONSafe(bundle.Data),
	}
	mappedFlowInput := map[string]any{}
	for key, value := range prepared.RuntimeInputMappings {
		mappedFlowInput[key] = makeJSONSafe(resolveValue(value, mappingPreviewContext{
			Flow:     map[string]any{},
			Activity: map[string]map[string]any{},
			Env:      map[string]any{},
			Property: map[string]any{},
			Trigger:  triggerData,
		}))
	}

	flowInput := recorderFlowInputs(evidence.FlowStart)
	if len(flowInput) == 0 {
		flowInput = cloneStringAnyMap(mappedFlowInput)
	}
	flowOutput := recorderFlowOutputs(evidence.FlowDone)

	if evidence.FlowStart == nil {
		evidence.FlowStart = map[string]any{}
	}
	if evidence.FlowDone == nil {
		evidence.FlowDone = map[string]any{}
	}
	evidence.FlowStart["channel"] = prepared.ChannelName
	if len(flowInput) > 0 {
		evidence.FlowStart["flow_inputs"] = cloneStringAnyMap(flowInput)
		evidence.FlowStart["mappedFlowInput"] = cloneStringAnyMap(flowInput)
	}
	if len(flowOutput) > 0 {
		evidence.FlowDone["flow_outputs"] = cloneStringAnyMap(flowOutput)
		evidence.FlowDone["mappedFlowOutput"] = cloneStringAnyMap(flowOutput)
	}
	if bundle.Data != nil {
		evidence.FlowStart["channelData"] = makeJSONSafe(bundle.Data)
	}

	unavailableFields := []string{}
	if len(flowInput) == 0 {
		unavailableFields = append(unavailableFields, "flowInput")
	}
	if len(flowOutput) == 0 {
		unavailableFields = append(unavailableFields, "flowOutput")
	}

	channelEvidence := &channelTriggerRuntimeEvidence{
		Kind: "channel",
		Settings: &channelTriggerRuntimeSettingsEvidence{
			Channels: append([]string{}, prepared.ChannelDescriptors...),
		},
		Handler: &channelTriggerRuntimeHandlerEvidence{
			Name:       prepared.HandlerName,
			Channel:    prepared.ChannelName,
			BufferSize: prepared.ChannelBufferSize,
		},
		Data:              makeJSONSafe(bundle.Data),
		FlowInput:         cloneStringAnyMap(flowInput),
		FlowOutput:        cloneStringAnyMap(flowOutput),
		UnavailableFields: dedupeStrings(unavailableFields),
		Diagnostics: []diagnostic{
			{
				Code:     "flogo.run_trace.channel_trigger_evidence",
				Message:  "Captured Channel trigger configuration, channel data, mapped flow input/output, and recorder-backed flow evidence for the supported Channel runtime slice.",
				Severity: "info",
				Path:     "triggers." + prepared.TriggerID,
				Details: map[string]any{
					"channel":      prepared.ChannelName,
					"bufferSize":   prepared.ChannelBufferSize,
					"channelCount": len(prepared.ChannelDescriptors),
					"hasFlowOut":   len(flowOutput) > 0,
					"hasData":      bundle.Data != nil,
				},
			},
		},
	}

	return channelEvidence
}

func buildRuntimeTimerTriggerEvidence(prepared runtimeTracePreparedTimerTrigger, evidence *runtimeEvidence, startedAt, firedAt time.Time) *timerTriggerRuntimeEvidence {
	if evidence == nil {
		return nil
	}

	flowInput := recorderFlowInputs(evidence.FlowStart)
	flowOutput := recorderFlowOutputs(evidence.FlowDone)

	if evidence.FlowStart == nil {
		evidence.FlowStart = map[string]any{}
	}
	if evidence.FlowDone == nil {
		evidence.FlowDone = map[string]any{}
	}

	if len(flowInput) > 0 {
		evidence.FlowStart["mappedFlowInput"] = cloneStringAnyMap(flowInput)
	}
	if len(flowOutput) > 0 {
		evidence.FlowDone["mappedFlowOutput"] = cloneStringAnyMap(flowOutput)
	}

	runMode := "once"
	if strings.TrimSpace(prepared.RepeatInterval) != "" {
		runMode = "repeat"
	}

	settings := &timerTriggerRuntimeSettingsEvidence{
		RunMode:        runMode,
		StartDelay:     prepared.StartDelay,
		RepeatInterval: prepared.RepeatInterval,
	}
	tick := &timerTriggerRuntimeTickEvidence{TickCount: 1}
	if !startedAt.IsZero() {
		tick.StartedAt = startedAt.UTC().Format(time.RFC3339Nano)
	}
	if !firedAt.IsZero() {
		tick.FiredAt = firedAt.UTC().Format(time.RFC3339Nano)
	}

	unavailableFields := []string{}
	if len(flowInput) == 0 {
		unavailableFields = append(unavailableFields, "flowInput")
	}
	if len(flowOutput) == 0 {
		unavailableFields = append(unavailableFields, "flowOutput")
	}

	return &timerTriggerRuntimeEvidence{
		Kind:              "timer",
		Settings:          settings,
		FlowInput:         cloneStringAnyMap(flowInput),
		FlowOutput:        cloneStringAnyMap(flowOutput),
		Tick:              tick,
		UnavailableFields: dedupeStrings(unavailableFields),
		Diagnostics: []diagnostic{
			{
				Code:     "flogo.run_trace.timer_trigger_evidence",
				Message:  "Captured timer settings, observed tick metadata, and mapped flow input/output evidence for the supported timer runtime slice.",
				Severity: "info",
				Path:     "triggers." + prepared.TriggerID,
				Details: map[string]any{
					"handlerName":    prepared.HandlerName,
					"runMode":        runMode,
					"startDelay":     prepared.StartDelay,
					"repeatInterval": prepared.RepeatInterval,
					"tickCount":      tick.TickCount,
				},
			},
		},
	}
}

func attachRuntimeTraceEvidence(trace *runTrace, app flogoApp, flowID string, request runTraceRequest, runtimeMode string, recorderEvidence *runtimeTraceRecorderEvidence, taskEvents []map[string]any) {
	if trace == nil {
		return
	}

	trace.RuntimeEvidence = buildRuntimeEvidence(
		runTraceEvidenceKindRuntimeBacked,
		runtimeMode,
		"",
		recorderEvidence,
		taskEvents,
	)
	if trace.RuntimeEvidence != nil && trace.RuntimeEvidence.RecorderMode == "" {
		trace.RuntimeEvidence.RecorderMode = "full"
	}
	if trace.RuntimeEvidence != nil {
		trace.RuntimeEvidence.NormalizedSteps = buildNormalizedRuntimeSteps(app, flowID, request.Capture, trace.Steps, trace.RuntimeEvidence)
		if request.Capture.IncludeFlowState {
			for index := range trace.Steps {
				if index >= len(trace.RuntimeEvidence.NormalizedSteps) {
					break
				}
				trace.Steps[index].FlowState = cloneStringAnyMap(trace.RuntimeEvidence.NormalizedSteps[index].FlowStateAfter)
			}
		}
		if len(trace.RuntimeEvidence.NormalizedSteps) > 0 {
			requested, captured, unavailable := runtimeNormalizedRequestedAndCapturedFields(request.Capture, trace.RuntimeEvidence.NormalizedSteps)
			normalizedDiagnostics := []diagnostic{
				{
					Code:     "flogo.run_trace.normalized_step_evidence",
					Message:  "Captured normalized per-step runtime evidence by combining task events, Flow recorder state, and app metadata on the supported runtime-backed slice.",
					Severity: "info",
					Path:     "resources." + flowID,
					Details: map[string]any{
						"normalizedStepCount": len(trace.RuntimeEvidence.NormalizedSteps),
						"requestedFields":     requested,
						"capturedFields":      captured,
						"unavailableFields":   unavailable,
					},
				},
			}
			trace.Diagnostics = dedupeDiagnostics(append(normalizedDiagnostics, trace.Diagnostics...))
			trace.Summary.Diagnostics = dedupeDiagnostics(append(normalizedDiagnostics, trace.Summary.Diagnostics...))
		}
	}
	if trace.RuntimeEvidence != nil && trace.RuntimeEvidence.RecorderBacked {
		recorderDiagnostics := []diagnostic{
			{
				Code:     "flogo.run_trace.recorder_backed",
				Message:  "Captured recorder-backed Flow state evidence through the official Flogo Flow recorder interface.",
				Severity: "info",
				Path:     "resources." + flowID,
				Details: map[string]any{
					"recordingMode": trace.RuntimeEvidence.RecorderMode,
					"snapshotCount": len(trace.RuntimeEvidence.Snapshots),
					"stepCount":     len(trace.RuntimeEvidence.Steps),
					"hasStart":      len(trace.RuntimeEvidence.FlowStart) > 0,
					"hasDone":       len(trace.RuntimeEvidence.FlowDone) > 0,
				},
			},
		}
		trace.Diagnostics = dedupeDiagnostics(append(recorderDiagnostics, trace.Diagnostics...))
		trace.Summary.Diagnostics = dedupeDiagnostics(append(recorderDiagnostics, trace.Summary.Diagnostics...))
	}
}

func buildRuntimeTraceEngineConfigJSON(flowID string) (string, error) {
	registerRuntimeTraceSupport()

	engineConfig := coreengine.Config{
		Name:              "runtime-trace-helper",
		Type:              "flogo:engine",
		Description:       "runtime trace helper engine",
		StopEngineOnError: true,
		RunnerType:        coreengine.ValueRunnerTypeDirect,
		ActionSettings: map[string]map[string]interface{}{
			supportedRuntimeFlowActionRef: {
				flow.StateRecordingMode: string(flowstate.RecordingModeFull),
			},
		},
		Services: []*coreengine.ServiceConfig{
			{
				Ref:     runtimeTraceRecorderFactoryRef,
				Enabled: true,
				Settings: map[string]interface{}{
					"name": runtimeTraceRecorderServiceName,
				},
			},
		},
	}

	bytes, err := json.Marshal(engineConfig)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func newRuntimeTraceListener(capture runTraceCaptureOptions) *runtimeTraceListener {
	return &runtimeTraceListener{
		capture:    capture,
		steps:      map[string]*runTraceTaskStep{},
		taskEvents: []map[string]any{},
		done:       make(chan struct{}),
	}
}

func (listener *runtimeTraceListener) HandleEvent(ctx *coreevent.Context) error {
	listener.mu.Lock()
	defer listener.mu.Unlock()

	switch ctx.GetEventType() {
	case flowevent.TaskEventType:
		event, ok := ctx.GetEvent().(flowevent.TaskEvent)
		if !ok {
			return nil
		}
		listener.taskEventCount++
		listener.taskEvents = append(listener.taskEvents, runtimeTaskEventToMap(event))

		taskID := strings.TrimSpace(event.TaskInstanceId())
		if taskID == "" {
			taskID = valueOrFallback(strings.TrimSpace(event.TaskName()), fmt.Sprintf("task_%d", listener.taskEventCount))
		}
		step, exists := listener.steps[taskID]
		if !exists {
			step = &runTraceTaskStep{
				TaskID:      taskID,
				TaskName:    event.TaskName(),
				ActivityRef: event.ActivityRef(),
				Type:        valueOrFallback(event.TaskType(), "activity"),
				Status:      "completed",
				Diagnostics: []diagnostic{},
			}
			listener.steps[taskID] = step
			listener.stepOrder = append(listener.stepOrder, taskID)
		}

		switch event.TaskStatus() {
		case flowevent.SCHEDULED, flowevent.STARTED:
			if step.StartedAt == "" {
				step.StartedAt = event.Time().UTC().Format(time.RFC3339Nano)
			}
		case flowevent.COMPLETED:
			if step.StartedAt == "" {
				step.StartedAt = event.Time().UTC().Format(time.RFC3339Nano)
			}
			step.Status = "completed"
			step.FinishedAt = event.Time().UTC().Format(time.RFC3339Nano)
		case flowevent.FAILED, flowevent.CANCELLED:
			if step.StartedAt == "" {
				step.StartedAt = event.Time().UTC().Format(time.RFC3339Nano)
			}
			step.Status = "failed"
			step.FinishedAt = event.Time().UTC().Format(time.RFC3339Nano)
			if event.TaskError() != nil {
				step.Error = event.TaskError().Error()
			}
		case flowevent.SKIPPED:
			step.Status = "skipped"
			step.FinishedAt = event.Time().UTC().Format(time.RFC3339Nano)
		}
		if listener.capture.IncludeTaskInputs {
			if input := stripRuntimeTraceScopes(event.TaskInput()); len(input) > 0 {
				step.Input = input
			}
		}
		if listener.capture.IncludeTaskOutputs {
			if output := stripRuntimeTraceScopes(event.TaskOutput()); len(output) > 0 {
				step.Output = output
			}
		}
		if listener.capture.IncludeActivityOutputs {
			if output := stripRuntimeTraceScopes(event.TaskOutput()); len(output) > 0 {
				step.ActivityState = cloneStringAnyMap(output)
			}
		}

	case flowevent.FlowEventType:
		event, ok := ctx.GetEvent().(flowevent.FlowEvent)
		if !ok {
			return nil
		}
		listener.flowEventCount++
		if listener.flowInstanceID == "" {
			listener.flowInstanceID = event.FlowID()
		}

		filteredInput := stripRuntimeTraceScopes(event.FlowInput())
		filteredOutput := stripRuntimeTraceScopes(event.FlowOutput())
		if len(filteredInput) > 0 {
			listener.flowInput = filteredInput
		}
		if len(filteredOutput) > 0 {
			listener.flowOutput = filteredOutput
		}

		switch event.FlowStatus() {
		case flowevent.COMPLETED:
			listener.flowStatus = "completed"
			listener.terminalEventOnce.Do(func() {
				close(listener.done)
			})
		case flowevent.FAILED, flowevent.CANCELLED:
			listener.flowStatus = "failed"
			if event.FlowError() != nil {
				listener.flowError = event.FlowError().Error()
			}
			listener.terminalEventOnce.Do(func() {
				close(listener.done)
			})
		}
	}

	return nil
}

func (listener *runtimeTraceListener) buildTrace(app flogoApp, prepared runtimeTracePreparedFlow, request runTraceRequest, runtimeMode string, runtimeOutput map[string]any, runtimeErr error) *runTrace {
	listener.mu.Lock()
	defer listener.mu.Unlock()

	steps := listener.normalizedSteps(app, prepared)

	status := listener.flowStatus
	if status == "" {
		status = "completed"
	}
	if runtimeErr != nil {
		status = "failed"
	}

	finalOutput := buildRuntimeTraceOutput(app, request.FlowID, request.SampleInput, runtimeOutput, listener.flowOutput)
	traceError := listener.flowError
	if traceError == "" && runtimeErr != nil {
		traceError = runtimeErr.Error()
	}

	diagnostics := []diagnostic{
		{
			Code:     "flogo.run_trace.runtime_backed",
			Message:  "Captured runtime-backed execution evidence from official Flogo Flow/Core task and flow events.",
			Severity: "info",
			Path:     "resources." + request.FlowID,
			Details: map[string]any{
				"engine":         "project-flogo/core+flow",
				"mode":           valueOrFallback(runtimeMode, runtimeBackedTraceMode),
				"flowInstanceId": listener.flowInstanceID,
				"taskEventCount": listener.taskEventCount,
				"flowEventCount": listener.flowEventCount,
			},
		},
	}

	if traceError != "" {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_trace.runtime_execution_failed",
			Message:  traceError,
			Severity: "error",
			Path:     "resources." + request.FlowID,
		})
	}

	return &runTrace{
		AppName:      app.Name,
		FlowID:       prepared.FlowID,
		EvidenceKind: runTraceEvidenceKindRuntimeBacked,
		Summary: runTraceSummary{
			FlowID:      prepared.FlowID,
			Status:      status,
			Input:       cloneStringAnyMap(request.SampleInput),
			Output:      finalOutput,
			Error:       traceError,
			StepCount:   len(steps),
			Diagnostics: dedupeDiagnostics(diagnostics),
		},
		Steps:       steps,
		Diagnostics: dedupeDiagnostics(diagnostics),
	}
}

func (listener *runtimeTraceListener) normalizedSteps(app flogoApp, prepared runtimeTracePreparedFlow) []runTraceTaskStep {
	catalog, hasFlow := newRuntimeTraceTaskCatalog(app, prepared.FlowID)
	accumulators := map[string]*runtimeTraceStepAccumulator{}
	unmatchedOrder := []string{}

	ensureAccumulator := func(key string) *runtimeTraceStepAccumulator {
		key = strings.TrimSpace(key)
		if key == "" {
			key = fmt.Sprintf("runtime_task_%d", len(accumulators)+1)
		}
		if existing := accumulators[key]; existing != nil {
			return existing
		}
		accumulator := &runtimeTraceStepAccumulator{
			key:             key,
			evidenceSources: map[string]struct{}{},
		}
		accumulators[key] = accumulator
		unmatchedOrder = append(unmatchedOrder, key)
		return accumulator
	}

	for _, taskID := range listener.stepOrder {
		step := listener.steps[taskID]
		if step == nil {
			continue
		}
		key, task, matched := catalog.match(step.TaskID, step.TaskName, step.ActivityRef)
		if strings.TrimSpace(key) == "" {
			key = valueOrFallback(strings.TrimSpace(step.TaskID), strings.TrimSpace(step.TaskName))
		}
		accumulator := ensureAccumulator(key)
		accumulator.mergeBaseStep(*step)
		if matched {
			accumulator.applyTask(task)
			accumulator.evidenceSources["app_metadata"] = struct{}{}
		}
	}

	for _, event := range listener.taskEvents {
		key, task, matched := catalog.match(stringValue(event["taskId"]), stringValue(event["taskName"]), stringValue(event["activityRef"]))
		if strings.TrimSpace(key) == "" {
			key = valueOrFallback(strings.TrimSpace(stringValue(event["taskId"])), strings.TrimSpace(stringValue(event["taskName"])))
		}
		accumulator := ensureAccumulator(key)
		accumulator.taskEvents = append(accumulator.taskEvents, cloneStringAnyMap(event))
		accumulator.recordStatus(stringValue(event["status"]))
		accumulator.evidenceSources["task_events"] = struct{}{}
		if matched {
			accumulator.applyTask(task)
			accumulator.evidenceSources["app_metadata"] = struct{}{}
		}
		if input := mapValue(event["input"]); len(input) > 0 {
			accumulator.step.Input = cloneStringAnyMap(input)
			accumulator.evidenceSources["task_event_input"] = struct{}{}
		}
		if output := mapValue(event["output"]); len(output) > 0 {
			accumulator.step.Output = cloneStringAnyMap(output)
			accumulator.evidenceSources["task_event_output"] = struct{}{}
		}
	}

	recorder := runtimeTraceRecorderSingleton.Evidence()
	for _, snapshot := range recorder.Snapshots {
		flowState := runtimeTraceFlowStateFromSnapshot(snapshot)
		for _, taskRecord := range runtimeTraceTaskItems(snapshot["tasks"]) {
			key, task, matched := catalog.match(stringValue(taskRecord["id"]), "", "")
			if strings.TrimSpace(key) == "" {
				key = strings.TrimSpace(stringValue(taskRecord["id"]))
			}
			if key == "" {
				continue
			}
			accumulator := ensureAccumulator(key)
			if matched {
				accumulator.applyTask(task)
				accumulator.evidenceSources["app_metadata"] = struct{}{}
			}
			if flowState != nil {
				accumulator.recorderFlowState = mergeRuntimeEvidenceMap(accumulator.recorderFlowState, flowState)
			}
			if status := normalizeRuntimeRecorderTaskStatus(int(numberValue(taskRecord["status"]))); status != "" {
				accumulator.recorderTaskStatus = status
				accumulator.recordStatus(status)
			}
			accumulator.evidenceSources["recorder_snapshots"] = struct{}{}
		}
	}

	for _, recorderStep := range recorder.Steps {
		recorderFlowState, recorderTasks := runtimeTraceStepEvidence(recorderStep)
		for taskID, taskEvidence := range recorderTasks {
			key, task, matched := catalog.match(taskID, "", "")
			if strings.TrimSpace(key) == "" {
				key = strings.TrimSpace(taskID)
			}
			if key == "" {
				continue
			}
			accumulator := ensureAccumulator(key)
			if matched {
				accumulator.applyTask(task)
				accumulator.evidenceSources["app_metadata"] = struct{}{}
			}
			if recorderFlowState != nil {
				accumulator.recorderFlowState = mergeRuntimeEvidenceMap(accumulator.recorderFlowState, recorderFlowState)
			}
			if len(taskEvidence.Input) > 0 && len(accumulator.step.Input) == 0 {
				accumulator.recorderInput = cloneStringAnyMap(taskEvidence.Input)
			}
			if taskEvidence.ActivityState != nil {
				accumulator.recorderActivity = mergeRuntimeEvidenceMap(accumulator.recorderActivity, taskEvidence.ActivityState)
			}
			if taskEvidence.Status != "" {
				accumulator.recorderTaskStatus = taskEvidence.Status
				accumulator.recordStatus(taskEvidence.Status)
			}
			accumulator.evidenceSources["recorder_steps"] = struct{}{}
		}
	}

	orderedKeys := []string{}
	seen := map[string]struct{}{}
	if hasFlow {
		for _, task := range catalog.flow.Tasks {
			if accumulators[task.ID] != nil {
				orderedKeys = append(orderedKeys, task.ID)
				seen[task.ID] = struct{}{}
			}
		}
	}
	for _, key := range unmatchedOrder {
		if _, ok := seen[key]; ok {
			continue
		}
		if accumulators[key] == nil {
			continue
		}
		orderedKeys = append(orderedKeys, key)
		seen[key] = struct{}{}
	}

	steps := make([]runTraceTaskStep, 0, len(orderedKeys))
	for _, key := range orderedKeys {
		if accumulator := accumulators[key]; accumulator != nil {
			steps = append(steps, accumulator.finalize(listener.capture))
		}
	}
	return steps
}

func runtimeTraceRequestedAndCapturedFields(capture runTraceCaptureOptions, steps []runTraceTaskStep) ([]string, []string, []string) {
	requested := []string{}
	captured := []string{}
	unavailable := []string{}

	anyFlowState := false
	anyActivityState := false
	anyInput := false
	anyOutput := false
	for _, step := range steps {
		if len(step.FlowState) > 0 {
			anyFlowState = true
		}
		if len(step.ActivityState) > 0 {
			anyActivityState = true
		}
		if len(step.Input) > 0 {
			anyInput = true
		}
		if len(step.Output) > 0 {
			anyOutput = true
		}
	}

	recordField := func(name string, requestedFlag bool, capturedFlag bool) {
		if !requestedFlag {
			return
		}
		requested = append(requested, name)
		if capturedFlag {
			captured = append(captured, name)
			return
		}
		unavailable = append(unavailable, name)
	}

	recordField("flowState", capture.IncludeFlowState, anyFlowState)
	recordField("activityState", capture.IncludeActivityOutputs, anyActivityState)
	recordField("taskInput", capture.IncludeTaskInputs, anyInput)
	recordField("taskOutput", capture.IncludeTaskOutputs, anyOutput)

	return requested, captured, unavailable
}

func runtimeNormalizedRequestedAndCapturedFields(capture runTraceCaptureOptions, steps []runtimeNormalizedStep) ([]string, []string, []string) {
	requested := []string{}
	captured := []string{}
	unavailable := []string{}

	recordField := func(name string, requestedFlag bool, capturedFlag bool, unavailableFlag bool) {
		if !requestedFlag {
			return
		}
		requested = append(requested, name)
		if capturedFlag {
			captured = append(captured, name)
			return
		}
		if unavailableFlag {
			unavailable = append(unavailable, name)
		}
	}

	hasField := func(field string, value func(step runtimeNormalizedStep) bool) (bool, bool) {
		seenUnavailable := false
		for _, step := range steps {
			if value(step) {
				return true, seenUnavailable
			}
			for _, unavailableField := range step.UnavailableFields {
				if unavailableField == field {
					seenUnavailable = true
					break
				}
			}
		}
		return false, seenUnavailable
	}

	resolvedInputsCaptured, resolvedInputsUnavailable := hasField("resolvedInputs", func(step runtimeNormalizedStep) bool {
		return len(step.ResolvedInputs) > 0
	})
	producedOutputsCaptured, producedOutputsUnavailable := hasField("producedOutputs", func(step runtimeNormalizedStep) bool {
		return len(step.ProducedOutputs) > 0
	})
	flowStateBeforeCaptured, flowStateBeforeUnavailable := hasField("flowStateBefore", func(step runtimeNormalizedStep) bool {
		return len(step.FlowStateBefore) > 0
	})
	flowStateAfterCaptured, flowStateAfterUnavailable := hasField("flowStateAfter", func(step runtimeNormalizedStep) bool {
		return len(step.FlowStateAfter) > 0
	})
	stateDeltaCaptured, stateDeltaUnavailable := hasField("stateDelta", func(step runtimeNormalizedStep) bool {
		return len(step.StateDelta) > 0
	})

	recordField("resolvedInputs", capture.IncludeTaskInputs, resolvedInputsCaptured, resolvedInputsUnavailable)
	recordField("producedOutputs", capture.IncludeTaskOutputs, producedOutputsCaptured, producedOutputsUnavailable)
	recordField("flowStateBefore", capture.IncludeFlowState, flowStateBeforeCaptured, flowStateBeforeUnavailable)
	recordField("flowStateAfter", capture.IncludeFlowState, flowStateAfterCaptured, flowStateAfterUnavailable)
	recordField("stateDelta", capture.IncludeFlowState, stateDeltaCaptured, stateDeltaUnavailable)

	return requested, captured, unavailable
}

type runtimeRecorderTaskEvidence struct {
	Input         map[string]any
	ActivityState map[string]any
	Status        string
}

func newRuntimeTraceTaskCatalog(app flogoApp, flowID string) (runtimeTraceTaskCatalog, bool) {
	flow, index := findFlowByID(app, flowID)
	if index < 0 {
		return runtimeTraceTaskCatalog{}, false
	}
	catalog := runtimeTraceTaskCatalog{
		flow:             flow,
		byID:             map[string]flogoTask{},
		idsByName:        map[string][]string{},
		idsByActivityRef: map[string][]string{},
	}
	for _, task := range flow.Tasks {
		catalog.byID[task.ID] = task
		if name := strings.TrimSpace(task.Name); name != "" {
			catalog.idsByName[name] = append(catalog.idsByName[name], task.ID)
		}
		if ref := strings.TrimSpace(task.ActivityRef); ref != "" {
			catalog.idsByActivityRef[ref] = append(catalog.idsByActivityRef[ref], task.ID)
		}
	}
	return catalog, true
}

func (catalog runtimeTraceTaskCatalog) match(taskID, taskName, activityRef string) (string, flogoTask, bool) {
	taskID = strings.TrimSpace(taskID)
	taskName = strings.TrimSpace(taskName)
	activityRef = strings.TrimSpace(activityRef)

	if task, ok := catalog.byID[taskID]; ok {
		return task.ID, task, true
	}
	if ids := catalog.idsByName[taskName]; len(ids) == 1 {
		task := catalog.byID[ids[0]]
		return task.ID, task, true
	}
	if ids := catalog.idsByActivityRef[activityRef]; len(ids) == 1 {
		task := catalog.byID[ids[0]]
		return task.ID, task, true
	}
	if taskID != "" {
		return taskID, flogoTask{}, false
	}
	return taskName, flogoTask{}, false
}

func (accumulator *runtimeTraceStepAccumulator) mergeBaseStep(step runTraceTaskStep) {
	accumulator.step.TaskID = valueOrFallback(accumulator.step.TaskID, step.TaskID)
	accumulator.step.TaskName = valueOrFallback(accumulator.step.TaskName, step.TaskName)
	accumulator.step.ActivityRef = valueOrFallback(accumulator.step.ActivityRef, step.ActivityRef)
	accumulator.step.Type = valueOrFallback(accumulator.step.Type, step.Type)
	if accumulator.step.Status == "" || accumulator.step.Status == "completed" {
		accumulator.step.Status = valueOrFallback(step.Status, accumulator.step.Status)
	}
	if accumulator.step.StartedAt == "" {
		accumulator.step.StartedAt = step.StartedAt
	}
	if accumulator.step.FinishedAt == "" {
		accumulator.step.FinishedAt = step.FinishedAt
	}
	if accumulator.step.Error == "" {
		accumulator.step.Error = step.Error
	}
	if len(accumulator.step.Input) == 0 && len(step.Input) > 0 {
		accumulator.step.Input = cloneStringAnyMap(step.Input)
	}
	if len(accumulator.step.Output) == 0 && len(step.Output) > 0 {
		accumulator.step.Output = cloneStringAnyMap(step.Output)
	}
	if len(accumulator.step.FlowState) == 0 && len(step.FlowState) > 0 {
		accumulator.step.FlowState = cloneStringAnyMap(step.FlowState)
	}
	if len(accumulator.step.ActivityState) == 0 && len(step.ActivityState) > 0 {
		accumulator.step.ActivityState = cloneStringAnyMap(step.ActivityState)
	}
	accumulator.step.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(accumulator.step.Diagnostics), step.Diagnostics...))
	accumulator.recordStatus(step.Status)
}

func (accumulator *runtimeTraceStepAccumulator) applyTask(task flogoTask) {
	accumulator.task = task
	accumulator.hasTask = true
	accumulator.step.TaskID = task.ID
	accumulator.step.TaskName = valueOrFallback(task.Name, accumulator.step.TaskName)
	accumulator.step.ActivityRef = valueOrFallback(task.ActivityRef, accumulator.step.ActivityRef)
	accumulator.step.Type = valueOrFallback(task.Type, "activity")
}

func (accumulator *runtimeTraceStepAccumulator) recordStatus(status string) {
	status = strings.TrimSpace(status)
	if status == "" {
		return
	}
	if len(accumulator.statusHistory) == 0 || accumulator.statusHistory[len(accumulator.statusHistory)-1] != status {
		accumulator.statusHistory = append(accumulator.statusHistory, status)
	}
}

func (accumulator *runtimeTraceStepAccumulator) finalize(capture runTraceCaptureOptions) runTraceTaskStep {
	step := accumulator.step
	if accumulator.hasTask {
		step.TaskID = accumulator.task.ID
		step.TaskName = valueOrFallback(accumulator.task.Name, step.TaskName)
		step.ActivityRef = valueOrFallback(accumulator.task.ActivityRef, step.ActivityRef)
		step.Type = valueOrFallback(accumulator.task.Type, "activity")
	}
	if step.Type == "" {
		step.Type = "activity"
	}
	if step.StartedAt == "" {
		step.StartedAt = nowRFC3339()
	}
	if step.FinishedAt == "" && step.Status != "skipped" {
		step.FinishedAt = nowRFC3339()
	}
	if step.Status == "" {
		step.Status = valueOrFallback(accumulator.recorderTaskStatus, "completed")
	}

	if capture.IncludeTaskInputs {
		if len(step.Input) == 0 && len(accumulator.recorderInput) > 0 {
			step.Input = cloneStringAnyMap(accumulator.recorderInput)
		}
	} else {
		step.Input = nil
	}
	if !capture.IncludeTaskOutputs {
		step.Output = nil
	}
	if capture.IncludeFlowState {
		step.FlowState = mergeRuntimeEvidenceMap(step.FlowState, accumulator.recorderFlowState)
		if len(step.FlowState) == 0 {
			step.FlowState = nil
		}
	} else {
		step.FlowState = nil
	}
	if capture.IncludeActivityOutputs {
		activityState := mergeRuntimeEvidenceMap(step.ActivityState, accumulator.recorderActivity)
		if len(accumulator.statusHistory) > 0 {
			activityState = mergeRuntimeEvidenceMap(activityState, map[string]any{
				"statusHistory": cloneStringSlice(accumulator.statusHistory),
			})
		}
		if accumulator.recorderTaskStatus != "" {
			activityState = mergeRuntimeEvidenceMap(activityState, map[string]any{
				"taskStatus": accumulator.recorderTaskStatus,
			})
		}
		if len(activityState) > 0 {
			step.ActivityState = activityState
		}
	} else {
		step.ActivityState = nil
	}

	captured := []string{}
	unavailable := []string{}
	if capture.IncludeTaskInputs {
		if len(step.Input) > 0 {
			captured = append(captured, "taskInput")
		} else {
			unavailable = append(unavailable, "taskInput")
		}
	}
	if capture.IncludeTaskOutputs {
		if len(step.Output) > 0 {
			captured = append(captured, "taskOutput")
		} else {
			unavailable = append(unavailable, "taskOutput")
		}
	}
	if capture.IncludeFlowState {
		if len(step.FlowState) > 0 {
			captured = append(captured, "flowState")
		} else {
			unavailable = append(unavailable, "flowState")
		}
	}
	if capture.IncludeActivityOutputs {
		if len(step.ActivityState) > 0 {
			captured = append(captured, "activityState")
		} else {
			unavailable = append(unavailable, "activityState")
		}
	}

	sources := mapKeysSorted(accumulator.evidenceSources)
	if len(captured) > 0 || len(unavailable) > 0 || len(sources) > 0 {
		step.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(step.Diagnostics), diagnostic{
			Code:     "flogo.run_trace.runtime_step_normalized",
			Message:  fmt.Sprintf("Normalized runtime evidence for task %q from real task-event, recorder, and app-metadata sources where available.", step.TaskID),
			Severity: "info",
			Path:     "resources." + step.TaskID,
			Details: map[string]any{
				"taskId":            step.TaskID,
				"evidenceSources":   sources,
				"capturedFields":    captured,
				"unavailableFields": unavailable,
			},
		}))
	}

	return step
}

func runtimeTraceFlowStateFromSnapshot(snapshot map[string]any) map[string]any {
	state := map[string]any{}
	if snapshotID := strings.TrimSpace(stringValue(snapshot["id"])); snapshotID != "" {
		state["lastSnapshotId"] = snapshotID
	}
	if status := normalizeRuntimeRecorderFlowStatus(int(numberValue(snapshot["status"]))); status != "" {
		state["flowStatus"] = status
	}
	if attrs := mapValue(snapshot["attrs"]); len(attrs) > 0 {
		state["attrs"] = cloneStringAnyMap(attrs)
	}
	if tasks := runtimeTraceTaskItems(snapshot["tasks"]); len(tasks) > 0 {
		state["snapshotTaskCount"] = len(tasks)
	}
	if workQueue, ok := snapshot["workQueue"].([]any); ok {
		state["workQueueDepth"] = len(workQueue)
	}
	if subflows, ok := snapshot["subflows"].([]any); ok {
		state["subflowCount"] = len(subflows)
	}
	if len(state) == 0 {
		return nil
	}
	return state
}

func runtimeTraceStepEvidence(step map[string]any) (map[string]any, map[string]runtimeRecorderTaskEvidence) {
	flowState := map[string]any{}
	if stepID := strings.TrimSpace(fmt.Sprintf("%v", step["id"])); stepID != "" && stepID != "<nil>" {
		flowState["lastRecorderStepId"] = stepID
	}

	evidence := map[string]runtimeRecorderTaskEvidence{}
	rootChange := runtimeRecorderRootFlowChange(step)
	if len(rootChange) == 0 {
		if len(flowState) == 0 {
			return nil, evidence
		}
		return flowState, evidence
	}

	changeState := map[string]any{}
	if attrs := mapValue(rootChange["attrs"]); len(attrs) > 0 {
		changeState["attrs"] = cloneStringAnyMap(attrs)
	}
	if returnData := mapValue(rootChange["returnData"]); len(returnData) > 0 {
		changeState["returnData"] = cloneStringAnyMap(returnData)
	}
	if status := normalizeRuntimeRecorderFlowStatus(int(numberValue(rootChange["status"]))); status != "" {
		changeState["flowStatus"] = status
	}
	flowState = mergeRuntimeEvidenceMap(flowState, changeState)

	taskMap := mapValue(rootChange["tasks"])
	if taskID := strings.TrimSpace(stringValue(rootChange["taskId"])); taskID != "" && len(taskMap) == 0 {
		taskMap[taskID] = map[string]any{}
	}
	for taskID, rawTask := range taskMap {
		taskState := mapValue(rawTask)
		item := evidence[taskID]
		if input := mapValue(taskState["input"]); len(input) > 0 {
			item.Input = cloneStringAnyMap(input)
		}
		activityState := map[string]any{}
		if status := normalizeRuntimeRecorderTaskStatus(int(numberValue(taskState["status"]))); status != "" {
			item.Status = status
			activityState["taskStatus"] = status
		}
		if change := normalizeRuntimeRecorderChangeType(int(numberValue(taskState["change"]))); change != "" {
			activityState["change"] = change
		}
		if len(activityState) > 0 {
			item.ActivityState = mergeRuntimeEvidenceMap(item.ActivityState, activityState)
		}
		evidence[taskID] = item
	}

	if len(flowState) == 0 {
		flowState = nil
	}
	return flowState, evidence
}

func runtimeTraceFlowChanges(value any) []map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		changes := make([]map[string]any, 0, len(keys))
		for _, key := range keys {
			if item := mapValue(typed[key]); len(item) > 0 {
				changes = append(changes, item)
			}
		}
		return changes
	case []any:
		changes := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if record := mapValue(item); len(record) > 0 {
				changes = append(changes, record)
			}
		}
		return changes
	default:
		return []map[string]any{}
	}
}

func runtimeTraceTaskItems(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return []map[string]any{}
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if record := mapValue(item); len(record) > 0 {
			result = append(result, record)
		}
	}
	return result
}

func normalizeRuntimeRecorderTaskStatus(code int) string {
	switch code {
	case 0:
		return "not_started"
	case 10:
		return "scheduled"
	case 20:
		return "started"
	case 30:
		return "waiting"
	case 40:
		return "completed"
	case 50:
		return "skipped"
	case 100:
		return "failed"
	case 110:
		return "cancelled"
	default:
		if code == 0 {
			return ""
		}
		return fmt.Sprintf("status_%d", code)
	}
}

func normalizeRuntimeRecorderFlowStatus(code int) string {
	switch code {
	case 0:
		return "not_started"
	case 100:
		return "active"
	case 500:
		return "completed"
	case 600:
		return "cancelled"
	case 700:
		return "failed"
	default:
		if code == 0 {
			return ""
		}
		return fmt.Sprintf("status_%d", code)
	}
}

func normalizeRuntimeRecorderChangeType(code int) string {
	switch code {
	case 0:
		return "add"
	case 1:
		return "update"
	case 2:
		return "delete"
	default:
		return ""
	}
}

func mergeRuntimeEvidenceMap(base map[string]any, overlay map[string]any) map[string]any {
	if len(overlay) == 0 {
		return cloneStringAnyMap(base)
	}
	result := cloneStringAnyMap(base)
	for key, value := range overlay {
		result[key] = makeJSONSafe(value)
	}
	return result
}

func cloneStringSlice(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	items := make([]string, 0, len(values))
	for _, value := range values {
		items = append(items, value)
	}
	return items
}

func mapKeysSorted(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func lookupRawFlowRecord(rawApp map[string]any, flowID string) (map[string]any, bool) {
	resources := rawApp["resources"]
	switch typed := resources.(type) {
	case map[string]any:
		record, ok := typed[flowID].(map[string]any)
		return record, ok
	case []any:
		for _, item := range typed {
			record, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if valueOrFallback(stringValue(record["id"]), "") == flowID {
				return record, true
			}
		}
	}

	return nil, false
}

func normalizeRuntimeTraceMetadata(metadata map[string]any) map[string]any {
	if len(metadata) == 0 {
		return map[string]any{}
	}

	result := cloneStringAnyMap(metadata)
	result["input"] = normalizeRuntimeTraceMetadataFields(metadata["input"])
	result["output"] = normalizeRuntimeTraceMetadataFields(metadata["output"])
	return result
}

func normalizeRuntimeTraceMetadataFields(value any) []any {
	items, ok := value.([]any)
	if !ok {
		return []any{}
	}

	result := make([]any, 0, len(items))
	for _, item := range items {
		switch typed := item.(type) {
		case string:
			result = append(result, map[string]any{
				"name": typed,
				"type": "any",
			})
		case map[string]any:
			field := cloneStringAnyMap(typed)
			if strings.TrimSpace(stringValue(field["type"])) == "" {
				field["type"] = "any"
			}
			result = append(result, field)
		}
	}
	return result
}

func resolveRuntimeActivityRef(app flogoApp, ref string) (string, bool) {
	trimmed := strings.TrimSpace(ref)
	if trimmed == "" {
		return "", false
	}
	if supportedRuntimeActivityRefs[trimmed] {
		return trimmed, true
	}
	if strings.HasPrefix(trimmed, "#") {
		alias := strings.TrimPrefix(trimmed, "#")
		for _, entry := range app.Imports {
			if entry.Alias == alias && supportedRuntimeActivityRefs[entry.Ref] {
				return entry.Ref, true
			}
		}
	}
	return "", false
}

func stripRuntimeTraceScopes(value map[string]interface{}) map[string]any {
	if len(value) == 0 {
		return map[string]any{}
	}

	result := map[string]any{}
	for key, nested := range value {
		if strings.HasPrefix(key, "_") {
			continue
		}
		result[key] = makeJSONSafe(nested)
	}
	return result
}

func buildRuntimeTraceOutput(app flogoApp, flowID string, sampleInput map[string]any, runtimeOutput map[string]any, flowEventOutput map[string]any) map[string]any {
	output := cloneStringAnyMap(sampleInput)
	for key, value := range flowEventOutput {
		output[key] = makeJSONSafe(value)
	}
	for key, value := range runtimeOutput {
		output[key] = makeJSONSafe(value)
	}

	flowIndex := -1
	for index, candidate := range app.Resources {
		if candidate.ID == flowID {
			flowIndex = index
			break
		}
	}
	if flowIndex < 0 {
		return output
	}

	contract := inferFlowContract(app, app.Resources[flowIndex], &[]diagnostic{})
	if len(contract.Outputs) == 0 {
		return output
	}

	filtered := map[string]any{}
	for _, item := range contract.Outputs {
		if value, ok := output[item.Name]; ok {
			filtered[item.Name] = value
		}
	}
	if len(filtered) == 0 {
		return output
	}
	return filtered
}

func replayFlow(app flogoApp, request replayRequest) replayResponse {
	baseInput := cloneStringAnyMap(request.BaseInput)
	effectiveInput := mergeReplayInput(baseInput, request.Overrides)
	traceRequest := runTraceRequest{
		FlowID:       request.FlowID,
		SampleInput:  effectiveInput,
		Capture:      request.Capture,
		ValidateOnly: request.ValidateOnly,
	}
	var traceResponse runTraceResponse
	var runtimeFallbackDiagnostics []diagnostic
	if !request.ValidateOnly {
		if runtimeTrace, fallbackDiagnostics, ok := traceFlowRuntime(app, traceRequest); ok {
			if runtimeTrace.RuntimeEvidence != nil {
				if runtimeTrace.RuntimeEvidence.RuntimeMode == runtimeBackedRESTTriggerTraceMode {
					runtimeTrace.RuntimeEvidence.RuntimeMode = runtimeBackedRESTReplayMode
				} else if runtimeTrace.RuntimeEvidence.RuntimeMode == runtimeBackedCLITriggerTraceMode {
					runtimeTrace.RuntimeEvidence.RuntimeMode = runtimeBackedCLIReplayMode
				} else if runtimeTrace.RuntimeEvidence.RuntimeMode == runtimeBackedChannelTriggerTraceMode {
					runtimeTrace.RuntimeEvidence.RuntimeMode = runtimeBackedChannelReplayMode
				} else if runtimeTrace.RuntimeEvidence.RuntimeMode == runtimeBackedTimerTriggerTraceMode {
					runtimeTrace.RuntimeEvidence.RuntimeMode = runtimeBackedTimerReplayMode
				} else {
					runtimeTrace.RuntimeEvidence.RuntimeMode = runtimeBackedReplayMode
				}
			}
			traceResponse = runTraceResponse{Trace: runtimeTrace}
			if len(fallbackDiagnostics) > 0 {
				if traceResponse.Trace != nil {
					traceResponse.Trace.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(fallbackDiagnostics), traceResponse.Trace.Diagnostics...))
					traceResponse.Trace.Summary.Diagnostics = dedupeDiagnostics(append(cloneDiagnostics(fallbackDiagnostics), traceResponse.Trace.Summary.Diagnostics...))
				}
			}
		} else {
			runtimeFallbackDiagnostics = fallbackDiagnostics
		}
	}
	if traceResponse.Trace == nil && traceResponse.Validation == nil {
		traceResponse = traceFlowSimulated(app, traceRequest, runtimeFallbackDiagnostics...)
	}
	status := "completed"
	diagnostics := []diagnostic{}
	if traceResponse.Trace != nil && traceResponse.Trace.EvidenceKind == runTraceEvidenceKindRuntimeBacked {
		runtimeMode := ""
		if traceResponse.Trace.RuntimeEvidence != nil {
			runtimeMode = traceResponse.Trace.RuntimeEvidence.RuntimeMode
		}
		if runtimeMode == runtimeBackedRESTReplayMode {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.replay.rest_runtime_backed",
				Message:  "Captured runtime-backed replay evidence through the official Flogo REST trigger, handler mapping, flow action, and reply mapping path.",
				Severity: "info",
				Path:     "triggers",
			})
		} else if runtimeMode == runtimeBackedCLIReplayMode {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.replay.cli_runtime_backed",
				Message:  "Captured runtime-backed replay evidence through the official Flogo CLI trigger, command parsing, flow action, and reply mapping path.",
				Severity: "info",
				Path:     "triggers",
			})
		} else if runtimeMode == runtimeBackedChannelReplayMode {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.replay.channel_runtime_backed",
				Message:  "Captured runtime-backed replay evidence through the official Flogo Channel trigger, channel publish, and flow action path.",
				Severity: "info",
				Path:     "triggers",
			})
		} else if runtimeMode == runtimeBackedTimerReplayMode {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.replay.timer_runtime_backed",
				Message:  "Captured runtime-backed replay evidence through the official Flogo timer trigger and flow action path.",
				Severity: "info",
				Path:     "triggers",
			})
		} else {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.replay.runtime_backed",
				Message:  "Captured runtime-backed replay evidence through the official Flogo Flow/Core path.",
				Severity: "info",
				Path:     "resources." + request.FlowID,
			})
		}
	}
	if traceResponse.Validation != nil {
		for _, stage := range traceResponse.Validation.Stages {
			diagnostics = append(diagnostics, stage.Diagnostics...)
		}
	}
	if traceResponse.Trace != nil {
		status = traceResponse.Trace.Summary.Status
		diagnostics = append(diagnostics, traceResponse.Trace.Diagnostics...)
	}
	if traceResponse.Trace == nil && traceResponse.Validation != nil && !traceResponse.Validation.Ok {
		status = "failed"
	}

	return replayResponse{
		Result: replayResult{
			Summary: replaySummary{
				FlowID:           request.FlowID,
				Status:           status,
				InputSource:      replayInputSource(request),
				BaseInput:        baseInput,
				EffectiveInput:   effectiveInput,
				OverridesApplied: len(request.Overrides) > 0,
				Diagnostics:      dedupeDiagnostics(diagnostics),
			},
			Trace: traceResponse.Trace,
			RuntimeEvidence: func() *runtimeEvidence {
				if traceResponse.Trace == nil && traceResponse.Validation != nil {
					return nil
				}
				if traceResponse.Trace != nil && traceResponse.Trace.RuntimeEvidence != nil {
					return traceResponse.Trace.RuntimeEvidence
				}
				return &runtimeEvidence{
					Kind:           runTraceEvidenceKindSimulatedFallback,
					FallbackReason: runtimeFallbackReasonFromDiagnostics(runtimeFallbackDiagnostics),
				}
			}(),
			Validation: traceResponse.Validation,
		},
	}
}

type comparableRunStep struct {
	TaskID        string
	Status        string
	Input         map[string]any
	Output        map[string]any
	FlowState     map[string]any
	ActivityState map[string]any
	Diagnostics   []diagnostic
}

type comparableRun struct {
	ArtifactID      string
	Kind            string
	FlowID          string
	SummaryStatus   string
	Input           map[string]any
	Output          map[string]any
	Error           string
	StepCount       int
	EvidenceKind    string
	ComparisonBasis string
	Diagnostics     []diagnostic
	Steps           []comparableRunStep
	RuntimeEvidence *runtimeEvidence
	ReplaySummary   *replaySummary
}

func compareRuns(request runComparisonRequest) runComparisonResponse {
	left := normalizeComparableRun(request.LeftArtifact)
	right := normalizeComparableRun(request.RightArtifact)
	diagnostics := []diagnostic{}
	if left.FlowID != right.FlowID {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.flow_mismatch",
			Message:  fmt.Sprintf("Comparing runs from different flows (%q vs %q).", left.FlowID, right.FlowID),
			Severity: "warning",
		})
	}
	comparisonBasis := chooseRunComparisonBasis(left, right)

	if request.ValidateOnly {
		validation := validationReport{
			Ok: true,
			Stages: []validationStageResult{
				{
					Stage:       "runtime",
					Ok:          true,
					Diagnostics: append(diagnostics, diagnostic{Code: "flogo.run_comparison.ready", Message: "Run comparison inputs are valid and ready to compare.", Severity: "info"}),
				},
			},
			Summary:   "Run comparison inputs are valid.",
			Artifacts: []map[string]any{},
		}
		return runComparisonResponse{Validation: &validation}
	}

	result := runComparisonResult{
		Left: runComparisonArtifactRef{
			ArtifactID:                 left.ArtifactID,
			Kind:                       left.Kind,
			SummaryStatus:              left.SummaryStatus,
			FlowID:                     left.FlowID,
			EvidenceKind:               left.EvidenceKind,
			NormalizedStepEvidence:     runtimeEvidenceHasNormalizedSteps(left.RuntimeEvidence),
			RestTriggerRuntimeEvidence: runtimeEvidenceHasRestTriggerRuntime(left.RuntimeEvidence),
			RestTriggerRuntimeKind: func() string {
				if left.RuntimeEvidence == nil || left.RuntimeEvidence.RestTriggerRuntime == nil {
					return ""
				}
				return left.RuntimeEvidence.RestTriggerRuntime.Kind
			}(),
			CLITriggerRuntimeEvidence: runtimeEvidenceHasCLITriggerRuntime(left.RuntimeEvidence),
			CLITriggerRuntimeKind: func() string {
				if left.RuntimeEvidence == nil || left.RuntimeEvidence.CLITriggerRuntime == nil {
					return ""
				}
				return left.RuntimeEvidence.CLITriggerRuntime.Kind
			}(),
			TimerTriggerRuntimeEvidence: runtimeEvidenceHasTimerTriggerRuntime(left.RuntimeEvidence),
			TimerTriggerRuntimeKind: func() string {
				if left.RuntimeEvidence == nil || left.RuntimeEvidence.TimerTriggerRuntime == nil {
					return ""
				}
				return left.RuntimeEvidence.TimerTriggerRuntime.Kind
			}(),
			ChannelTriggerRuntimeEvidence: runtimeEvidenceHasChannelTriggerRuntime(left.RuntimeEvidence),
			ChannelTriggerRuntimeKind: func() string {
				if left.RuntimeEvidence == nil || left.RuntimeEvidence.ChannelTriggerRuntime == nil {
					return ""
				}
				return left.RuntimeEvidence.ChannelTriggerRuntime.Kind
			}(),
			ChannelTriggerRuntimeChannel: func() string {
				if left.RuntimeEvidence == nil || left.RuntimeEvidence.ChannelTriggerRuntime == nil || left.RuntimeEvidence.ChannelTriggerRuntime.Handler == nil {
					return ""
				}
				return left.RuntimeEvidence.ChannelTriggerRuntime.Handler.Channel
			}(),
			ComparisonBasisPreference: left.ComparisonBasis,
		},
		Right: runComparisonArtifactRef{
			ArtifactID:                 right.ArtifactID,
			Kind:                       right.Kind,
			SummaryStatus:              right.SummaryStatus,
			FlowID:                     right.FlowID,
			EvidenceKind:               right.EvidenceKind,
			NormalizedStepEvidence:     runtimeEvidenceHasNormalizedSteps(right.RuntimeEvidence),
			RestTriggerRuntimeEvidence: runtimeEvidenceHasRestTriggerRuntime(right.RuntimeEvidence),
			RestTriggerRuntimeKind: func() string {
				if right.RuntimeEvidence == nil || right.RuntimeEvidence.RestTriggerRuntime == nil {
					return ""
				}
				return right.RuntimeEvidence.RestTriggerRuntime.Kind
			}(),
			CLITriggerRuntimeEvidence: runtimeEvidenceHasCLITriggerRuntime(right.RuntimeEvidence),
			CLITriggerRuntimeKind: func() string {
				if right.RuntimeEvidence == nil || right.RuntimeEvidence.CLITriggerRuntime == nil {
					return ""
				}
				return right.RuntimeEvidence.CLITriggerRuntime.Kind
			}(),
			TimerTriggerRuntimeEvidence: runtimeEvidenceHasTimerTriggerRuntime(right.RuntimeEvidence),
			TimerTriggerRuntimeKind: func() string {
				if right.RuntimeEvidence == nil || right.RuntimeEvidence.TimerTriggerRuntime == nil {
					return ""
				}
				return right.RuntimeEvidence.TimerTriggerRuntime.Kind
			}(),
			ChannelTriggerRuntimeEvidence: runtimeEvidenceHasChannelTriggerRuntime(right.RuntimeEvidence),
			ChannelTriggerRuntimeKind: func() string {
				if right.RuntimeEvidence == nil || right.RuntimeEvidence.ChannelTriggerRuntime == nil {
					return ""
				}
				return right.RuntimeEvidence.ChannelTriggerRuntime.Kind
			}(),
			ChannelTriggerRuntimeChannel: func() string {
				if right.RuntimeEvidence == nil || right.RuntimeEvidence.ChannelTriggerRuntime == nil || right.RuntimeEvidence.ChannelTriggerRuntime.Handler == nil {
					return ""
				}
				return right.RuntimeEvidence.ChannelTriggerRuntime.Handler.Channel
			}(),
			ComparisonBasisPreference: right.ComparisonBasis,
		},
		ComparisonBasis: comparisonBasis,
		Summary: runComparisonSummaryDiff{
			StatusChanged:   left.SummaryStatus != right.SummaryStatus,
			InputDiff:       createRunComparisonValueDiff(left.Input, right.Input),
			OutputDiff:      createRunComparisonValueDiff(left.Output, right.Output),
			ErrorDiff:       createRunComparisonValueDiff(emptyStringToNil(left.Error), emptyStringToNil(right.Error)),
			StepCountDiff:   createRunComparisonValueDiff(left.StepCount, right.StepCount),
			DiagnosticDiffs: buildRunComparisonSummaryDiagnostics(left, right, request.Compare.IncludeDiagnostics),
		},
		RestComparison:    buildRunComparisonRESTEnvelopeDiff(left, right),
		ChannelComparison: buildRunComparisonChannelRuntimeDiff(left, right),
		TimerComparison:   buildRunComparisonTimerRuntimeDiff(left, right),
		Steps:             compareRunSteps(left, right, request.Compare),
		Diagnostics:       diagnostics,
	}

	return runComparisonResponse{
		Result: &result,
	}
}

func normalizeComparableRun(artifact comparableRunArtifactInput) comparableRun {
	if artifact.Kind == "run_trace" {
		tracePayload, _ := artifact.Payload["trace"].(map[string]any)
		if tracePayload == nil {
			fail(fmt.Sprintf("artifact %q does not contain a trace payload", artifact.ArtifactID))
		}
		trace := parseRunTrace(tracePayload)
		return comparableRun{
			ArtifactID:      artifact.ArtifactID,
			Kind:            artifact.Kind,
			FlowID:          trace.FlowID,
			SummaryStatus:   trace.Summary.Status,
			Input:           preferRecordedFlowInputs(trace),
			Output:          preferRecordedFlowOutputs(trace),
			Error:           trace.Summary.Error,
			StepCount:       preferRecordedStepCount(trace),
			EvidenceKind:    trace.EvidenceKind,
			ComparisonBasis: runComparisonBasisForTrace(trace),
			Diagnostics:     dedupeDiagnostics(append(cloneDiagnostics(trace.Summary.Diagnostics), trace.Diagnostics...)),
			Steps:           mapComparableEvidenceSteps(trace),
			RuntimeEvidence: trace.RuntimeEvidence,
		}
	}

	resultPayload, _ := artifact.Payload["result"].(map[string]any)
	if resultPayload == nil {
		fail(fmt.Sprintf("artifact %q does not contain a replay result payload", artifact.ArtifactID))
	}
	replay := parseReplayResult(resultPayload)
	runtimeEvidence := replayRuntimeEvidence(replay)
	input := cloneStringAnyMap(replay.Summary.EffectiveInput)
	if runtimeEvidence != nil {
		if recordedInput := recorderFlowInputs(runtimeEvidence.FlowStart); len(recordedInput) > 0 {
			input = recordedInput
		} else if recordedInput := recorderFlowInputs(runtimeEvidence.FlowDone); len(recordedInput) > 0 {
			input = recordedInput
		}
	}
	output := recorderFlowOutputs(nil)
	if runtimeEvidence != nil {
		output = recorderFlowOutputs(runtimeEvidence.FlowDone)
		if len(output) == 0 {
			output = recorderFlowOutputs(runtimeEvidence.FlowStart)
		}
	}
	flowID := replay.Summary.FlowID
	summaryStatus := replay.Summary.Status
	stepCount := 0
	if runtimeEvidence != nil {
		if len(runtimeEvidence.Steps) > stepCount {
			stepCount = len(runtimeEvidence.Steps)
		}
		if len(runtimeEvidence.Snapshots) > stepCount {
			stepCount = len(runtimeEvidence.Snapshots)
		}
		if len(runtimeEvidence.NormalizedSteps) > stepCount {
			stepCount = len(runtimeEvidence.NormalizedSteps)
		}
	}
	diagnostics := cloneDiagnostics(replay.Summary.Diagnostics)
	steps := []comparableRunStep{}
	errorValue := ""
	if replay.Trace != nil {
		input = preferRecordedFlowInputs(*replay.Trace)
		output = preferRecordedFlowOutputs(*replay.Trace)
		flowID = replay.Trace.FlowID
		summaryStatus = replay.Trace.Summary.Status
		stepCount = preferRecordedStepCount(*replay.Trace)
		errorValue = replay.Trace.Summary.Error
		diagnostics = append(diagnostics, replay.Trace.Summary.Diagnostics...)
		diagnostics = append(diagnostics, replay.Trace.Diagnostics...)
		steps = mapComparableEvidenceSteps(*replay.Trace)
	}
	if len(output) == 0 {
		if runtimeEvidence := replayRuntimeEvidence(replay); runtimeEvidence != nil {
			if recordedOutput := recorderFlowOutputs(runtimeEvidence.FlowDone); len(recordedOutput) > 0 {
				output = recordedOutput
			} else if recordedOutput := recorderFlowOutputs(runtimeEvidence.FlowStart); len(recordedOutput) > 0 {
				output = recordedOutput
			}
			if len(input) == 0 {
				if recordedInput := recorderFlowInputs(runtimeEvidence.FlowStart); len(recordedInput) > 0 {
					input = recordedInput
				}
			}
			if stepCount == 0 {
				stepCount = len(runtimeEvidence.Steps)
				if len(runtimeEvidence.Snapshots) > stepCount {
					stepCount = len(runtimeEvidence.Snapshots)
				}
				if len(runtimeEvidence.NormalizedSteps) > stepCount {
					stepCount = len(runtimeEvidence.NormalizedSteps)
				}
			}
		}
	}
	return comparableRun{
		ArtifactID:      artifact.ArtifactID,
		Kind:            artifact.Kind,
		FlowID:          flowID,
		SummaryStatus:   summaryStatus,
		Input:           input,
		Output:          output,
		Error:           errorValue,
		StepCount:       stepCount,
		EvidenceKind:    replayTraceEvidenceKind(replay),
		ComparisonBasis: runComparisonBasisForReplay(replay),
		Diagnostics:     dedupeDiagnostics(diagnostics),
		Steps:           steps,
		RuntimeEvidence: runtimeEvidence,
		ReplaySummary:   &replay.Summary,
	}
}

func preferRecordedFlowInputs(trace runTrace) map[string]any {
	if trace.RuntimeEvidence != nil {
		if inputs := recorderFlowInputs(trace.RuntimeEvidence.FlowStart); len(inputs) > 0 {
			return inputs
		}
		if inputs := recorderFlowInputs(trace.RuntimeEvidence.FlowDone); len(inputs) > 0 {
			return inputs
		}
	}
	return cloneStringAnyMap(trace.Summary.Input)
}

func preferRecordedFlowOutputs(trace runTrace) map[string]any {
	if trace.RuntimeEvidence != nil {
		if outputs := recorderFlowOutputs(trace.RuntimeEvidence.FlowDone); len(outputs) > 0 {
			return outputs
		}
		if outputs := recorderFlowOutputs(trace.RuntimeEvidence.FlowStart); len(outputs) > 0 {
			return outputs
		}
	}
	return cloneStringAnyMap(trace.Summary.Output)
}

func preferRecordedStepCount(trace runTrace) int {
	stepCount := trace.Summary.StepCount
	if trace.RuntimeEvidence != nil {
		if len(trace.RuntimeEvidence.Steps) > stepCount {
			stepCount = len(trace.RuntimeEvidence.Steps)
		}
		if len(trace.RuntimeEvidence.Snapshots) > stepCount {
			stepCount = len(trace.RuntimeEvidence.Snapshots)
		}
		if len(trace.RuntimeEvidence.NormalizedSteps) > stepCount {
			stepCount = len(trace.RuntimeEvidence.NormalizedSteps)
		}
	}
	return stepCount
}

func runComparisonBasisForTrace(trace runTrace) string {
	if runtimeEvidenceHasChannelTriggerRuntime(trace.RuntimeEvidence) {
		return "channel_runtime_boundary"
	}
	if runtimeEvidenceHasRestTriggerRuntime(trace.RuntimeEvidence) {
		return "rest_runtime_envelope"
	}
	if runtimeEvidenceHasTimerTriggerRuntime(trace.RuntimeEvidence) {
		return "timer_runtime_startup"
	}
	if runtimeEvidenceHasNormalizedSteps(trace.RuntimeEvidence) {
		return "normalized_runtime_evidence"
	}
	if trace.RuntimeEvidence != nil && trace.RuntimeEvidence.RecorderBacked {
		return "recorder_backed"
	}
	if trace.EvidenceKind == runTraceEvidenceKindRuntimeBacked {
		return "runtime_backed"
	}
	return "simulated_fallback"
}

func replayTraceEvidenceKind(replay replayResult) string {
	if replay.RuntimeEvidence != nil && strings.TrimSpace(replay.RuntimeEvidence.Kind) != "" {
		return replay.RuntimeEvidence.Kind
	}
	if replay.Trace == nil {
		return ""
	}
	return replay.Trace.EvidenceKind
}

func runComparisonBasisForReplay(replay replayResult) string {
	runtimeEvidence := replayRuntimeEvidence(replay)
	if runtimeEvidenceHasChannelTriggerRuntime(runtimeEvidence) {
		return "channel_runtime_boundary"
	}
	if runtimeEvidenceHasRestTriggerRuntime(runtimeEvidence) {
		return "rest_runtime_envelope"
	}
	if runtimeEvidenceHasTimerTriggerRuntime(runtimeEvidence) {
		return "timer_runtime_startup"
	}
	if runtimeEvidenceHasNormalizedSteps(runtimeEvidence) {
		return "normalized_runtime_evidence"
	}
	if runtimeEvidence != nil && runtimeEvidence.RecorderBacked {
		return "recorder_backed"
	}
	if replay.Trace == nil {
		return "simulated_fallback"
	}
	return runComparisonBasisForTrace(*replay.Trace)
}

func chooseRunComparisonBasis(left, right comparableRun) string {
	switch {
	case channelRuntimeBoundaryComparable(left, right):
		return "channel_runtime_boundary"
	case restRuntimeEnvelopeComparable(left, right):
		return "rest_runtime_envelope"
	case timerRuntimeStartupComparable(left, right):
		return "timer_runtime_startup"
	case left.ComparisonBasis == "normalized_runtime_evidence" && right.ComparisonBasis == "normalized_runtime_evidence":
		return "normalized_runtime_evidence"
	case comparisonBasisUsesRecorderEvidence(left.ComparisonBasis) && comparisonBasisUsesRecorderEvidence(right.ComparisonBasis):
		return "recorder_backed"
	case comparisonBasisUsesRecorderEvidence(left.ComparisonBasis) || comparisonBasisUsesRecorderEvidence(right.ComparisonBasis):
		return "recorder_preferred"
	case left.ComparisonBasis == "runtime_backed" || right.ComparisonBasis == "runtime_backed":
		return "runtime_backed"
	default:
		return "simulated_fallback"
	}
}

func mapComparableRunSteps(steps []runTraceTaskStep) []comparableRunStep {
	items := make([]comparableRunStep, 0, len(steps))
	for _, step := range steps {
		items = append(items, comparableRunStep{
			TaskID:        step.TaskID,
			Status:        step.Status,
			Input:         cloneStringAnyMap(step.Input),
			Output:        cloneStringAnyMap(step.Output),
			FlowState:     cloneStringAnyMap(step.FlowState),
			ActivityState: cloneStringAnyMap(step.ActivityState),
			Diagnostics:   cloneDiagnostics(step.Diagnostics),
		})
	}
	return items
}

func mapComparableNormalizedSteps(steps []runtimeNormalizedStep) []comparableRunStep {
	items := make([]comparableRunStep, 0, len(steps))
	for _, step := range steps {
		flowState := map[string]any{}
		if len(step.FlowStateBefore) > 0 {
			flowState["before"] = cloneStringAnyMap(step.FlowStateBefore)
		}
		if len(step.FlowStateAfter) > 0 {
			flowState["after"] = cloneStringAnyMap(step.FlowStateAfter)
		}
		if len(step.StateDelta) > 0 {
			flowState["delta"] = cloneStringAnyMap(step.StateDelta)
		}

		activityState := map[string]any{}
		if len(step.DeclaredInputMappings) > 0 {
			activityState["declaredInputMappings"] = cloneStringAnyMap(step.DeclaredInputMappings)
		}
		if len(step.DeclaredOutputMappings) > 0 {
			activityState["declaredOutputMappings"] = cloneStringAnyMap(step.DeclaredOutputMappings)
		}
		if len(step.EvidenceSource) > 0 {
			activityState["evidenceSource"] = cloneStringSliceMap(step.EvidenceSource)
		}
		if len(step.UnavailableFields) > 0 {
			activityState["unavailableFields"] = append([]string{}, step.UnavailableFields...)
		}

		items = append(items, comparableRunStep{
			TaskID:        step.TaskID,
			Status:        step.Status,
			Input:         cloneStringAnyMap(step.ResolvedInputs),
			Output:        cloneStringAnyMap(step.ProducedOutputs),
			FlowState:     flowState,
			ActivityState: activityState,
			Diagnostics:   cloneDiagnostics(step.Diagnostics),
		})
	}
	return items
}

func mapComparableEvidenceSteps(trace runTrace) []comparableRunStep {
	if runtimeEvidenceHasNormalizedSteps(trace.RuntimeEvidence) {
		return mapComparableNormalizedSteps(trace.RuntimeEvidence.NormalizedSteps)
	}
	return mapComparableRunSteps(trace.Steps)
}

func comparisonBasisUsesRecorderEvidence(basis string) bool {
	return basis == "normalized_runtime_evidence" ||
		basis == "recorder_backed" ||
		basis == "channel_runtime_boundary" ||
		basis == "rest_runtime_envelope" ||
		basis == "timer_runtime_startup"
}

func recorderFlowInputs(state map[string]any) map[string]any {
	if len(state) == 0 {
		return map[string]any{}
	}
	if inputs, ok := state["flow_inputs"].(map[string]any); ok {
		return cloneStringAnyMap(inputs)
	}
	return map[string]any{}
}

func recorderFlowOutputs(state map[string]any) map[string]any {
	if len(state) == 0 {
		return map[string]any{}
	}
	if outputs, ok := state["flow_outputs"].(map[string]any); ok {
		return cloneStringAnyMap(outputs)
	}
	return map[string]any{}
}

func buildRunComparisonSummaryDiagnostics(left, right comparableRun, includeDiagnostics bool) []diagnostic {
	diagnostics := []diagnostic{}
	if !includeDiagnostics {
		return diagnostics
	}
	if restRuntimeEnvelopeComparable(left, right) && left.RuntimeEvidence != nil && right.RuntimeEvidence != nil {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.rest_runtime_envelope_preferred",
			Message:  "Compared REST runtime-backed request, mapped flow input, and reply envelopes because both artifacts include REST trigger runtime evidence.",
			Severity: "info",
			Details: map[string]any{
				"leftKind":  left.RuntimeEvidence.RestTriggerRuntime.Kind,
				"rightKind": right.RuntimeEvidence.RestTriggerRuntime.Kind,
			},
		})
	}
	if timerRuntimeStartupComparable(left, right) && left.RuntimeEvidence != nil && right.RuntimeEvidence != nil {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.timer_runtime_startup_preferred",
			Message:  "Compared timer trigger startup evidence, schedule settings, and runtime start/output capture using the helper-supported timer slice.",
			Severity: "info",
			Details: map[string]any{
				"leftSettingsObserved":  left.RuntimeEvidence.TimerTriggerRuntime.Settings != nil,
				"rightSettingsObserved": right.RuntimeEvidence.TimerTriggerRuntime.Settings != nil,
				"leftTickObserved":      left.RuntimeEvidence.TimerTriggerRuntime.Tick != nil,
				"rightTickObserved":     right.RuntimeEvidence.TimerTriggerRuntime.Tick != nil,
			},
		})
	}
	if channelRuntimeBoundaryComparable(left, right) && left.RuntimeEvidence != nil && right.RuntimeEvidence != nil {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.channel_runtime_boundary_preferred",
			Message:  "Compared Channel trigger boundary evidence, sent data, mapped flow input, and flow output using the helper-supported Channel slice.",
			Severity: "info",
			Details: map[string]any{
				"leftChannelObserved":  left.RuntimeEvidence.ChannelTriggerRuntime != nil,
				"rightChannelObserved": right.RuntimeEvidence.ChannelTriggerRuntime != nil,
				"leftDataObserved":     left.RuntimeEvidence.ChannelTriggerRuntime != nil && left.RuntimeEvidence.ChannelTriggerRuntime.Data != nil,
				"rightDataObserved":    right.RuntimeEvidence.ChannelTriggerRuntime != nil && right.RuntimeEvidence.ChannelTriggerRuntime.Data != nil,
			},
		})
	}
	if left.ComparisonBasis == "normalized_runtime_evidence" && right.ComparisonBasis == "normalized_runtime_evidence" && left.RuntimeEvidence != nil && right.RuntimeEvidence != nil {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.normalized_runtime_evidence_preferred",
			Message:  "Compared normalized runtime-backed step evidence derived from task events, Flow recorder state, and app metadata.",
			Severity: "info",
			Details: map[string]any{
				"leftNormalizedSteps":  len(left.RuntimeEvidence.NormalizedSteps),
				"rightNormalizedSteps": len(right.RuntimeEvidence.NormalizedSteps),
			},
		})
	}
	if left.ComparisonBasis == "recorder_backed" && right.ComparisonBasis == "recorder_backed" && left.RuntimeEvidence != nil && right.RuntimeEvidence != nil {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.recorder_evidence_preferred",
			Message:  "Compared recorder-backed runtime artifacts using Flow recorder state where available.",
			Severity: "info",
			Details: map[string]any{
				"leftSnapshots":      len(left.RuntimeEvidence.Snapshots),
				"rightSnapshots":     len(right.RuntimeEvidence.Snapshots),
				"leftRecordedSteps":  len(left.RuntimeEvidence.Steps),
				"rightRecordedSteps": len(right.RuntimeEvidence.Steps),
			},
		})
	}
	if !runComparisonValuesEqual(left.Diagnostics, right.Diagnostics) {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.summary_diagnostics_changed",
			Message:  "Runtime diagnostics differ between the compared runs.",
			Severity: "info",
			Details: map[string]any{
				"left":  left.Diagnostics,
				"right": right.Diagnostics,
			},
		})
	}
	if left.ReplaySummary != nil && right.ReplaySummary != nil && left.ReplaySummary.InputSource != right.ReplaySummary.InputSource {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.replay_input_source_changed",
			Message:  "Replay input sources differ between the compared runs.",
			Severity: "info",
			Details: map[string]any{
				"left":  left.ReplaySummary.InputSource,
				"right": right.ReplaySummary.InputSource,
			},
		})
	}
	if left.ReplaySummary != nil && right.ReplaySummary != nil && left.ReplaySummary.OverridesApplied != right.ReplaySummary.OverridesApplied {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.replay_overrides_changed",
			Message:  "Replay override usage differs between the compared runs.",
			Severity: "info",
			Details: map[string]any{
				"left":  left.ReplaySummary.OverridesApplied,
				"right": right.ReplaySummary.OverridesApplied,
			},
		})
	}
	if left.RuntimeEvidence != nil && right.RuntimeEvidence != nil && left.RuntimeEvidence.RecorderBacked && right.RuntimeEvidence.RecorderBacked && len(left.RuntimeEvidence.Snapshots) != len(right.RuntimeEvidence.Snapshots) {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.recorder_snapshot_count_changed",
			Message:  "Recorder snapshot counts differ between the compared runs.",
			Severity: "info",
			Details: map[string]any{
				"left":  len(left.RuntimeEvidence.Snapshots),
				"right": len(right.RuntimeEvidence.Snapshots),
			},
		})
	}
	if left.RuntimeEvidence != nil && right.RuntimeEvidence != nil && left.RuntimeEvidence.RecorderBacked && right.RuntimeEvidence.RecorderBacked && len(left.RuntimeEvidence.Steps) != len(right.RuntimeEvidence.Steps) {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_comparison.recorder_step_count_changed",
			Message:  "Recorder step counts differ between the compared runs.",
			Severity: "info",
			Details: map[string]any{
				"left":  len(left.RuntimeEvidence.Steps),
				"right": len(right.RuntimeEvidence.Steps),
			},
		})
	}
	return diagnostics
}

func restRuntimeEnvelopeComparable(left, right comparableRun) bool {
	return runtimeEvidenceHasRestTriggerRuntime(left.RuntimeEvidence) &&
		runtimeEvidenceHasRestTriggerRuntime(right.RuntimeEvidence)
}

func channelRuntimeBoundaryComparable(left, right comparableRun) bool {
	return runtimeEvidenceHasChannelTriggerRuntime(left.RuntimeEvidence) &&
		runtimeEvidenceHasChannelTriggerRuntime(right.RuntimeEvidence)
}

func timerRuntimeStartupComparable(left, right comparableRun) bool {
	return runtimeEvidenceHasTimerTriggerRuntime(left.RuntimeEvidence) &&
		runtimeEvidenceHasTimerTriggerRuntime(right.RuntimeEvidence)
}

func buildRunComparisonTimerRuntimeDiff(left, right comparableRun) *runComparisonTimerRuntimeDiff {
	if !timerRuntimeStartupComparable(left, right) {
		return nil
	}

	leftTimer := left.RuntimeEvidence.TimerTriggerRuntime
	rightTimer := right.RuntimeEvidence.TimerTriggerRuntime
	settingsDiff := createRunComparisonValueDiff(leftTimer.Settings, rightTimer.Settings)
	flowInputDiff := createRunComparisonValueDiff(zeroMap(leftTimer.FlowInput), zeroMap(rightTimer.FlowInput))
	flowOutputDiff := createRunComparisonValueDiff(zeroMap(leftTimer.FlowOutput), zeroMap(rightTimer.FlowOutput))
	tickDiff := createRunComparisonValueDiff(leftTimer.Tick, rightTimer.Tick)

	return &runComparisonTimerRuntimeDiff{
		ComparisonBasis:    "timer_runtime_startup",
		RuntimeMode:        valueOrFallback(left.RuntimeEvidence.RuntimeMode, right.RuntimeEvidence.RuntimeMode),
		SettingsCompared:   true,
		FlowInputCompared:  true,
		FlowOutputCompared: true,
		TickCompared:       true,
		SettingsDiff:       &settingsDiff,
		FlowInputDiff:      &flowInputDiff,
		FlowOutputDiff:     &flowOutputDiff,
		TickDiff:           &tickDiff,
		UnsupportedFields:  dedupeStrings(append(cloneStringSlice(leftTimer.UnavailableFields), rightTimer.UnavailableFields...)),
		Diagnostics:        dedupeDiagnostics(append(cloneDiagnostics(leftTimer.Diagnostics), rightTimer.Diagnostics...)),
	}
}

func buildRunComparisonChannelRuntimeDiff(left, right comparableRun) *runComparisonChannelRuntimeDiff {
	if !channelRuntimeBoundaryComparable(left, right) {
		return nil
	}

	leftChannel := left.RuntimeEvidence.ChannelTriggerRuntime
	rightChannel := right.RuntimeEvidence.ChannelTriggerRuntime
	channelDiff := createRunComparisonValueDiff(leftChannel.Handler.Channel, rightChannel.Handler.Channel)
	dataDiff := createRunComparisonValueDiff(leftChannel.Data, rightChannel.Data)
	flowInputDiff := createRunComparisonValueDiff(zeroMap(leftChannel.FlowInput), zeroMap(rightChannel.FlowInput))
	flowOutputDiff := createRunComparisonValueDiff(zeroMap(leftChannel.FlowOutput), zeroMap(rightChannel.FlowOutput))

	return &runComparisonChannelRuntimeDiff{
		ComparisonBasis:    "channel_runtime_boundary",
		RuntimeMode:        valueOrFallback(left.RuntimeEvidence.RuntimeMode, right.RuntimeEvidence.RuntimeMode),
		ChannelCompared:    true,
		DataCompared:       true,
		FlowInputCompared:  true,
		FlowOutputCompared: true,
		ChannelDiff:        &channelDiff,
		DataDiff:           &dataDiff,
		FlowInputDiff:      &flowInputDiff,
		FlowOutputDiff:     &flowOutputDiff,
		UnsupportedFields:  dedupeStrings(append(cloneStringSlice(leftChannel.UnavailableFields), rightChannel.UnavailableFields...)),
		Diagnostics:        dedupeDiagnostics(append(cloneDiagnostics(leftChannel.Diagnostics), rightChannel.Diagnostics...)),
	}
}

func buildRunComparisonRESTEnvelopeDiff(left, right comparableRun) *runComparisonRESTEnvelopeDiff {
	if !restRuntimeEnvelopeComparable(left, right) {
		return nil
	}

	leftREST := left.RuntimeEvidence.RestTriggerRuntime
	rightREST := right.RuntimeEvidence.RestTriggerRuntime
	diff := &runComparisonRESTEnvelopeDiff{
		UnsupportedFields: []string{},
	}

	if leftREST.Request != nil && rightREST.Request != nil {
		diff.RequestEnvelopeCompared = true
		diff.Request = &runComparisonRESTRequestDiff{
			MethodDiff:      createRunComparisonValueDiff(emptyStringToNil(leftREST.Request.Method), emptyStringToNil(rightREST.Request.Method)),
			PathDiff:        createRunComparisonValueDiff(emptyStringToNil(leftREST.Request.Path), emptyStringToNil(rightREST.Request.Path)),
			QueryParamsDiff: createRunComparisonValueDiff(zeroMap(leftREST.Request.QueryParams), zeroMap(rightREST.Request.QueryParams)),
			HeadersDiff:     createRunComparisonValueDiff(zeroMap(leftREST.Request.Headers), zeroMap(rightREST.Request.Headers)),
			BodyDiff:        createRunComparisonValueDiff(leftREST.Request.Body, rightREST.Request.Body),
			PathParamsDiff:  createRunComparisonValueDiff(zeroMap(leftREST.Request.PathParams), zeroMap(rightREST.Request.PathParams)),
		}
	} else {
		diff.UnsupportedFields = append(diff.UnsupportedFields, "requestEnvelope")
	}

	if leftREST.FlowInput != nil && rightREST.FlowInput != nil {
		diff.FlowInputCompared = true
		value := createRunComparisonValueDiff(zeroMap(leftREST.FlowInput), zeroMap(rightREST.FlowInput))
		diff.FlowInputDiff = &value
	} else {
		diff.UnsupportedFields = append(diff.UnsupportedFields, "mappedFlowInput")
	}

	if leftREST.Reply != nil && rightREST.Reply != nil {
		diff.ReplyEnvelopeCompared = true
		diff.Reply = &runComparisonRESTReplyDiff{
			StatusDiff:  createRunComparisonValueDiff(leftREST.Reply.Status, rightREST.Reply.Status),
			BodyDiff:    createRunComparisonValueDiff(leftREST.Reply.Body, rightREST.Reply.Body),
			DataDiff:    createRunComparisonValueDiff(leftREST.Reply.Data, rightREST.Reply.Data),
			HeadersDiff: createRunComparisonValueDiff(zeroMap(leftREST.Reply.Headers), zeroMap(rightREST.Reply.Headers)),
			CookiesDiff: createRunComparisonValueDiff(zeroMap(leftREST.Reply.Cookies), zeroMap(rightREST.Reply.Cookies)),
		}
	} else {
		diff.UnsupportedFields = append(diff.UnsupportedFields, "replyEnvelope")
	}

	diff.UnsupportedFields = dedupeStrings(append(diff.UnsupportedFields,
		append(cloneStringSlice(leftREST.UnavailableFields), rightREST.UnavailableFields...)...,
	))
	return diff
}

func compareRunSteps(left, right comparableRun, options runComparisonOptions) []runComparisonStepDiff {
	leftSteps := map[string]comparableRunStep{}
	rightSteps := map[string]comparableRunStep{}
	taskIDs := map[string]struct{}{}
	for _, step := range left.Steps {
		leftSteps[step.TaskID] = step
		taskIDs[step.TaskID] = struct{}{}
	}
	for _, step := range right.Steps {
		rightSteps[step.TaskID] = step
		taskIDs[step.TaskID] = struct{}{}
	}

	keys := make([]string, 0, len(taskIDs))
	for taskID := range taskIDs {
		keys = append(keys, taskID)
	}
	sort.Strings(keys)

	results := make([]runComparisonStepDiff, 0, len(keys))
	for _, taskID := range keys {
		leftStep, hasLeft := leftSteps[taskID]
		rightStep, hasRight := rightSteps[taskID]
		changeKind := "changed"
		switch {
		case !hasLeft:
			changeKind = "added"
		case !hasRight:
			changeKind = "removed"
		case runComparisonValuesEqual(leftStep, rightStep):
			changeKind = "same"
		}
		diagnosticDiffs := []diagnostic{}
		if options.IncludeDiagnostics && hasLeft && hasRight && !runComparisonValuesEqual(leftStep.Diagnostics, rightStep.Diagnostics) {
			diagnosticDiffs = append(diagnosticDiffs, diagnostic{
				Code:     "flogo.run_comparison.step_diagnostics_changed",
				Message:  fmt.Sprintf("Diagnostics differ for task %q.", taskID),
				Severity: "info",
				Details: map[string]any{
					"left":  leftStep.Diagnostics,
					"right": rightStep.Diagnostics,
				},
			})
		}

		diff := runComparisonStepDiff{
			TaskID:          taskID,
			DiagnosticDiffs: diagnosticDiffs,
			ChangeKind:      changeKind,
		}
		if hasLeft {
			diff.LeftStatus = leftStep.Status
		}
		if hasRight {
			diff.RightStatus = rightStep.Status
		}
		if options.IncludeStepInputs {
			value := createRunComparisonValueDiff(zeroMap(leftStep.Input), zeroMap(rightStep.Input))
			diff.InputDiff = &value
		}
		if options.IncludeStepOutputs {
			value := createRunComparisonValueDiff(zeroMap(leftStep.Output), zeroMap(rightStep.Output))
			diff.OutputDiff = &value
		}
		if options.IncludeFlowState {
			value := createRunComparisonValueDiff(zeroMap(leftStep.FlowState), zeroMap(rightStep.FlowState))
			diff.FlowStateDiff = &value
		}
		if options.IncludeActivityState {
			value := createRunComparisonValueDiff(zeroMap(leftStep.ActivityState), zeroMap(rightStep.ActivityState))
			diff.ActivityStateDiff = &value
		}
		results = append(results, diff)
	}
	return results
}

func createRunComparisonValueDiff(left, right any) runComparisonValueDiff {
	switch {
	case left == nil && right == nil:
		return runComparisonValueDiff{Kind: "same"}
	case left == nil:
		return runComparisonValueDiff{Kind: "added", Right: right}
	case right == nil:
		return runComparisonValueDiff{Kind: "removed", Left: left}
	case runComparisonValuesEqual(left, right):
		return runComparisonValueDiff{Kind: "same", Left: left, Right: right}
	default:
		return runComparisonValueDiff{Kind: "changed", Left: left, Right: right}
	}
}

func runComparisonValuesEqual(left, right any) bool {
	return reflect.DeepEqual(normalizeRunComparisonValue(left), normalizeRunComparisonValue(right))
}

func normalizeRunComparisonValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		normalized := map[string]any{}
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			normalized[key] = normalizeRunComparisonValue(typed[key])
		}
		return normalized
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, normalizeRunComparisonValue(item))
		}
		return items
	default:
		return value
	}
}

func zeroMap(value map[string]any) any {
	if len(value) == 0 {
		return nil
	}
	return value
}

func emptyStringToNil(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func parseRunTrace(value map[string]any) runTrace {
	contents, err := json.Marshal(value)
	if err != nil {
		fail(err.Error())
	}
	var trace runTrace
	if err := json.Unmarshal(contents, &trace); err != nil {
		fail(err.Error())
	}
	return trace
}

func parseReplayResult(value map[string]any) replayResult {
	contents, err := json.Marshal(value)
	if err != nil {
		fail(err.Error())
	}
	var result replayResult
	if err := json.Unmarshal(contents, &result); err != nil {
		fail(err.Error())
	}
	return result
}

func cloneDiagnostics(values []diagnostic) []diagnostic {
	if len(values) == 0 {
		return []diagnostic{}
	}
	items := make([]diagnostic, 0, len(values))
	for _, item := range values {
		items = append(items, item)
	}
	return items
}

func cloneMapSlice(values []map[string]any) []map[string]any {
	if len(values) == 0 {
		return []map[string]any{}
	}
	items := make([]map[string]any, 0, len(values))
	for _, value := range values {
		items = append(items, cloneStringAnyMap(value))
	}
	return items
}

func cloneStringSliceMap(values map[string][]string) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	result := map[string]any{}
	for key, entries := range values {
		cloned := make([]any, 0, len(entries))
		for _, entry := range entries {
			cloned = append(cloned, entry)
		}
		result[key] = cloned
	}
	return result
}

func dedupeStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		result = append(result, trimmed)
	}
	sort.Strings(result)
	return result
}

func flowStateToMap(state *flowstate.FlowState) map[string]any {
	if state == nil {
		return map[string]any{}
	}
	return toJSONMap(state)
}

func snapshotToMap(snapshot *flowstate.Snapshot) map[string]any {
	if snapshot == nil {
		return map[string]any{}
	}
	return toJSONMap(snapshot)
}

func stepToMap(step *flowstate.Step) map[string]any {
	if step == nil {
		return map[string]any{}
	}
	return toJSONMap(step)
}

func runtimeTaskEventToMap(event flowevent.TaskEvent) map[string]any {
	status := ""
	switch event.TaskStatus() {
	case flowevent.SCHEDULED:
		status = "scheduled"
	case flowevent.STARTED:
		status = "started"
	case flowevent.COMPLETED:
		status = "completed"
	case flowevent.FAILED:
		status = "failed"
	case flowevent.CANCELLED:
		status = "cancelled"
	case flowevent.SKIPPED:
		status = "skipped"
	default:
		status = fmt.Sprintf("%v", event.TaskStatus())
	}

	item := map[string]any{
		"taskId":      strings.TrimSpace(event.TaskInstanceId()),
		"taskName":    event.TaskName(),
		"activityRef": event.ActivityRef(),
		"type":        valueOrFallback(event.TaskType(), "activity"),
		"status":      status,
		"at":          event.Time().UTC().Format(time.RFC3339Nano),
	}
	if input := stripRuntimeTraceScopes(event.TaskInput()); len(input) > 0 {
		item["input"] = input
	}
	if output := stripRuntimeTraceScopes(event.TaskOutput()); len(output) > 0 {
		item["output"] = output
	}
	if event.TaskError() != nil {
		item["error"] = event.TaskError().Error()
	}
	return item
}

func toJSONMap(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	bytes, err := json.Marshal(value)
	if err != nil {
		return map[string]any{
			"error": err.Error(),
		}
	}
	var result map[string]any
	if err := json.Unmarshal(bytes, &result); err != nil {
		return map[string]any{
			"error": err.Error(),
		}
	}
	return result
}

func replayInputSource(request replayRequest) string {
	if strings.TrimSpace(request.TraceArtifactID) != "" {
		return "trace_artifact"
	}
	return "explicit_input"
}

func mergeReplayInput(baseInput, overrides map[string]any) map[string]any {
	merged := cloneStringAnyMap(baseInput)
	for key, value := range overrides {
		merged[key] = mergeReplayValue(merged[key], value)
	}
	return merged
}

func mergeReplayValue(base, override any) any {
	switch overrideValue := override.(type) {
	case map[string]any:
		baseMap, _ := base.(map[string]any)
		result := cloneStringAnyMap(baseMap)
		for key, value := range overrideValue {
			result[key] = mergeReplayValue(result[key], value)
		}
		return result
	case []any:
		items := make([]any, 0, len(overrideValue))
		for _, item := range overrideValue {
			items = append(items, mergeReplayValue(nil, item))
		}
		return items
	default:
		return override
	}
}

func preflightRunTrace(app flogoApp, request runTraceRequest) validationReport {
	contracts := inferFlowContracts(app)
	var target *flowContract
	for _, contract := range contracts.Contracts {
		if contract.FlowID == request.FlowID {
			contractCopy := contract
			target = &contractCopy
			break
		}
	}

	diagnostics := []diagnostic{}
	if target == nil {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_trace.unknown_flow",
			Message:  fmt.Sprintf("Unable to locate flow %q", request.FlowID),
			Severity: "error",
			Path:     request.FlowID,
		})
	} else {
		for _, input := range target.Inputs {
			if input.Required {
				if _, ok := request.SampleInput[input.Name]; !ok {
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.run_trace.missing_required_input",
						Message:  fmt.Sprintf("Flow %q requires input %q for trace execution", request.FlowID, input.Name),
						Severity: "error",
						Path:     "sampleInput." + input.Name,
					})
				}
			}
		}
	}

	if len(diagnostics) == 0 {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.run_trace.ready",
			Message:  fmt.Sprintf("Flow %q can be traced with the provided sample input", request.FlowID),
			Severity: "info",
			Path:     request.FlowID,
		})
	}

	ok := true
	for _, item := range diagnostics {
		if item.Severity == "error" {
			ok = false
			break
		}
	}

	return validationReport{
		Ok: ok,
		Stages: []validationStageResult{
			{
				Stage:       "runtime",
				Ok:          ok,
				Diagnostics: dedupeDiagnostics(diagnostics),
			},
		},
		Summary: func() string {
			if ok {
				return fmt.Sprintf("Run trace plan is valid for flow %s.", request.FlowID)
			}
			return fmt.Sprintf("Run trace plan is invalid for flow %s.", request.FlowID)
		}(),
		Artifacts: []map[string]any{},
	}
}

func buildPropertyState(app flogoApp) map[string]any {
	properties := map[string]any{}
	for _, property := range app.Properties {
		name := stringValue(property["name"])
		if name == "" {
			continue
		}
		properties[name] = makeJSONSafe(property["value"])
	}
	return properties
}

func buildTraceTaskOrder(flow flogoFlow) []flogoTask {
	if len(flow.Links) == 0 {
		return append([]flogoTask{}, flow.Tasks...)
	}

	taskIndex := map[string]flogoTask{}
	inDegree := map[string]int{}
	outgoing := map[string][]map[string]any{}
	for _, task := range flow.Tasks {
		taskIndex[task.ID] = task
		inDegree[task.ID] = 0
	}
	for _, link := range flow.Links {
		from := stringValue(link["from"])
		to := stringValue(link["to"])
		if from == "" || to == "" {
			continue
		}
		outgoing[from] = append(outgoing[from], link)
		inDegree[to]++
	}

	queue := []string{}
	for _, task := range flow.Tasks {
		if inDegree[task.ID] == 0 {
			queue = append(queue, task.ID)
		}
	}
	order := []flogoTask{}
	seen := map[string]bool{}
	for len(queue) > 0 {
		currentID := queue[0]
		queue = queue[1:]
		if seen[currentID] {
			continue
		}
		seen[currentID] = true
		order = append(order, taskIndex[currentID])
		for _, link := range outgoing[currentID] {
			to := stringValue(link["to"])
			inDegree[to]--
			if inDegree[to] <= 0 {
				queue = append(queue, to)
			}
		}
	}
	if len(order) == len(flow.Tasks) {
		return order
	}
	return append([]flogoTask{}, flow.Tasks...)
}

func buildTraceTaskIndex(flow flogoFlow) map[string]flogoTask {
	index := make(map[string]flogoTask, len(flow.Tasks))
	for _, task := range flow.Tasks {
		index[task.ID] = task
	}
	return index
}

func nextTraceTaskID(flow flogoFlow, current flogoTask, failed bool) string {
	outgoing := []map[string]any{}
	for _, link := range flow.Links {
		if stringValue(link["from"]) == current.ID {
			outgoing = append(outgoing, link)
		}
	}
	if len(outgoing) == 0 {
		for index, task := range flow.Tasks {
			if task.ID == current.ID && index+1 < len(flow.Tasks) {
				return flow.Tasks[index+1].ID
			}
		}
		return ""
	}

	for _, link := range outgoing {
		linkType := strings.ToLower(stringValue(link["type"]))
		if linkType == "expression" && matchesTraceLinkCondition(stringValue(link["value"]), current.ID, failed) {
			return stringValue(link["to"])
		}
	}
	for _, link := range outgoing {
		linkType := strings.ToLower(stringValue(link["type"]))
		if linkType == "" || linkType == "dependency" {
			return stringValue(link["to"])
		}
	}
	return ""
}

func matchesTraceLinkCondition(condition string, taskID string, failed bool) bool {
	trimmed := strings.TrimSpace(condition)
	if trimmed == "" {
		return false
	}
	errorNilExpr := fmt.Sprintf("=$activity[%s].error == nil", taskID)
	errorNotNilExpr := fmt.Sprintf("=$activity[%s].error != nil", taskID)
	switch trimmed {
	case errorNilExpr:
		return !failed
	case errorNotNilExpr:
		return failed
	default:
		return false
	}
}

func evaluateTaskOutput(task flogoTask, flowState map[string]any, activityState map[string]map[string]any, propertyState map[string]any) map[string]any {
	output := map[string]any{}
	for key, value := range task.Output {
		output[key] = makeJSONSafe(resolveValue(value, mappingPreviewContext{
			Flow:     flowState,
			Activity: activityState,
			Env:      map[string]any{},
			Property: propertyState,
			Trigger:  map[string]any{},
		}))
	}
	return output
}

func makeJSONSafe(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string, bool, float64, float32, int, int32, int64, uint, uint32, uint64:
		return typed
	case map[string]any:
		result := map[string]any{}
		for key, nested := range typed {
			result[key] = makeJSONSafe(nested)
		}
		return result
	case []any:
		result := make([]any, 0, len(typed))
		for _, nested := range typed {
			result = append(result, makeJSONSafe(nested))
		}
		return result
	default:
		rv := reflect.ValueOf(value)
		if !rv.IsValid() {
			return nil
		}
		if rv.Kind() == reflect.Map {
			result := map[string]any{}
			for _, key := range rv.MapKeys() {
				result[fmt.Sprint(key.Interface())] = makeJSONSafe(rv.MapIndex(key).Interface())
			}
			return result
		}
		if rv.Kind() == reflect.Slice || rv.Kind() == reflect.Array {
			result := make([]any, 0, rv.Len())
			for index := 0; index < rv.Len(); index++ {
				result = append(result, makeJSONSafe(rv.Index(index).Interface()))
			}
			return result
		}
		return fmt.Sprintf("<non-serializable:%T>", value)
	}
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

type triggerBindingOperation struct {
	NextApp      flogoApp
	Plan         triggerBindingPlan
	PatchSummary string
	Validation   validationReport
}

type triggerBindingFailure struct {
	Message     string
	Diagnostics []diagnostic
}

func (failure triggerBindingFailure) Error() string {
	return failure.Message
}

func bindTrigger(app flogoApp, request triggerBindingRequest) triggerBindingResponse {
	operation, err := buildTriggerBindingOperation(app, request)
	if err != nil {
		fail(err.Error())
	}

	response := triggerBindingResponse{
		Result: triggerBindingResult{
			Applied:      !request.ValidateOnly,
			Plan:         operation.Plan,
			PatchSummary: operation.PatchSummary,
			Validation:   &operation.Validation,
		},
	}

	if !request.ValidateOnly {
		response.Result.App = buildBindableAppPayload(operation.NextApp)
	}

	return response
}

func buildTriggerBindingOperation(app flogoApp, request triggerBindingRequest) (triggerBindingOperation, error) {
	contracts := inferFlowContracts(app)
	var flow flowContract
	found := false
	for _, candidate := range contracts.Contracts {
		if candidate.FlowID == request.FlowID {
			flow = candidate
			found = true
			break
		}
	}
	if !found {
		return triggerBindingOperation{}, triggerBindingFailure{
			Message: fmt.Sprintf("Flow %q was not found", request.FlowID),
			Diagnostics: []diagnostic{{
				Code:     "flogo.trigger_binding.unknown_flow",
				Message:  fmt.Sprintf("Flow %q was not found", request.FlowID),
				Severity: "error",
				Path:     request.FlowID,
			}},
		}
	}

	triggerAlias, triggerImportRef := resolveTriggerImportForBinding(app, request.Profile.Kind)
	triggerRef := "#" + triggerAlias
	triggerID := valueOrFallback(strings.TrimSpace(request.TriggerID), buildTriggerID(request.FlowID, request.Profile))
	handlerName := valueOrFallback(strings.TrimSpace(request.HandlerName), buildTriggerHandlerName(request.FlowID, request.Profile))
	flowRef := "#flow:" + request.FlowID

	existing := findExistingTriggerBinding(app, flowRef, request.Profile, triggerImportRef)
	if existing != nil && !request.ReplaceExisting {
		return triggerBindingOperation{}, triggerBindingFailure{
			Message: fmt.Sprintf("A %s binding for flow %q already exists", request.Profile.Kind, request.FlowID),
			Diagnostics: []diagnostic{{
				Code:     "flogo.trigger_binding.duplicate",
				Message:  fmt.Sprintf("A %s trigger binding for flow %q already exists", request.Profile.Kind, request.FlowID),
				Severity: "error",
				Path:     "triggers." + existing.Trigger.ID,
			}},
		}
	}

	mappings := generateTriggerBindingMappings(flow, request.Profile)
	errors := []diagnostic{}
	warnings := []diagnostic{}
	for _, item := range mappings.Diagnostics {
		if item.Severity == "error" {
			errors = append(errors, item)
		} else {
			warnings = append(warnings, item)
		}
	}
	if len(errors) > 0 {
		return triggerBindingOperation{}, triggerBindingFailure{
			Message:     errors[0].Message,
			Diagnostics: errors,
		}
	}

	trigger := createBindingTrigger(triggerID, triggerRef, handlerName, request.FlowID, request.Profile, mappings)
	nextApp := applyTriggerBindingPlanToApp(app, triggerAlias, triggerImportRef, trigger, existing)
	validation := validateFlogoApp(nextApp)
	if !validation.Ok {
		diagnostics := flattenValidationDiagnostics(validation)
		return triggerBindingOperation{}, triggerBindingFailure{
			Message:     fmt.Sprintf("Generated %s trigger binding is not valid", request.Profile.Kind),
			Diagnostics: diagnostics,
		}
	}

	plan := triggerBindingPlan{
		FlowID:      request.FlowID,
		Profile:     request.Profile,
		TriggerRef:  triggerRef,
		TriggerID:   triggerID,
		HandlerName: handlerName,
		GeneratedMapping: triggerBindingMappings{
			Input:  cloneStringAnyMap(mappings.Input),
			Output: cloneStringAnyMap(mappings.Output),
		},
		Trigger:     buildTriggerPayload(trigger),
		Diagnostics: []diagnostic{},
		Warnings:    dedupeDiagnostics(warnings),
	}

	return triggerBindingOperation{
		NextApp:      nextApp,
		Plan:         plan,
		PatchSummary: summarizeTriggerBindingPatch(app, nextApp, trigger.ID),
		Validation:   validation,
	}, nil
}

func extractSubflow(app flogoApp, request subflowExtractionRequest) subflowExtractionResponse {
	operation, err := buildSubflowExtractionOperation(app, request)
	if err != nil {
		fail(err.Error())
	}

	response := subflowExtractionResponse{
		Result: subflowExtractionResult{
			Applied:      !request.ValidateOnly,
			Plan:         operation.Plan,
			PatchSummary: operation.PatchSummary,
			Validation:   &operation.Validation,
		},
	}
	if !request.ValidateOnly {
		response.Result.App = buildBindableAppPayload(operation.NextApp)
	}
	return response
}

func inlineSubflow(app flogoApp, request subflowInliningRequest) subflowInliningResponse {
	operation, err := buildSubflowInliningOperation(app, request)
	if err != nil {
		fail(err.Error())
	}

	response := subflowInliningResponse{
		Result: subflowInliningResult{
			Applied:      !request.ValidateOnly,
			Plan:         operation.Plan,
			PatchSummary: operation.PatchSummary,
			Validation:   &operation.Validation,
		},
	}
	if !request.ValidateOnly {
		response.Result.App = buildBindableAppPayload(operation.NextApp)
	}
	return response
}

type subflowExtractionOperation struct {
	NextApp      flogoApp
	Plan         subflowExtractionPlan
	PatchSummary string
	Validation   validationReport
}

type subflowInliningOperation struct {
	NextApp      flogoApp
	Plan         subflowInliningPlan
	PatchSummary string
	Validation   validationReport
}

type subflowFailure struct {
	Message     string
	Diagnostics []diagnostic
}

func (failure subflowFailure) Error() string {
	return failure.Message
}

type iteratorSynthesisOperation struct {
	NextApp      flogoApp
	Plan         iteratorSynthesisPlan
	PatchSummary string
	Validation   validationReport
}

type retryPolicyOperation struct {
	NextApp      flogoApp
	Plan         retryPolicyPlan
	PatchSummary string
	Validation   validationReport
}

type doWhileSynthesisOperation struct {
	NextApp      flogoApp
	Plan         doWhileSynthesisPlan
	PatchSummary string
	Validation   validationReport
}

type errorPathTemplateOperation struct {
	NextApp      flogoApp
	Plan         errorPathTemplatePlan
	PatchSummary string
	Validation   validationReport
}

type controlFlowFailure struct {
	Message     string
	Diagnostics []diagnostic
}

func (failure controlFlowFailure) Error() string {
	return failure.Message
}

func buildSubflowExtractionOperation(app flogoApp, request subflowExtractionRequest) (subflowExtractionOperation, error) {
	parentFlow, parentIndex := findFlowByID(app, request.FlowID)
	if parentIndex == -1 {
		return subflowExtractionOperation{}, subflowFailure{Message: fmt.Sprintf("Flow %q was not found", request.FlowID)}
	}
	if len(parentFlow.Links) > 0 {
		return subflowExtractionOperation{}, subflowFailure{Message: fmt.Sprintf("Flow %q uses links or branching that subflow extraction does not yet support", request.FlowID)}
	}

	startIndex, endIndex, selectedTasks, selectedTaskIDs, err := resolveSelectedTaskRegion(parentFlow, request.TaskIDs)
	if err != nil {
		return subflowExtractionOperation{}, err
	}

	newFlowID := strings.TrimSpace(request.NewFlowID)
	if newFlowID == "" {
		newFlowID = buildExtractedFlowID(parentFlow.ID, selectedTaskIDs)
	}
	if newFlowID == parentFlow.ID {
		return subflowExtractionOperation{}, subflowFailure{Message: fmt.Sprintf("Extracted subflow id %q conflicts with the parent flow", newFlowID)}
	}
	if _, existingIndex := findFlowByID(app, newFlowID); existingIndex >= 0 && !request.ReplaceExisting {
		return subflowExtractionOperation{}, subflowFailure{Message: fmt.Sprintf("Flow %q already exists", newFlowID)}
	}

	contracts := inferFlowContracts(app)
	var parentContract *flowContract
	for _, contract := range contracts.Contracts {
		if contract.FlowID == parentFlow.ID {
			contractCopy := contract
			parentContract = &contractCopy
			break
		}
	}

	inputNames := inferSubflowInputs(parentFlow, startIndex, endIndex)
	outputNames := inferSubflowOutputs(app, parentFlow, startIndex, endIndex)
	warnings := []diagnostic{}
	if len(inputNames) == 0 && len(outputNames) == 0 {
		warnings = append(warnings, diagnostic{
			Code:     "flogo.subflow.no_external_contract",
			Message:  "Selected tasks do not expose clear external inputs or outputs; extraction will create a self-contained subflow",
			Severity: "warning",
			Path:     "resources." + parentFlow.ID,
		})
	}

	newFlowName := strings.TrimSpace(request.NewFlowName)
	if newFlowName == "" {
		newFlowName = buildExtractedFlowName(parentFlow, selectedTasks)
	}
	invocationTaskID := createUniqueTaskID(parentFlow, strings.ReplaceAll("subflow_"+slugify(newFlowID), "-", "_"), map[string]bool{})
	invocation := flogoTask{
		ID:          invocationTaskID,
		Name:        newFlowName,
		ActivityRef: "#flow",
		Input:       map[string]any{},
		Output:      map[string]any{},
		Settings: map[string]any{
			"flowURI": "res://flow:" + newFlowID,
		},
	}
	for _, name := range inputNames {
		invocation.Input[name] = "$flow." + name
	}
	for _, name := range outputNames {
		invocation.Output[name] = fmt.Sprintf("$activity[%s].%s", invocationTaskID, name)
	}

	extractedFlow := flogoFlow{
		ID:             newFlowID,
		Name:           newFlowName,
		MetadataInput:  buildSubflowMetadata(parentContract, inputNames, true),
		MetadataOutput: buildSubflowMetadata(parentContract, outputNames, false),
		Tasks:          cloneTasks(selectedTasks),
		Links:          []map[string]any{},
	}

	nextApp := applySubflowExtractionToApp(app, parentIndex, startIndex, endIndex, invocation, extractedFlow, request.ReplaceExisting)
	var newFlowContract flowContract
	diagnostics := []diagnostic{}
	if flow, index := findFlowByID(nextApp, newFlowID); index >= 0 {
		newFlowContract = inferFlowContract(nextApp, flow, &diagnostics)
	} else {
		return subflowExtractionOperation{}, subflowFailure{Message: fmt.Sprintf("Unable to infer extracted subflow contract for %q", newFlowID)}
	}

	plan := subflowExtractionPlan{
		ParentFlowID:    parentFlow.ID,
		NewFlowID:       newFlowID,
		NewFlowName:     newFlowName,
		SelectedTaskIDs: append([]string{}, selectedTaskIDs...),
		NewFlowContract: newFlowContract,
		Invocation: subflowInvocation{
			ParentFlowID: parentFlow.ID,
			TaskID:       invocation.ID,
			ActivityRef:  invocation.ActivityRef,
			Input:        cloneStringAnyMap(invocation.Input),
			Output:       cloneStringAnyMap(invocation.Output),
			Settings:     cloneStringAnyMap(invocation.Settings),
		},
		Diagnostics: []diagnostic{},
		Warnings:    dedupeDiagnostics(warnings),
	}

	validation := validateFlogoApp(nextApp)
	if !validation.Ok {
		return subflowExtractionOperation{}, subflowFailure{
			Message:     fmt.Sprintf("Generated subflow extraction for flow %q is not valid", parentFlow.ID),
			Diagnostics: flattenValidationDiagnostics(validation),
		}
	}

	return subflowExtractionOperation{
		NextApp:      nextApp,
		Plan:         plan,
		PatchSummary: summarizeSubflowPatch(app, nextApp, "extract"),
		Validation:   validation,
	}, nil
}

func buildSubflowInliningOperation(app flogoApp, request subflowInliningRequest) (subflowInliningOperation, error) {
	parentFlow, parentIndex := findFlowByID(app, request.ParentFlowID)
	if parentIndex == -1 {
		return subflowInliningOperation{}, subflowFailure{Message: fmt.Sprintf("Flow %q was not found", request.ParentFlowID)}
	}
	if len(parentFlow.Links) > 0 {
		return subflowInliningOperation{}, subflowFailure{Message: fmt.Sprintf("Flow %q uses links or branching that subflow inlining does not yet support", request.ParentFlowID)}
	}

	invocationIndex := -1
	var invocation flogoTask
	for index, task := range parentFlow.Tasks {
		if task.ID == request.InvocationTaskID {
			invocationIndex = index
			invocation = task
			break
		}
	}
	if invocationIndex == -1 {
		return subflowInliningOperation{}, subflowFailure{Message: fmt.Sprintf("Invocation task %q was not found", request.InvocationTaskID)}
	}

	flowRef := normalizeFlowActionRef(invocation.ActivityRef, stringValue(invocation.Settings["flowURI"]))
	if !strings.HasPrefix(flowRef, "#flow:") {
		return subflowInliningOperation{}, subflowFailure{Message: fmt.Sprintf("Task %q is not a flow invocation", request.InvocationTaskID)}
	}
	inlinedFlowID := strings.TrimPrefix(flowRef, "#flow:")
	inlinedFlow, inlinedIndex := findFlowByID(app, inlinedFlowID)
	if inlinedIndex == -1 {
		return subflowInliningOperation{}, subflowFailure{Message: fmt.Sprintf("Subflow %q was not found", inlinedFlowID)}
	}
	if len(inlinedFlow.Links) > 0 {
		return subflowInliningOperation{}, subflowFailure{Message: fmt.Sprintf("Subflow %q uses links or branching that subflow inlining does not yet support", inlinedFlowID)}
	}

	generatedTaskIDs := []string{}
	usedIDs := map[string]bool{}
	for _, task := range parentFlow.Tasks {
		usedIDs[task.ID] = true
	}
	inlinedTasks := make([]flogoTask, 0, len(inlinedFlow.Tasks))
	for _, task := range inlinedFlow.Tasks {
		generatedID := createUniqueTaskID(parentFlow, request.InvocationTaskID+"__"+task.ID, usedIDs)
		usedIDs[generatedID] = true
		generatedTaskIDs = append(generatedTaskIDs, generatedID)
		inlinedTasks = append(inlinedTasks, flogoTask{
			ID:          generatedID,
			Name:        task.Name,
			Type:        task.Type,
			ActivityRef: task.ActivityRef,
			Input:       cloneStringAnyMap(task.Input),
			Output:      cloneStringAnyMap(task.Output),
			Settings:    cloneStringAnyMap(task.Settings),
		})
	}

	nextApp := applySubflowInliningToApp(app, parentIndex, invocationIndex, inlinedTasks, inlinedFlowID, request.RemoveExtractedFlowIfUnused)
	warnings := []diagnostic{}
	if request.RemoveExtractedFlowIfUnused {
		if _, stillPresent := findFlowByID(nextApp, inlinedFlowID); stillPresent >= 0 {
			warnings = append(warnings, diagnostic{
				Code:     "flogo.subflow.unused_extracted_flow",
				Message:  fmt.Sprintf("Flow %q is still referenced elsewhere and was not removed", inlinedFlowID),
				Severity: "warning",
				Path:     "resources." + inlinedFlowID,
			})
		}
	}

	validation := validateFlogoApp(nextApp)
	if !validation.Ok {
		return subflowInliningOperation{}, subflowFailure{
			Message:     fmt.Sprintf("Generated subflow inlining for flow %q is not valid", parentFlow.ID),
			Diagnostics: flattenValidationDiagnostics(validation),
		}
	}

	return subflowInliningOperation{
		NextApp: nextApp,
		Plan: subflowInliningPlan{
			ParentFlowID:     parentFlow.ID,
			InvocationTaskID: request.InvocationTaskID,
			InlinedFlowID:    inlinedFlowID,
			GeneratedTaskIDs: generatedTaskIDs,
			Diagnostics:      []diagnostic{},
			Warnings:         warnings,
		},
		PatchSummary: summarizeSubflowPatch(app, nextApp, "inline"),
		Validation:   validation,
	}, nil
}

func addIterator(app flogoApp, request iteratorSynthesisRequest) iteratorSynthesisResponse {
	operation, err := buildIteratorSynthesisOperation(app, request)
	if err != nil {
		fail(err.Error())
	}

	response := iteratorSynthesisResponse{
		Result: iteratorSynthesisResult{
			Applied:      !request.ValidateOnly,
			Plan:         operation.Plan,
			PatchSummary: operation.PatchSummary,
			Validation:   &operation.Validation,
		},
	}
	if !request.ValidateOnly {
		response.Result.App = buildBindableAppPayload(operation.NextApp)
	}
	return response
}

func addRetryPolicy(app flogoApp, request retryPolicyRequest) retryPolicyResponse {
	operation, err := buildRetryPolicyOperation(app, request)
	if err != nil {
		fail(err.Error())
	}

	response := retryPolicyResponse{
		Result: retryPolicyResult{
			Applied:      !request.ValidateOnly,
			Plan:         operation.Plan,
			PatchSummary: operation.PatchSummary,
			Validation:   &operation.Validation,
		},
	}
	if !request.ValidateOnly {
		response.Result.App = buildBindableAppPayload(operation.NextApp)
	}
	return response
}

func addDoWhile(app flogoApp, request doWhileSynthesisRequest) doWhileSynthesisResponse {
	operation, err := buildDoWhileSynthesisOperation(app, request)
	if err != nil {
		fail(err.Error())
	}

	response := doWhileSynthesisResponse{
		Result: doWhileSynthesisResult{
			Applied:      !request.ValidateOnly,
			Plan:         operation.Plan,
			PatchSummary: operation.PatchSummary,
			Validation:   &operation.Validation,
		},
	}
	if !request.ValidateOnly {
		response.Result.App = buildBindableAppPayload(operation.NextApp)
	}
	return response
}

func addErrorPath(app flogoApp, request errorPathTemplateRequest) errorPathTemplateResponse {
	operation, err := buildErrorPathTemplateOperation(app, request)
	if err != nil {
		fail(err.Error())
	}

	response := errorPathTemplateResponse{
		Result: errorPathTemplateResult{
			Applied:      !request.ValidateOnly,
			Plan:         operation.Plan,
			PatchSummary: operation.PatchSummary,
			Validation:   &operation.Validation,
		},
	}
	if !request.ValidateOnly {
		response.Result.App = buildBindableAppPayload(operation.NextApp)
	}
	return response
}

func buildIteratorSynthesisOperation(app flogoApp, request iteratorSynthesisRequest) (iteratorSynthesisOperation, error) {
	flow, flowIndex := findFlowByID(app, request.FlowID)
	if flowIndex == -1 {
		return iteratorSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Flow %q was not found", request.FlowID)}
	}
	task, taskIndex := findTaskInFlow(flow, request.TaskID)
	if taskIndex == -1 {
		return iteratorSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q was not found in flow %q", request.TaskID, request.FlowID)}
	}
	if strings.TrimSpace(request.IterateExpr) == "" {
		return iteratorSynthesisOperation{}, controlFlowFailure{Message: "Iterator synthesis requires a non-empty iterate expression"}
	}
	if strings.TrimSpace(task.ActivityRef) == "" {
		return iteratorSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q cannot be converted to an iterator because it has no activityRef", request.TaskID)}
	}
	taskType := normalizeTaskType(task.Type)
	if taskType == "doWhile" {
		return iteratorSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q is already a doWhile task and cannot also be an iterator in this slice", request.TaskID)}
	}
	if taskType == "iterator" && !request.ReplaceExisting {
		return iteratorSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q already has iterator settings", request.TaskID)}
	}

	nextApp := cloneFlogoApp(app)
	nextTask := nextApp.Resources[flowIndex].Tasks[taskIndex]
	nextTask.Type = "iterator"
	nextTask.Settings = cloneStringAnyMap(task.Settings)
	nextTask.Settings["iterate"] = strings.TrimSpace(request.IterateExpr)
	if request.Accumulate != nil {
		nextTask.Settings["accumulate"] = *request.Accumulate
	}
	nextApp.Resources[flowIndex].Tasks[taskIndex] = nextTask

	validation := validateFlogoApp(nextApp)
	if !validation.Ok {
		return iteratorSynthesisOperation{}, controlFlowFailure{
			Message:     fmt.Sprintf("Generated iterator task for %q is not valid", request.TaskID),
			Diagnostics: flattenValidationDiagnostics(validation),
		}
	}

	return iteratorSynthesisOperation{
		NextApp: nextApp,
		Plan: iteratorSynthesisPlan{
			FlowID:       request.FlowID,
			TaskID:       request.TaskID,
			NextTaskType: "iterator",
			UpdatedSetts: cloneStringAnyMap(nextTask.Settings),
			Diagnostics:  []diagnostic{},
			Warnings:     []diagnostic{},
		},
		PatchSummary: fmt.Sprintf("Converted task %q in flow %q to iterator", request.TaskID, request.FlowID),
		Validation:   validation,
	}, nil
}

func buildRetryPolicyOperation(app flogoApp, request retryPolicyRequest) (retryPolicyOperation, error) {
	flow, flowIndex := findFlowByID(app, request.FlowID)
	if flowIndex == -1 {
		return retryPolicyOperation{}, controlFlowFailure{Message: fmt.Sprintf("Flow %q was not found", request.FlowID)}
	}
	task, taskIndex := findTaskInFlow(flow, request.TaskID)
	if taskIndex == -1 {
		return retryPolicyOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q was not found in flow %q", request.TaskID, request.FlowID)}
	}
	if request.Count <= 0 {
		return retryPolicyOperation{}, controlFlowFailure{Message: "Retry policy count must be a positive integer"}
	}
	if request.IntervalMs < 0 {
		return retryPolicyOperation{}, controlFlowFailure{Message: "Retry policy interval must be a non-negative integer"}
	}
	if strings.TrimSpace(task.ActivityRef) == "" {
		return retryPolicyOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q cannot accept retryOnError because it has no activityRef", request.TaskID)}
	}
	if _, exists := task.Settings["retryOnError"]; exists && !request.ReplaceExisting {
		return retryPolicyOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q already has retryOnError settings", request.TaskID)}
	}

	nextApp := cloneFlogoApp(app)
	nextTask := nextApp.Resources[flowIndex].Tasks[taskIndex]
	nextTask.Settings = cloneStringAnyMap(task.Settings)
	nextTask.Settings["retryOnError"] = map[string]any{
		"count":    request.Count,
		"interval": request.IntervalMs,
	}
	nextApp.Resources[flowIndex].Tasks[taskIndex] = nextTask

	validation := validateFlogoApp(nextApp)
	if !validation.Ok {
		return retryPolicyOperation{}, controlFlowFailure{
			Message:     fmt.Sprintf("Generated retryOnError settings for %q are not valid", request.TaskID),
			Diagnostics: flattenValidationDiagnostics(validation),
		}
	}

	return retryPolicyOperation{
		NextApp: nextApp,
		Plan: retryPolicyPlan{
			FlowID: request.FlowID,
			TaskID: request.TaskID,
			RetryOnError: map[string]any{
				"count":    request.Count,
				"interval": request.IntervalMs,
			},
			Diagnostics: []diagnostic{},
			Warnings:    []diagnostic{},
		},
		PatchSummary: fmt.Sprintf("Added retryOnError to task %q in flow %q", request.TaskID, request.FlowID),
		Validation:   validation,
	}, nil
}

func buildDoWhileSynthesisOperation(app flogoApp, request doWhileSynthesisRequest) (doWhileSynthesisOperation, error) {
	flow, flowIndex := findFlowByID(app, request.FlowID)
	if flowIndex == -1 {
		return doWhileSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Flow %q was not found", request.FlowID)}
	}
	task, taskIndex := findTaskInFlow(flow, request.TaskID)
	if taskIndex == -1 {
		return doWhileSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q was not found in flow %q", request.TaskID, request.FlowID)}
	}
	if strings.TrimSpace(request.Condition) == "" {
		return doWhileSynthesisOperation{}, controlFlowFailure{Message: "DoWhile synthesis requires a non-empty condition"}
	}
	if strings.TrimSpace(task.ActivityRef) == "" {
		return doWhileSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q cannot be converted to doWhile because it has no activityRef", request.TaskID)}
	}
	taskType := normalizeTaskType(task.Type)
	if taskType == "iterator" {
		return doWhileSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q is already an iterator task and cannot also be a doWhile task in this slice", request.TaskID)}
	}
	if taskType == "doWhile" && !request.ReplaceExisting {
		return doWhileSynthesisOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q already has doWhile settings", request.TaskID)}
	}

	nextApp := cloneFlogoApp(app)
	nextTask := nextApp.Resources[flowIndex].Tasks[taskIndex]
	nextTask.Type = "doWhile"
	nextTask.Settings = cloneStringAnyMap(task.Settings)
	nextTask.Settings["condition"] = strings.TrimSpace(request.Condition)
	if request.DelayMs != nil {
		nextTask.Settings["delay"] = *request.DelayMs
	}
	if request.Accumulate != nil {
		nextTask.Settings["accumulate"] = *request.Accumulate
	}
	nextApp.Resources[flowIndex].Tasks[taskIndex] = nextTask

	validation := validateFlogoApp(nextApp)
	if !validation.Ok {
		return doWhileSynthesisOperation{}, controlFlowFailure{
			Message:     fmt.Sprintf("Generated doWhile task for %q is not valid", request.TaskID),
			Diagnostics: flattenValidationDiagnostics(validation),
		}
	}

	return doWhileSynthesisOperation{
		NextApp: nextApp,
		Plan: doWhileSynthesisPlan{
			FlowID:       request.FlowID,
			TaskID:       request.TaskID,
			NextTaskType: "doWhile",
			UpdatedSetts: cloneStringAnyMap(nextTask.Settings),
			Diagnostics:  []diagnostic{},
			Warnings:     []diagnostic{},
		},
		PatchSummary: fmt.Sprintf("Converted task %q in flow %q to doWhile", request.TaskID, request.FlowID),
		Validation:   validation,
	}, nil
}

func buildErrorPathTemplateOperation(app flogoApp, request errorPathTemplateRequest) (errorPathTemplateOperation, error) {
	flow, flowIndex := findFlowByID(app, request.FlowID)
	if flowIndex == -1 {
		return errorPathTemplateOperation{}, controlFlowFailure{Message: fmt.Sprintf("Flow %q was not found", request.FlowID)}
	}
	task, taskIndex := findTaskInFlow(flow, request.TaskID)
	if taskIndex == -1 {
		return errorPathTemplateOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q was not found in flow %q", request.TaskID, request.FlowID)}
	}
	if strings.TrimSpace(task.ActivityRef) == "" {
		return errorPathTemplateOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q cannot receive an error path because it has no activityRef", request.TaskID)}
	}
	if !isSupportedErrorPathLinkShapeGo(flow) {
		return errorPathTemplateOperation{}, controlFlowFailure{Message: fmt.Sprintf("Flow %q uses branching links that this slice cannot rewrite", request.FlowID)}
	}

	normalizedFlow := materializeFlowLinksGo(flow)
	existingGeneratedTaskID := findGeneratedErrorTaskIDGo(normalizedFlow, request.TaskID)
	if existingGeneratedTaskID != "" && !request.ReplaceExisting {
		return errorPathTemplateOperation{}, controlFlowFailure{Message: fmt.Sprintf("Task %q already has a generated error path", request.TaskID)}
	}
	if existingGeneratedTaskID != "" {
		normalizedFlow = removeGeneratedErrorPathGo(normalizedFlow, request.TaskID, existingGeneratedTaskID)
	}

	successorTaskID := findSuccessorTaskIDGo(normalizedFlow, request.TaskID)
	if request.Template == "log_and_continue" && successorTaskID == "" {
		return errorPathTemplateOperation{}, controlFlowFailure{Message: fmt.Sprintf("Template %q requires task %q to have a successor", request.Template, request.TaskID)}
	}

	logAlias, logRef, addedImport := resolveLogImportForErrorPath(app)
	generatedTaskID := createGeneratedErrorTaskIDGo(normalizedFlow, request.TaskID, request.GeneratedTaskPrefix)
	generatedTask := flogoTask{
		ID:          generatedTaskID,
		Name:        fmt.Sprintf("error-log-%s", request.TaskID),
		ActivityRef: "#log",
		Input: map[string]any{
			"message": defaultString(strings.TrimSpace(request.LogMessage), fmt.Sprintf("Task %s failed", request.TaskID)),
		},
		Output:   map[string]any{},
		Settings: map[string]any{},
	}

	nextFlow, generatedLinks := insertGeneratedErrorPathGo(normalizedFlow, request.TaskID, request.Template, generatedTask, successorTaskID)
	nextApp := cloneFlogoApp(app)
	nextApp.Resources[flowIndex] = nextFlow
	if !importExists(nextApp, logAlias, logRef) {
		nextApp.Imports = append(nextApp.Imports, flogoImport{Alias: logAlias, Ref: logRef})
	}

	validation := validateFlogoApp(nextApp)
	if !validation.Ok {
		return errorPathTemplateOperation{}, controlFlowFailure{
			Message:     fmt.Sprintf("Generated error path for task %q is not valid", request.TaskID),
			Diagnostics: flattenValidationDiagnostics(validation),
		}
	}

	return errorPathTemplateOperation{
		NextApp: nextApp,
		Plan: errorPathTemplatePlan{
			FlowID:          request.FlowID,
			TaskID:          request.TaskID,
			Template:        request.Template,
			GeneratedTaskID: generatedTaskID,
			AddedImport:     addedImport,
			GeneratedLinks:  generatedLinks,
			Diagnostics:     []diagnostic{},
			Warnings:        []diagnostic{},
		},
		PatchSummary: fmt.Sprintf("Added %s error path to task %q in flow %q", request.Template, request.TaskID, request.FlowID),
		Validation:   validation,
	}, nil
}

func findTaskInFlow(flow flogoFlow, taskID string) (flogoTask, int) {
	for index, task := range flow.Tasks {
		if task.ID == taskID {
			return task, index
		}
	}
	return flogoTask{}, -1
}

func normalizeTaskType(taskType string) string {
	return strings.TrimSpace(taskType)
}

func materializeFlowLinksGo(flow flogoFlow) flogoFlow {
	next := cloneFlogoFlow(flow)
	if len(next.Links) == 0 {
		next.Links = buildLinearDependencyLinksGo(flow)
	}
	return next
}

func buildLinearDependencyLinksGo(flow flogoFlow) []map[string]any {
	capHint := 0
	if len(flow.Tasks) > 1 {
		capHint = len(flow.Tasks) - 1
	}
	links := make([]map[string]any, 0, capHint)
	for index := 0; index < len(flow.Tasks)-1; index++ {
		links = append(links, map[string]any{
			"from": flow.Tasks[index].ID,
			"to":   flow.Tasks[index+1].ID,
			"type": "dependency",
		})
	}
	return links
}

func canonicalSuccessExpressionGo(taskID string) string {
	return fmt.Sprintf("=$activity[%s].error == nil", taskID)
}

func canonicalErrorExpressionGo(taskID string) string {
	return fmt.Sprintf("=$activity[%s].error != nil", taskID)
}

func linkType(link map[string]any) string {
	if value, ok := link["type"].(string); ok && strings.TrimSpace(value) != "" {
		return value
	}
	return "dependency"
}

func isSupportedErrorPathLinkShapeGo(flow flogoFlow) bool {
	if len(flow.Links) == 0 {
		return true
	}
	for _, task := range flow.Tasks {
		outgoing := outgoingLinksGo(flow.Links, task.ID)
		if len(outgoing) <= 1 {
			if len(outgoing) == 0 {
				continue
			}
			link := outgoing[0]
			if linkType(link) == "dependency" {
				continue
			}
			if !isErrorExpressionGo(link, task.ID) {
				return false
			}
			errorTask, ok := findTaskByID(flow, asString(link["to"]))
			if !ok || strings.TrimSpace(errorTask.ActivityRef) != "#log" {
				return false
			}
			continue
		}
		if len(outgoing) > 2 {
			return false
		}
		if !hasLinkGo(outgoing, "expression", canonicalSuccessExpressionGo(task.ID)) || !hasLinkGo(outgoing, "expression", canonicalErrorExpressionGo(task.ID)) {
			return false
		}
		errorTaskID := ""
		for _, link := range outgoing {
			if isErrorExpressionGo(link, task.ID) {
				errorTaskID = asString(link["to"])
				break
			}
		}
		errorTask, ok := findTaskByID(flow, errorTaskID)
		if !ok || strings.TrimSpace(errorTask.ActivityRef) != "#log" {
			return false
		}
	}
	return true
}

func outgoingLinksGo(links []map[string]any, from string) []map[string]any {
	out := make([]map[string]any, 0)
	for _, link := range links {
		if asString(link["from"]) == from {
			out = append(out, link)
		}
	}
	return out
}

func hasLinkGo(links []map[string]any, expectedType string, expectedValue string) bool {
	for _, link := range links {
		if linkType(link) == expectedType && asString(link["value"]) == expectedValue {
			return true
		}
	}
	return false
}

func isSuccessExpressionGo(link map[string]any, taskID string) bool {
	return linkType(link) == "expression" && asString(link["value"]) == canonicalSuccessExpressionGo(taskID)
}

func isErrorExpressionGo(link map[string]any, taskID string) bool {
	return linkType(link) == "expression" && asString(link["value"]) == canonicalErrorExpressionGo(taskID)
}

func findSuccessorTaskIDGo(flow flogoFlow, taskID string) string {
	outgoing := outgoingLinksGo(flow.Links, taskID)
	for _, link := range outgoing {
		if linkType(link) == "dependency" {
			return asString(link["to"])
		}
	}
	for _, link := range outgoing {
		if isSuccessExpressionGo(link, taskID) {
			return asString(link["to"])
		}
	}
	return ""
}

func findGeneratedErrorTaskIDGo(flow flogoFlow, taskID string) string {
	for _, link := range outgoingLinksGo(flow.Links, taskID) {
		if !isErrorExpressionGo(link, taskID) {
			continue
		}
		errorTaskID := asString(link["to"])
		task, ok := findTaskByID(flow, errorTaskID)
		if ok && strings.TrimSpace(task.ActivityRef) == "#log" {
			return errorTaskID
		}
	}
	return ""
}

func removeGeneratedErrorPathGo(flow flogoFlow, taskID string, generatedTaskID string) flogoFlow {
	next := cloneFlogoFlow(flow)
	filteredTasks := make([]flogoTask, 0, len(next.Tasks))
	for _, task := range next.Tasks {
		if task.ID != generatedTaskID {
			filteredTasks = append(filteredTasks, task)
		}
	}
	next.Tasks = filteredTasks

	filteredLinks := make([]map[string]any, 0, len(next.Links))
	for _, link := range next.Links {
		from := asString(link["from"])
		to := asString(link["to"])
		if from == generatedTaskID || to == generatedTaskID {
			continue
		}
		if from == taskID && (isSuccessExpressionGo(link, taskID) || isErrorExpressionGo(link, taskID)) {
			continue
		}
		filteredLinks = append(filteredLinks, cloneStringAnyMap(link))
	}
	next.Links = filteredLinks
	return next
}

func createGeneratedErrorTaskIDGo(flow flogoFlow, taskID string, prefix string) string {
	basePrefix := "error"
	if strings.TrimSpace(prefix) != "" {
		basePrefix = strings.ReplaceAll(slugify(strings.TrimSpace(prefix)), "-", "_")
	}
	return createUniqueTaskIDGo(flow, fmt.Sprintf("%s_log_%s", basePrefix, taskID))
}

func createUniqueTaskIDGo(flow flogoFlow, base string) string {
	used := make(map[string]struct{}, len(flow.Tasks))
	for _, task := range flow.Tasks {
		used[task.ID] = struct{}{}
	}
	candidate := base
	counter := 1
	for {
		if _, exists := used[candidate]; !exists {
			return candidate
		}
		counter++
		candidate = fmt.Sprintf("%s_%d", base, counter)
	}
}

func resolveLogImportForErrorPath(app flogoApp) (string, string, bool) {
	for _, entry := range app.Imports {
		if normalizeAlias(entry.Alias) == "log" || entry.Ref == "github.com/project-flogo/contrib/activity/log" {
			return entry.Alias, entry.Ref, false
		}
	}
	return "log", "github.com/project-flogo/contrib/activity/log", true
}

func importExists(app flogoApp, alias string, ref string) bool {
	for _, entry := range app.Imports {
		if entry.Alias == alias || entry.Ref == ref {
			return true
		}
	}
	return false
}

func insertGeneratedErrorPathGo(flow flogoFlow, taskID string, template string, generatedTask flogoTask, successorTaskID string) (flogoFlow, []map[string]any) {
	next := cloneFlogoFlow(flow)
	taskIndex := -1
	for index, task := range next.Tasks {
		if task.ID == taskID {
			taskIndex = index
			break
		}
	}
	if taskIndex >= 0 {
		next.Tasks = append(next.Tasks[:taskIndex+1], append([]flogoTask{generatedTask}, next.Tasks[taskIndex+1:]...)...)
	}

	filteredLinks := make([]map[string]any, 0, len(next.Links))
	for _, link := range next.Links {
		if asString(link["from"]) == taskID && linkType(link) == "dependency" {
			continue
		}
		filteredLinks = append(filteredLinks, cloneStringAnyMap(link))
	}
	next.Links = filteredLinks

	generatedLinks := make([]map[string]any, 0, 3)
	if successorTaskID != "" {
		successLink := map[string]any{
			"from":  taskID,
			"to":    successorTaskID,
			"type":  "expression",
			"value": canonicalSuccessExpressionGo(taskID),
		}
		next.Links = append(next.Links, successLink)
		generatedLinks = append(generatedLinks, cloneStringAnyMap(successLink))
	}

	errorLink := map[string]any{
		"from":  taskID,
		"to":    generatedTask.ID,
		"type":  "expression",
		"value": canonicalErrorExpressionGo(taskID),
	}
	next.Links = append(next.Links, errorLink)
	generatedLinks = append(generatedLinks, cloneStringAnyMap(errorLink))

	if template == "log_and_continue" && successorTaskID != "" {
		continueLink := map[string]any{
			"from": generatedTask.ID,
			"to":   successorTaskID,
			"type": "dependency",
		}
		next.Links = append(next.Links, continueLink)
		generatedLinks = append(generatedLinks, cloneStringAnyMap(continueLink))
	}

	return next, generatedLinks
}

func findTaskByID(flow flogoFlow, taskID string) (flogoTask, bool) {
	for _, task := range flow.Tasks {
		if task.ID == taskID {
			return task, true
		}
	}
	return flogoTask{}, false
}

func asString(value any) string {
	if typed, ok := value.(string); ok {
		return typed
	}
	return ""
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

type generatedTriggerMappings struct {
	Input       map[string]any
	Output      map[string]any
	Diagnostics []diagnostic
}

type existingTriggerBinding struct {
	Trigger      flogoTrigger
	TriggerIndex int
	HandlerIndex int
}

func resolveTriggerImportForBinding(app flogoApp, kind string) (string, string) {
	registryEntry := triggerImportRegistry[kind]
	for _, entry := range app.Imports {
		if entry.Ref == registryEntry.Ref || normalizeAlias(entry.Alias) == registryEntry.Alias {
			return entry.Alias, entry.Ref
		}
	}
	return registryEntry.Alias, registryEntry.Ref
}

func buildTriggerID(flowID string, profile triggerProfile) string {
	return "flogo-" + profile.Kind + "-" + slugify(flowID)
}

func buildTriggerHandlerName(flowID string, profile triggerProfile) string {
	slug := slugify(flowID)
	switch profile.Kind {
	case "rest":
		return strings.ToLower(profile.Method) + "_" + slug
	case "timer":
		return "run_" + slug
	case "cli":
		if strings.TrimSpace(profile.CommandName) != "" {
			return slugify(profile.CommandName)
		}
		return slug
	case "channel":
		return "channel_" + slug
	default:
		return slug
	}
}

func createBindingTrigger(triggerID string, triggerRef string, handlerName string, flowID string, profile triggerProfile, mappings generatedTriggerMappings) flogoTrigger {
	return flogoTrigger{
		ID:       triggerID,
		Ref:      triggerRef,
		Settings: createBindingTriggerSettings(profile),
		Handlers: []flogoHandler{
			{
				ID:             handlerName,
				ActionRef:      "#flow",
				ActionSettings: map[string]any{"flowURI": "res://flow:" + flowID},
				Settings:       createBindingHandlerSettings(profile),
				Input:          cloneStringAnyMap(mappings.Input),
				Output:         cloneStringAnyMap(mappings.Output),
			},
		},
	}
}

func createBindingTriggerSettings(profile triggerProfile) map[string]any {
	switch profile.Kind {
	case "rest":
		return map[string]any{"port": profile.Port}
	case "cli":
		return map[string]any{"singleCmd": profile.SingleCmd}
	default:
		return map[string]any{}
	}
}

func createBindingHandlerSettings(profile triggerProfile) map[string]any {
	switch profile.Kind {
	case "rest":
		return map[string]any{
			"method": profile.Method,
			"path":   profile.Path,
		}
	case "timer":
		settings := map[string]any{}
		if profile.StartDelay != "" {
			settings["startDelay"] = profile.StartDelay
		}
		if profile.RepeatInterval != "" {
			settings["repeatInterval"] = profile.RepeatInterval
		}
		return settings
	case "cli":
		settings := map[string]any{
			"command": profile.CommandName,
		}
		if profile.Usage != "" {
			settings["usage"] = profile.Usage
		}
		if profile.Short != "" {
			settings["short"] = profile.Short
		}
		if profile.Long != "" {
			settings["long"] = profile.Long
		}
		if len(profile.Flags) > 0 {
			flags := make([]any, 0, len(profile.Flags))
			for _, flag := range profile.Flags {
				flags = append(flags, flag)
			}
			settings["flags"] = flags
		}
		return settings
	case "channel":
		return map[string]any{"channel": profile.Channel}
	default:
		return map[string]any{}
	}
}

func generateTriggerBindingMappings(flow flowContract, profile triggerProfile) generatedTriggerMappings {
	input := map[string]any{}
	output := map[string]any{}
	diagnostics := []diagnostic{}

	switch profile.Kind {
	case "rest":
		for _, param := range flow.Inputs {
			expression := inferRestBindingInput(param.Name, len(flow.Inputs))
			if expression != "" {
				input[param.Name] = expression
			} else if param.Required {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.trigger_binding.unmapped_required_input",
					Message:  fmt.Sprintf("REST auto-mapping cannot satisfy required flow input %q", param.Name),
					Severity: "error",
					Path:     "flows." + flow.FlowID + ".inputs." + param.Name,
				})
			} else {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.trigger_binding.unmapped_optional_input",
					Message:  fmt.Sprintf("REST auto-mapping left optional flow input %q unmapped", param.Name),
					Severity: "warning",
					Path:     "flows." + flow.FlowID + ".inputs." + param.Name,
				})
			}
		}

		codeParam := findFlowOutputParam(flow.Outputs, []string{"code", "status"})
		dataParam := findFlowOutputParam(flow.Outputs, []string{"data", "body", "content"})
		headersParam := findFlowOutputParam(flow.Outputs, []string{"headers"})
		cookiesParam := findFlowOutputParam(flow.Outputs, []string{"cookies"})
		if codeParam != nil {
			output["code"] = "$flow." + codeParam.Name
		} else if profile.ReplyMode == "status_only" {
			output["code"] = 200
		}
		fallbackOutput := (*flowParam)(nil)
		if len(flow.Outputs) == 1 {
			fallbackOutput = &flow.Outputs[0]
		}
		if dataParam != nil {
			output["data"] = "$flow." + dataParam.Name
		} else if fallbackOutput != nil {
			output["data"] = "$flow." + fallbackOutput.Name
		} else if profile.ReplyMode != "status_only" {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.trigger_binding.missing_reply_data",
				Message:  fmt.Sprintf("REST reply data could not be inferred for flow %q", flow.FlowID),
				Severity: "warning",
				Path:     "flows." + flow.FlowID + ".outputs",
			})
		}
		if headersParam != nil {
			output["headers"] = "$flow." + headersParam.Name
		}
		if cookiesParam != nil {
			output["cookies"] = "$flow." + cookiesParam.Name
		}
	case "timer":
		requiredInputs := 0
		for _, param := range flow.Inputs {
			if param.Required {
				requiredInputs++
			}
		}
		if requiredInputs > 0 {
			diagnostics = append(diagnostics, diagnostic{
				Code:     "flogo.trigger_binding.timer_requires_zero_inputs",
				Message:  "Timer triggers can only bind flows with zero required inputs in this slice",
				Severity: "error",
				Path:     "flows." + flow.FlowID + ".inputs",
			})
		}
	case "cli":
		for _, param := range flow.Inputs {
			normalized := strings.ToLower(regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(param.Name, ""))
			if normalized == "args" {
				input[param.Name] = "$trigger.args"
			} else if normalized == "flags" {
				input[param.Name] = "$trigger.flags"
			} else if len(flow.Inputs) == 1 {
				input[param.Name] = "$trigger.args"
			} else if param.Required {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.trigger_binding.unmapped_required_input",
					Message:  fmt.Sprintf("CLI auto-mapping cannot satisfy required flow input %q", param.Name),
					Severity: "error",
					Path:     "flows." + flow.FlowID + ".inputs." + param.Name,
				})
			}
		}
		dataParam := findFlowOutputParam(flow.Outputs, []string{"data"})
		if dataParam == nil && len(flow.Outputs) > 0 {
			dataParam = &flow.Outputs[0]
		}
		if dataParam != nil {
			output["data"] = "$flow." + dataParam.Name
		}
	case "channel":
		for _, param := range flow.Inputs {
			normalized := strings.ToLower(regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(param.Name, ""))
			if normalized == "data" || normalized == "payload" || normalized == "content" || len(flow.Inputs) == 1 {
				input[param.Name] = "$trigger.data"
			} else if param.Required {
				diagnostics = append(diagnostics, diagnostic{
					Code:     "flogo.trigger_binding.unmapped_required_input",
					Message:  fmt.Sprintf("Channel auto-mapping cannot satisfy required flow input %q", param.Name),
					Severity: "error",
					Path:     "flows." + flow.FlowID + ".inputs." + param.Name,
				})
			}
		}
	}

	return generatedTriggerMappings{
		Input:       input,
		Output:      output,
		Diagnostics: dedupeDiagnostics(diagnostics),
	}
}

func inferRestBindingInput(name string, inputCount int) string {
	normalized := strings.ToLower(regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(name, ""))
	switch normalized {
	case "content", "body", "payload", "request":
		return "$trigger.content"
	case "headers":
		return "$trigger.headers"
	case "method":
		return "$trigger.method"
	case "queryparams", "query":
		return "$trigger.queryParams"
	case "pathparams", "path":
		return "$trigger.pathParams"
	default:
		if inputCount == 1 {
			return "$trigger.content"
		}
		return ""
	}
}

func findFlowOutputParam(params []flowParam, candidates []string) *flowParam {
	normalizedCandidates := map[string]bool{}
	for _, candidate := range candidates {
		normalizedCandidates[strings.ToLower(candidate)] = true
	}
	for _, param := range params {
		if normalizedCandidates[strings.ToLower(param.Name)] {
			copy := param
			return &copy
		}
	}
	return nil
}

func applyTriggerBindingPlanToApp(app flogoApp, triggerAlias string, triggerImportRef string, trigger flogoTrigger, existing *existingTriggerBinding) flogoApp {
	next := cloneFlogoApp(app)
	if !appHasTriggerImport(next, triggerAlias, triggerImportRef) {
		next.Imports = append(next.Imports, flogoImport{
			Alias: triggerAlias,
			Ref:   triggerImportRef,
		})
	}

	if existing != nil {
		current := next.Triggers[existing.TriggerIndex]
		if len(current.Handlers) <= 1 {
			next.Triggers[existing.TriggerIndex] = trigger
		} else {
			updatedHandlers := append([]flogoHandler{}, current.Handlers...)
			updatedHandlers[existing.HandlerIndex] = trigger.Handlers[0]
			current.Ref = trigger.Ref
			current.Settings = cloneStringAnyMap(trigger.Settings)
			current.Handlers = updatedHandlers
			next.Triggers[existing.TriggerIndex] = current
		}
		return next
	}

	next.Triggers = append(next.Triggers, trigger)
	return next
}

func findExistingTriggerBinding(app flogoApp, flowRef string, profile triggerProfile, triggerImportRef string) *existingTriggerBinding {
	for triggerIndex, trigger := range app.Triggers {
		if !matchesTriggerKind(app, trigger, triggerImportRef) {
			continue
		}
		for handlerIndex, handler := range trigger.Handlers {
			if resolveHandlerFlowRef(handler) != flowRef {
				continue
			}
			if matchesTriggerProfile(trigger, handler, profile) {
				return &existingTriggerBinding{
					Trigger:      trigger,
					TriggerIndex: triggerIndex,
					HandlerIndex: handlerIndex,
				}
			}
		}
	}
	return nil
}

func matchesTriggerKind(app flogoApp, trigger flogoTrigger, triggerImportRef string) bool {
	resolvedRef := trigger.Ref
	if strings.HasPrefix(trigger.Ref, "#") {
		alias := inferAlias(trigger.Ref)
		for _, entry := range app.Imports {
			if normalizeAlias(entry.Alias) == alias {
				resolvedRef = entry.Ref
				break
			}
		}
	}
	return resolvedRef == triggerImportRef || trigger.Ref == "#"+inferAliasFromRef(triggerImportRef)
}

func matchesTriggerProfile(trigger flogoTrigger, handler flogoHandler, profile triggerProfile) bool {
	switch profile.Kind {
	case "rest":
		return numberValue(trigger.Settings["port"]) == float64(profile.Port) &&
			strings.EqualFold(stringValue(handler.Settings["method"]), profile.Method) &&
			stringValue(handler.Settings["path"]) == profile.Path
	case "timer":
		return stringValue(handler.Settings["startDelay"]) == profile.StartDelay &&
			stringValue(handler.Settings["repeatInterval"]) == profile.RepeatInterval
	case "cli":
		return stringValue(handler.Settings["command"]) == profile.CommandName
	case "channel":
		return stringValue(handler.Settings["channel"]) == profile.Channel
	default:
		return false
	}
}

func appHasTriggerImport(app flogoApp, alias string, ref string) bool {
	for _, entry := range app.Imports {
		if entry.Alias == alias || entry.Ref == ref {
			return true
		}
	}
	return false
}

func findFlowByID(app flogoApp, flowID string) (flogoFlow, int) {
	for index, flow := range app.Resources {
		if flow.ID == flowID {
			return flow, index
		}
	}
	return flogoFlow{}, -1
}

func resolveSelectedTaskRegion(flow flogoFlow, requestedTaskIDs []string) (int, int, []flogoTask, []string, error) {
	if len(requestedTaskIDs) == 0 {
		return 0, 0, nil, nil, subflowFailure{Message: "At least one task must be selected for extraction"}
	}
	indexByID := map[string]int{}
	for index, task := range flow.Tasks {
		indexByID[task.ID] = index
	}
	seen := map[string]bool{}
	indexes := make([]int, 0, len(requestedTaskIDs))
	for _, taskID := range requestedTaskIDs {
		if seen[taskID] {
			continue
		}
		seen[taskID] = true
		index, ok := indexByID[taskID]
		if !ok {
			return 0, 0, nil, nil, subflowFailure{Message: fmt.Sprintf("Task %q was not found in flow %q", taskID, flow.ID)}
		}
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	startIndex := indexes[0]
	endIndex := indexes[len(indexes)-1]
	if endIndex-startIndex+1 != len(indexes) {
		return 0, 0, nil, nil, subflowFailure{Message: "Subflow extraction requires a contiguous task selection"}
	}
	selectedTasks := cloneTasks(flow.Tasks[startIndex : endIndex+1])
	selectedTaskIDs := make([]string, 0, len(selectedTasks))
	for _, task := range selectedTasks {
		selectedTaskIDs = append(selectedTaskIDs, task.ID)
	}
	return startIndex, endIndex, selectedTasks, selectedTaskIDs, nil
}

func buildExtractedFlowID(parentFlowID string, taskIDs []string) string {
	if len(taskIDs) == 0 {
		return slugify(parentFlowID) + "-subflow"
	}
	if len(taskIDs) == 1 {
		return slugify(parentFlowID) + "-subflow-" + slugify(taskIDs[0])
	}
	return slugify(parentFlowID) + "-subflow-" + slugify(taskIDs[0]) + "-" + slugify(taskIDs[len(taskIDs)-1])
}

func buildExtractedFlowName(parentFlow flogoFlow, tasks []flogoTask) string {
	base := valueOrFallback(parentFlow.Name, parentFlow.ID)
	if len(tasks) == 0 {
		return base + " subflow"
	}
	if len(tasks) == 1 {
		return fmt.Sprintf("%s subflow (%s)", base, valueOrFallback(tasks[0].Name, tasks[0].ID))
	}
	return fmt.Sprintf("%s subflow (%s to %s)", base, valueOrFallback(tasks[0].Name, tasks[0].ID), valueOrFallback(tasks[len(tasks)-1].Name, tasks[len(tasks)-1].ID))
}

func inferSubflowInputs(flow flogoFlow, startIndex int, endIndex int) []string {
	inputs := map[string]bool{}
	produced := map[string]bool{}
	for index := startIndex; index <= endIndex; index++ {
		task := flow.Tasks[index]
		for _, name := range collectFlowResolverNames(task.Input) {
			if !produced[name] {
				inputs[name] = true
			}
		}
		for _, name := range collectFlowResolverNames(task.Settings) {
			if !produced[name] {
				inputs[name] = true
			}
		}
		for _, name := range collectFlowResolverNames(task.Output) {
			if !produced[name] {
				inputs[name] = true
			}
		}
		for name := range task.Output {
			produced[name] = true
		}
	}
	return sortedKeys(inputs)
}

func inferSubflowOutputs(app flogoApp, flow flogoFlow, startIndex int, endIndex int) []string {
	produced := map[string]bool{}
	for index := startIndex; index <= endIndex; index++ {
		for name := range flow.Tasks[index].Output {
			produced[name] = true
		}
	}

	outputs := map[string]bool{}
	for index := endIndex + 1; index < len(flow.Tasks); index++ {
		task := flow.Tasks[index]
		refs := append([]string{}, collectFlowResolverNames(task.Input)...)
		refs = append(refs, collectFlowResolverNames(task.Settings)...)
		refs = append(refs, collectFlowResolverNames(task.Output)...)
		for _, name := range refs {
			if produced[name] {
				outputs[name] = true
			}
		}
	}

	contracts := inferFlowContracts(app)
	for _, contract := range contracts.Contracts {
		if contract.FlowID != flow.ID {
			continue
		}
		for _, param := range contract.Outputs {
			if produced[param.Name] {
				outputs[param.Name] = true
			}
		}
	}

	return sortedKeys(outputs)
}

func buildSubflowMetadata(parentContract *flowContract, names []string, input bool) []map[string]any {
	fields := make([]map[string]any, 0, len(names))
	for _, name := range names {
		field := map[string]any{
			"name": name,
		}
		var params []flowParam
		if parentContract != nil {
			if input {
				params = parentContract.Inputs
			} else {
				params = parentContract.Outputs
			}
		}
		for _, param := range params {
			if param.Name == name {
				if param.Type != "" && param.Type != "unknown" {
					field["type"] = param.Type
				}
				if param.Required {
					field["required"] = param.Required
				}
				if param.Description != "" {
					field["description"] = param.Description
				}
				break
			}
		}
		fields = append(fields, field)
	}
	return fields
}

func cloneTasks(tasks []flogoTask) []flogoTask {
	cloned := make([]flogoTask, 0, len(tasks))
	for _, task := range tasks {
		cloned = append(cloned, flogoTask{
			ID:          task.ID,
			Name:        task.Name,
			Type:        task.Type,
			ActivityRef: task.ActivityRef,
			Input:       cloneStringAnyMap(task.Input),
			Output:      cloneStringAnyMap(task.Output),
			Settings:    cloneStringAnyMap(task.Settings),
		})
	}
	return cloned
}

func cloneFlogoFlow(flow flogoFlow) flogoFlow {
	return cloneFlogoApp(flogoApp{Resources: []flogoFlow{flow}}).Resources[0]
}

func createUniqueTaskID(flow flogoFlow, baseID string, reserved map[string]bool) string {
	used := map[string]bool{}
	for _, task := range flow.Tasks {
		used[task.ID] = true
	}
	for key, value := range reserved {
		if value {
			used[key] = true
		}
	}
	candidate := baseID
	counter := 2
	for used[candidate] {
		candidate = fmt.Sprintf("%s_%d", baseID, counter)
		counter++
	}
	return candidate
}

func applySubflowExtractionToApp(app flogoApp, parentIndex int, startIndex int, endIndex int, invocation flogoTask, extractedFlow flogoFlow, replaceExisting bool) flogoApp {
	next := cloneFlogoApp(app)
	parentFlow := next.Resources[parentIndex]
	nextTasks := make([]flogoTask, 0, len(parentFlow.Tasks)-(endIndex-startIndex)+1)
	nextTasks = append(nextTasks, cloneTasks(parentFlow.Tasks[:startIndex])...)
	nextTasks = append(nextTasks, invocation)
	nextTasks = append(nextTasks, cloneTasks(parentFlow.Tasks[endIndex+1:])...)
	parentFlow.Tasks = nextTasks
	next.Resources[parentIndex] = parentFlow

	if existing, index := findFlowByID(next, extractedFlow.ID); index >= 0 {
		_ = existing
		if replaceExisting {
			next.Resources[index] = extractedFlow
		}
	} else {
		next.Resources = append(next.Resources, extractedFlow)
	}
	return next
}

func applySubflowInliningToApp(app flogoApp, parentIndex int, invocationIndex int, inlinedTasks []flogoTask, inlinedFlowID string, removeExtractedFlowIfUnused bool) flogoApp {
	next := cloneFlogoApp(app)
	parentFlow := next.Resources[parentIndex]
	nextTasks := make([]flogoTask, 0, len(parentFlow.Tasks)-1+len(inlinedTasks))
	nextTasks = append(nextTasks, cloneTasks(parentFlow.Tasks[:invocationIndex])...)
	nextTasks = append(nextTasks, cloneTasks(inlinedTasks)...)
	nextTasks = append(nextTasks, cloneTasks(parentFlow.Tasks[invocationIndex+1:])...)
	parentFlow.Tasks = nextTasks
	next.Resources[parentIndex] = parentFlow

	if removeExtractedFlowIfUnused && countFlowReferences(next, inlinedFlowID) == 0 {
		filtered := make([]flogoFlow, 0, len(next.Resources))
		for _, flow := range next.Resources {
			if flow.ID != inlinedFlowID {
				filtered = append(filtered, flow)
			}
		}
		next.Resources = filtered
	}
	return next
}

func countFlowReferences(app flogoApp, flowID string) int {
	flowRef := "#flow:" + flowID
	references := 0
	for _, trigger := range app.Triggers {
		for _, handler := range trigger.Handlers {
			if resolveHandlerFlowRef(handler) == flowRef {
				references++
			}
		}
	}
	for _, flow := range app.Resources {
		for _, task := range flow.Tasks {
			if normalizeFlowActionRef(task.ActivityRef, stringValue(task.Settings["flowURI"])) == flowRef {
				references++
			}
		}
	}
	return references
}

func summarizeSubflowPatch(before flogoApp, after flogoApp, mode string) string {
	resourceDelta := len(after.Resources) - len(before.Resources)
	if mode == "extract" {
		return fmt.Sprintf("resources %+d", resourceDelta)
	}
	return fmt.Sprintf("resources %+d", resourceDelta)
}

func cloneFlogoApp(app flogoApp) flogoApp {
	clone := flogoApp{
		Name:       app.Name,
		Type:       app.Type,
		AppModel:   app.AppModel,
		Imports:    append([]flogoImport{}, app.Imports...),
		Properties: make([]map[string]any, 0, len(app.Properties)),
		Triggers:   make([]flogoTrigger, 0, len(app.Triggers)),
		Resources:  make([]flogoFlow, 0, len(app.Resources)),
		Raw:        cloneStringAnyMap(app.Raw),
	}

	for _, property := range app.Properties {
		clone.Properties = append(clone.Properties, cloneStringAnyMap(property))
	}
	for _, trigger := range app.Triggers {
		nextTrigger := flogoTrigger{
			ID:       trigger.ID,
			Ref:      trigger.Ref,
			Settings: cloneStringAnyMap(trigger.Settings),
			Handlers: make([]flogoHandler, 0, len(trigger.Handlers)),
		}
		for _, handler := range trigger.Handlers {
			nextTrigger.Handlers = append(nextTrigger.Handlers, flogoHandler{
				ID:             handler.ID,
				ActionRef:      handler.ActionRef,
				ActionSettings: cloneStringAnyMap(handler.ActionSettings),
				Settings:       cloneStringAnyMap(handler.Settings),
				Input:          cloneStringAnyMap(handler.Input),
				Output:         cloneStringAnyMap(handler.Output),
			})
		}
		clone.Triggers = append(clone.Triggers, nextTrigger)
	}
	for _, flow := range app.Resources {
		nextFlow := flogoFlow{
			ID:             flow.ID,
			Name:           flow.Name,
			MetadataInput:  make([]map[string]any, 0, len(flow.MetadataInput)),
			MetadataOutput: make([]map[string]any, 0, len(flow.MetadataOutput)),
			Tasks:          make([]flogoTask, 0, len(flow.Tasks)),
			Links:          make([]map[string]any, 0, len(flow.Links)),
		}
		for _, item := range flow.MetadataInput {
			nextFlow.MetadataInput = append(nextFlow.MetadataInput, cloneStringAnyMap(item))
		}
		for _, item := range flow.MetadataOutput {
			nextFlow.MetadataOutput = append(nextFlow.MetadataOutput, cloneStringAnyMap(item))
		}
		for _, task := range flow.Tasks {
			nextFlow.Tasks = append(nextFlow.Tasks, flogoTask{
				ID:          task.ID,
				Name:        task.Name,
				Type:        task.Type,
				ActivityRef: task.ActivityRef,
				Input:       cloneStringAnyMap(task.Input),
				Output:      cloneStringAnyMap(task.Output),
				Settings:    cloneStringAnyMap(task.Settings),
			})
		}
		for _, link := range flow.Links {
			nextFlow.Links = append(nextFlow.Links, cloneStringAnyMap(link))
		}
		clone.Resources = append(clone.Resources, nextFlow)
	}

	return clone
}

func cloneStringAnyMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}
	clone := make(map[string]any, len(input))
	for key, value := range input {
		clone[key] = cloneAny(value)
	}
	return clone
}

func cloneAny(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneStringAnyMap(typed)
	case []any:
		result := make([]any, 0, len(typed))
		for _, item := range typed {
			result = append(result, cloneAny(item))
		}
		return result
	default:
		return typed
	}
}

func summarizeTriggerBindingPatch(before flogoApp, after flogoApp, triggerID string) string {
	if len(after.Triggers) > len(before.Triggers) {
		return fmt.Sprintf("Added trigger %q", triggerID)
	}
	return fmt.Sprintf("Updated trigger %q", triggerID)
}

func buildBindableAppPayload(app flogoApp) map[string]any {
	imports := make([]any, 0, len(app.Imports))
	for _, entry := range app.Imports {
		record := map[string]any{
			"alias": entry.Alias,
			"ref":   entry.Ref,
		}
		if entry.Version != "" {
			record["version"] = entry.Version
		}
		imports = append(imports, record)
	}

	properties := make([]any, 0, len(app.Properties))
	for _, property := range app.Properties {
		properties = append(properties, cloneStringAnyMap(property))
	}

	triggers := make([]any, 0, len(app.Triggers))
	for _, trigger := range app.Triggers {
		handlers := make([]any, 0, len(trigger.Handlers))
		for _, handler := range trigger.Handlers {
			action := map[string]any{
				"ref": handler.ActionRef,
			}
			if len(handler.ActionSettings) > 0 {
				action["settings"] = cloneStringAnyMap(handler.ActionSettings)
			}
			handlerRecord := map[string]any{
				"settings": cloneStringAnyMap(handler.Settings),
				"action":   action,
			}
			if handler.ID != "" {
				handlerRecord["id"] = handler.ID
			}
			if len(handler.Input) > 0 {
				handlerRecord["input"] = cloneStringAnyMap(handler.Input)
			}
			if len(handler.Output) > 0 {
				handlerRecord["output"] = cloneStringAnyMap(handler.Output)
			}
			handlers = append(handlers, handlerRecord)
		}
		triggers = append(triggers, map[string]any{
			"id":       trigger.ID,
			"ref":      trigger.Ref,
			"settings": cloneStringAnyMap(trigger.Settings),
			"handlers": handlers,
		})
	}

	resources := make([]any, 0, len(app.Resources))
	for _, flow := range app.Resources {
		tasks := make([]any, 0, len(flow.Tasks))
		for _, task := range flow.Tasks {
			taskRecord := map[string]any{
				"id":          task.ID,
				"name":        emptyToNil(task.Name),
				"type":        emptyToNil(task.Type),
				"activityRef": task.ActivityRef,
				"input":       cloneStringAnyMap(task.Input),
				"output":      cloneStringAnyMap(task.Output),
				"settings":    cloneStringAnyMap(task.Settings),
			}
			tasks = append(tasks, taskRecord)
		}
		resources = append(resources, map[string]any{
			"id":   flow.ID,
			"type": "flow",
			"data": map[string]any{
				"name": flow.Name,
				"metadata": map[string]any{
					"input":  cloneAny(flow.MetadataInput),
					"output": cloneAny(flow.MetadataOutput),
				},
				"tasks": tasks,
				"links": cloneAny(flow.Links),
			},
		})
	}

	return map[string]any{
		"name":       app.Name,
		"type":       app.Type,
		"appModel":   app.AppModel,
		"imports":    imports,
		"properties": properties,
		"triggers":   triggers,
		"resources":  resources,
	}
}

func buildTriggerPayload(trigger flogoTrigger) map[string]any {
	return buildBindableAppPayload(flogoApp{Triggers: []flogoTrigger{trigger}})["triggers"].([]any)[0].(map[string]any)
}

type flowUsageSummary struct {
	HandlerRefs     []string
	TriggerRefs     []string
	ActionRefs      []string
	InferredInputs  []flowParam
	InferredOutputs []flowParam
	UsedByCount     int
	UsesMappings    bool
	Diagnostics     []diagnostic
}

func buildFlowUsage(app flogoApp, flow flogoFlow) flowUsageSummary {
	flowRef := "#flow:" + flow.ID
	handlerRefs := []string{}
	triggerRefs := map[string]bool{}
	actionRefs := map[string]bool{}
	inferredInputs := map[string]flowParam{}
	inferredOutputs := map[string]flowParam{}
	diagnostics := []diagnostic{}
	flowTaskUseCount := 0
	usesMappings := false

	for _, trigger := range app.Triggers {
		for index, handler := range trigger.Handlers {
			if resolveHandlerFlowRef(handler) != flowRef {
				continue
			}
			handlerPath := fmt.Sprintf("triggers.%s.handlers.%d", trigger.ID, index)
			handlerRefs = append(handlerRefs, handlerPath)
			triggerRefs[trigger.ID] = true
			actionRefs[resolveHandlerFlowRef(handler)] = true

			for key, value := range handler.Input {
				if _, exists := inferredInputs[key]; !exists {
					inferredInputs[key] = flowParam{Name: key, Type: inferFlowParamType(value), Required: false, Source: "mapping_inferred"}
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.flow_contract.inferred_input",
						Message:  fmt.Sprintf("Inferred flow input %q for %q from handler input mappings.", key, flow.ID),
						Severity: "info",
						Path:     handlerPath + ".input." + key,
					})
				}
			}

			for _, name := range collectFlowResolverNames(handler.Output) {
				usesMappings = true
				if _, exists := inferredOutputs[name]; !exists {
					inferredOutputs[name] = flowParam{Name: name, Type: "unknown", Required: false, Source: "mapping_inferred"}
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.flow_contract.inferred_output",
						Message:  fmt.Sprintf("Inferred flow output %q for %q from handler output mappings.", name, flow.ID),
						Severity: "info",
						Path:     handlerPath + ".output",
					})
				}
			}
		}
	}

	for _, resource := range app.Resources {
		for _, task := range resource.Tasks {
			if normalizeFlowActionRef(task.ActivityRef, "") == flowRef {
				actionRefs[task.ActivityRef] = true
				flowTaskUseCount++
			}
			refs := append([]string{}, collectFlowResolverNames(task.Input)...)
			refs = append(refs, collectFlowResolverNames(task.Settings)...)
			refs = append(refs, collectFlowResolverNames(task.Output)...)
			for _, name := range refs {
				if name == "" {
					continue
				}
				usesMappings = true
				if _, exists := inferredInputs[name]; !exists {
					inferredInputs[name] = flowParam{Name: name, Type: "unknown", Required: false, Source: "mapping_inferred"}
					diagnostics = append(diagnostics, diagnostic{
						Code:     "flogo.flow_contract.inferred_input",
						Message:  fmt.Sprintf("Inferred flow input %q for %q from task mapping usage.", name, flow.ID),
						Severity: "info",
						Path:     "resources." + resource.ID + ".tasks." + task.ID,
					})
				}
			}
		}
	}

	usedByCount := len(handlerRefs) + flowTaskUseCount
	if usedByCount == 0 {
		diagnostics = append(diagnostics, diagnostic{
			Code:     "flogo.flow_contract.no_usage",
			Message:  fmt.Sprintf("Flow %q has no trigger or flow-call usage in the current app graph.", flow.ID),
			Severity: "info",
			Path:     "resources." + flow.ID,
		})
	}

	return flowUsageSummary{
		HandlerRefs:     sortedStrings(handlerRefs),
		TriggerRefs:     sortedKeys(triggerRefs),
		ActionRefs:      sortedKeys(actionRefs),
		InferredInputs:  mapFlowParams(inferredInputs),
		InferredOutputs: mapFlowParams(inferredOutputs),
		UsedByCount:     usedByCount,
		UsesMappings:    usesMappings,
		Diagnostics:     diagnostics,
	}
}

func normalizeFlowMetadataParams(fields []map[string]any, source string) []flowParam {
	result := make([]flowParam, 0, len(fields))
	for index, field := range fields {
		name := stringValue(field["name"])
		if name == "" {
			name = fmt.Sprintf("%s_%d", source, index)
		}
		result = append(result, flowParam{
			Name:        name,
			Type:        normalizeFlowParamType(stringValue(field["type"])),
			Required:    boolValue(field["required"]),
			Source:      source,
			Description: stringValue(field["description"]),
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result
}

func normalizeFlowParamType(value string) string {
	if normalized := normalizeExpectedFieldType(value); normalized != "" {
		return normalized
	}
	if strings.EqualFold(value, "any") {
		return "any"
	}
	return "unknown"
}

func inferFlowParamType(value any) string {
	switch typed := value.(type) {
	case []any:
		return "array"
	case map[string]any:
		return "object"
	case float64, float32, int, int32, int64:
		return "number"
	case bool:
		return "boolean"
	case string:
		if !strings.Contains(typed, "$") {
			return "string"
		}
		return "unknown"
	default:
		return "unknown"
	}
}

func mergeFlowParam(existing flowParam, incoming flowParam) flowParam {
	if existing.Name == "" {
		return incoming
	}
	if flowParamTypeRank(incoming.Type) > flowParamTypeRank(existing.Type) {
		existing.Type = incoming.Type
	}
	if flowParamSourceRank(incoming.Source) > flowParamSourceRank(existing.Source) {
		existing.Source = incoming.Source
	}
	if !existing.Required && incoming.Required {
		existing.Required = true
	}
	if existing.Description == "" {
		existing.Description = incoming.Description
	}
	return existing
}

func flowParamTypeRank(value string) int {
	switch value {
	case "unknown":
		return 0
	case "any":
		return 1
	default:
		return 2
	}
}

func flowParamSourceRank(value string) int {
	switch value {
	case "unknown":
		return 0
	case "activity_inferred":
		return 1
	case "mapping_inferred":
		return 2
	case "metadata":
		return 3
	default:
		return 0
	}
}

func collectFlowResolverNames(value any) []string {
	names := map[string]bool{}
	collectFlowResolverNamesInto(value, names)
	return sortedKeys(names)
}

func collectFlowResolverNamesInto(value any, names map[string]bool) {
	switch typed := value.(type) {
	case string:
		for _, reference := range collectResolverReferences(typed) {
			if strings.HasPrefix(reference, "$flow.") {
				names[strings.TrimPrefix(reference, "$flow.")] = true
			}
		}
	case []any:
		for _, item := range typed {
			collectFlowResolverNamesInto(item, names)
		}
	case map[string]any:
		for _, item := range typed {
			collectFlowResolverNamesInto(item, names)
		}
	}
}

func mapFlowParams(values map[string]flowParam) []flowParam {
	result := make([]flowParam, 0, len(values))
	for _, value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result
}

func normalizeFlowActionRef(ref string, flowURI string) string {
	if strings.HasPrefix(flowURI, "res://flow:") {
		return "#flow:" + strings.TrimPrefix(flowURI, "res://flow:")
	}
	if ref == "" {
		return ""
	}
	if ref == "#flow" || strings.HasSuffix(ref, "/flow") {
		if strings.HasPrefix(flowURI, "res://flow:") {
			return "#flow:" + strings.TrimPrefix(flowURI, "res://flow:")
		}
		return "#flow"
	}
	if strings.HasPrefix(ref, "flow:") {
		return "#" + ref
	}
	return ref
}

func resolveHandlerFlowRef(handler flogoHandler) string {
	return normalizeFlowActionRef(handler.ActionRef, stringValue(handler.ActionSettings["flowURI"]))
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
				"actionRef": emptyToNil(resolveHandlerFlowRef(handler)),
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
			"type":        emptyToNil(task.Type),
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

func sortedStrings(values []string) []string {
	result := append([]string{}, values...)
	sort.Strings(result)
	return result
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

func inferAliasFromRef(ref string) string {
	return inferAlias(ref)
}

func normalizeAlias(alias string) string {
	return strings.TrimSpace(strings.TrimPrefix(alias, "#"))
}

func slugify(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(normalized, "-")
	normalized = strings.Trim(normalized, "-")
	if normalized == "" {
		return "flow"
	}
	return normalized
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

func numberValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	default:
		return 0
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
