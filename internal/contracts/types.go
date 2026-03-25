package contracts

type SessionMode string

const (
	ModeReview SessionMode = "review"
	ModeApply  SessionMode = "apply"
	ModeAuto   SessionMode = "auto"
)

type SandboxProfile string

const (
	SandboxProfileLocal    SandboxProfile = "local"
	SandboxProfileIsolated SandboxProfile = "isolated"
)

type SandboxConfig struct {
	Profile SandboxProfile `json:"profile"`
	Image   string         `json:"image,omitempty"`
	Runtime string         `json:"runtime,omitempty"`
	Network string         `json:"network,omitempty"`
}

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
	Sandbox         SandboxConfig  `json:"sandbox"`
	StateDir        string         `json:"stateDir"`
	SourcesManifest string         `json:"sourcesManifest"`
}

type MessageRole string

const (
	RoleSystem    MessageRole = "system"
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
)

type SessionStatus string

const (
	SessionStatusActive          SessionStatus = "active"
	SessionStatusWaitingApproval SessionStatus = "waiting_approval"
	SessionStatusBlocked         SessionStatus = "blocked"
	SessionStatusCompleted       SessionStatus = "completed"
)

type PlanItemStatus string

const (
	PlanItemPending    PlanItemStatus = "pending"
	PlanItemInProgress PlanItemStatus = "in_progress"
	PlanItemCompleted  PlanItemStatus = "completed"
	PlanItemBlocked    PlanItemStatus = "blocked"
)

type ChatMessage struct {
	ID        string      `json:"id"`
	Role      MessageRole `json:"role"`
	Content   string      `json:"content"`
	CreatedAt string      `json:"createdAt"`
}

type PlanItem struct {
	ID      string         `json:"id"`
	Title   string         `json:"title"`
	Status  PlanItemStatus `json:"status"`
	Details string         `json:"details,omitempty"`
}

type PendingApproval struct {
	Kind        string     `json:"kind"`
	Summary     string     `json:"summary"`
	RequestedAt string     `json:"requestedAt"`
	PatchPlan   *PatchPlan `json:"patchPlan,omitempty"`
}

type SessionEvent struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"`
	Summary   string      `json:"summary"`
	CreatedAt string      `json:"createdAt"`
}

type SessionSnapshot struct {
	ID              string           `json:"id"`
	RepoPath        string           `json:"repoPath"`
	Goal            string           `json:"goal"`
	Mode            SessionMode      `json:"mode"`
	ApprovalPolicy  ApprovalPolicy   `json:"approvalPolicy"`
	Sandbox         SandboxConfig    `json:"sandbox"`
	StateDir        string           `json:"stateDir"`
	SourcesManifest string           `json:"sourcesManifest"`
	Status          SessionStatus    `json:"status"`
	Messages        []ChatMessage    `json:"messages,omitempty"`
	Plan            []PlanItem       `json:"plan,omitempty"`
	Events          []SessionEvent   `json:"events,omitempty"`
	PendingApproval *PendingApproval `json:"pendingApproval,omitempty"`
	LastReport      *RunReport       `json:"lastReport,omitempty"`
	CreatedAt       string           `json:"createdAt"`
	UpdatedAt       string           `json:"updatedAt"`
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
