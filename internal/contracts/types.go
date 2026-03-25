package contracts

type SessionMode string

const (
	ModeReview SessionMode = "review"
	ModeApply  SessionMode = "apply"
	ModeAuto   SessionMode = "auto"
)

type ApprovalPolicy struct {
	RequireWriteApproval      bool `json:"requireWriteApproval"`
	RequireDependencyApproval bool `json:"requireDependencyApproval"`
	AllowRemoteGitOps         bool `json:"allowRemoteGitOps"`
}

type SessionRequest struct {
	RepoPath        string         `json:"repoPath"`
	Goal            string         `json:"goal"`
	Mode            SessionMode    `json:"mode"`
	ApprovalPolicy  ApprovalPolicy `json:"approvalPolicy"`
	StateDir        string         `json:"stateDir"`
	SourcesManifest string         `json:"sourcesManifest"`
}

type SourceCitation struct {
	SourceID   string  `json:"sourceId"`
	Title      string  `json:"title"`
	Locator    string  `json:"locator"`
	Excerpt    string  `json:"excerpt"`
	SourceType string  `json:"sourceType"`
	Score      float64 `json:"score"`
}

type ValidationIssue struct {
	Severity  string           `json:"severity"`
	RuleID    string           `json:"ruleId"`
	Message   string           `json:"message"`
	File      string           `json:"file"`
	JSONPath  string           `json:"jsonPath"`
	Citations []SourceCitation `json:"citations,omitempty"`
}

type ValidationResult struct {
	SchemaIssues   []ValidationIssue `json:"schemaIssues"`
	SemanticIssues []ValidationIssue `json:"semanticIssues"`
	Passed         bool              `json:"passed"`
}

type PatchPlan struct {
	TargetFiles []string         `json:"targetFiles"`
	UnifiedDiff string           `json:"unifiedDiff"`
	Rationale   string           `json:"rationale"`
	Citations   []SourceCitation `json:"citations,omitempty"`
	Safe        bool             `json:"safe"`
}

type ToolInvocation struct {
	ToolName  string            `json:"toolName"`
	Args      []string          `json:"args"`
	WorkDir   string            `json:"workDir"`
	EnvPolicy string            `json:"envPolicy"`
	Env       map[string]string `json:"env,omitempty"`
}

type Artifact struct {
	Kind string `json:"kind"`
	Path string `json:"path"`
}

type ToolResult struct {
	ToolName      string     `json:"toolName"`
	Command       string     `json:"command"`
	ExitCode      int        `json:"exitCode"`
	StdoutPath    string     `json:"stdoutPath,omitempty"`
	StderrPath    string     `json:"stderrPath,omitempty"`
	ArtifactPaths []Artifact `json:"artifactPaths,omitempty"`
	Error         string     `json:"error,omitempty"`
}

type TestResult struct {
	Name    string     `json:"name"`
	Result  ToolResult `json:"result"`
	Passed  bool       `json:"passed"`
	Skipped bool       `json:"skipped"`
}

type BuildTestEvidence struct {
	ValidationResult ValidationResult `json:"validationResult"`
	BuildResult      *ToolResult      `json:"buildResult,omitempty"`
	TestResults      []TestResult     `json:"testResults,omitempty"`
	Iteration        int              `json:"iteration"`
}

type RunOutcome string

const (
	RunOutcomeReady   RunOutcome = "ready"
	RunOutcomeBlocked RunOutcome = "blocked"
	RunOutcomeApplied RunOutcome = "applied"
	RunOutcomeFailed  RunOutcome = "failed"
)

type RunReport struct {
	Outcome      RunOutcome        `json:"outcome"`
	ChangedFiles []string          `json:"changedFiles,omitempty"`
	Evidence     BuildTestEvidence `json:"evidence"`
	Citations    []SourceCitation  `json:"citations,omitempty"`
	NextAction   string            `json:"nextAction,omitempty"`
	PatchPlan    *PatchPlan        `json:"patchPlan,omitempty"`
	Messages     []string          `json:"messages,omitempty"`
}
