package e2e

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/evals"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
	agentruntime "github.com/aldoapicella/flogo-agent-platform/internal/runtime"
)

func TestLiveOpenAIRepairConversationE2E(t *testing.T) {
	skipUnlessLiveOpenAI(t)

	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeInvalidMappingRepo(t, root)
	stateDir := filepath.Join(root, "state")
	addr := freeAddress(t)

	env := realToolEnv(t)
	daemon, daemonStdout, daemonStderr := startDaemon(t, root, env, addr, stateDir, manifest)
	defer stopDaemon(t, daemon, daemonStdout, daemonStderr)

	baseURL := "http://" + addr
	client := agentruntime.NewClient(baseURL)
	turns := make([]evals.ConversationTurn, 0, 4)

	firstOut, firstErr, err := runAgent(t, root, env,
		"chat",
		"--daemon-url", baseURL,
		"--repo", repoPath,
		"--goal", "repair and verify",
		"--mode", "review",
		"--state-dir", stateDir,
		"--sources", manifest,
		"--message", "what are you",
	)
	if err != nil {
		t.Fatalf("first live chat turn failed: %v\nstdout:\n%s\nstderr:\n%s", err, firstOut, firstErr)
	}

	sessionID := parseSessionID(t, firstOut)
	snapshot := fetchSessionSnapshot(t, client, sessionID)
	if snapshot.LastTurnKind != "conversation" {
		t.Fatalf("expected conversation turn kind, got %s", snapshot.LastTurnKind)
	}
	assertTranscriptSequence(t, snapshot.Messages, []transcriptExpectation{
		{Role: contracts.RoleUser, Contains: "what are you"},
		{Role: contracts.RoleAssistant, Contains: "flogo"},
	})
	turns = append(turns, captureTurn("what are you", snapshot))

	secondOut, secondErr, err := runAgent(t, root, env,
		"chat",
		"--daemon-url", baseURL,
		"--session", sessionID,
		"--message", "repair and verify the app",
	)
	if err != nil {
		t.Fatalf("repair live chat turn failed: %v\nstdout:\n%s\nstderr:\n%s", err, secondOut, secondErr)
	}

	snapshot = fetchSessionSnapshot(t, client, sessionID)
	if snapshot.Status != contracts.SessionStatusWaitingApproval {
		t.Fatalf("expected waiting approval after live repair turn, got %s", snapshot.Status)
	}
	if snapshot.PendingApproval == nil || snapshot.PendingApproval.PatchPlan == nil {
		t.Fatalf("expected pending approval after live repair turn, got %+v", snapshot.PendingApproval)
	}
	if snapshot.LastTurnPlan == nil || !strings.HasPrefix(snapshot.LastTurnPlan.Planner, "openai/") {
		t.Fatalf("expected live OpenAI planner, got %+v", snapshot.LastTurnPlan)
	}
	turns = append(turns, captureTurn("repair and verify the app", snapshot))

	thirdOut, thirdErr, err := runAgent(t, root, env,
		"chat",
		"--daemon-url", baseURL,
		"--session", sessionID,
		"--message", "show diff",
	)
	if err != nil {
		t.Fatalf("diff live chat turn failed: %v\nstdout:\n%s\nstderr:\n%s", err, thirdOut, thirdErr)
	}

	snapshot = fetchSessionSnapshot(t, client, sessionID)
	if snapshot.Status != contracts.SessionStatusWaitingApproval {
		t.Fatalf("expected waiting approval after live diff turn, got %s", snapshot.Status)
	}
	if len(snapshot.LastStepResults) == 0 || snapshot.LastStepResults[0].Type != contracts.TurnStepShowDiff {
		t.Fatalf("expected show_diff step result, got %+v", snapshot.LastStepResults)
	}
	turns = append(turns, captureTurn("show diff", snapshot))

	approveOut, approveErr, err := runAgent(t, root, env,
		"session", "approve", sessionID,
		"--daemon-url", baseURL,
	)
	if err != nil {
		t.Fatalf("approve live turn failed: %v\nstdout:\n%s\nstderr:\n%s", err, approveOut, approveErr)
	}

	snapshot = fetchSessionSnapshot(t, client, sessionID)
	assertAppliedVerification(t, snapshot)
	turns = append(turns, captureTurn("approve pending patch", snapshot))

	evalResult := evaluateConversationOrFatal(t, "repair review/apply flow", sessionID, snapshot.Messages, turns)
	writeLiveArtifacts(t, "repair", snapshot.Messages, turns, evalResult)
}

func TestLiveOpenAICreateConversationE2E(t *testing.T) {
	skipUnlessLiveOpenAI(t)

	root := t.TempDir()
	manifest := writeKnowledgeManifest(t, root)
	repoPath := writeEmptyRepo(t, root)
	stateDir := filepath.Join(root, "state")
	addr := freeAddress(t)

	env := realToolEnv(t)
	daemon, daemonStdout, daemonStderr := startDaemon(t, root, env, addr, stateDir, manifest)
	defer stopDaemon(t, daemon, daemonStdout, daemonStderr)

	baseURL := "http://" + addr
	client := agentruntime.NewClient(baseURL)
	turns := make([]evals.ConversationTurn, 0, 2)

	createOut, createErr, err := runAgent(t, root, env,
		"chat",
		"--daemon-url", baseURL,
		"--repo", repoPath,
		"--goal", "create and verify",
		"--mode", "review",
		"--state-dir", stateDir,
		"--sources", manifest,
		"--message", "create a minimal flogo app",
	)
	if err != nil {
		t.Fatalf("create live chat turn failed: %v\nstdout:\n%s\nstderr:\n%s", err, createOut, createErr)
	}

	sessionID := parseSessionID(t, createOut)
	snapshot := fetchSessionSnapshot(t, client, sessionID)
	if snapshot.Status != contracts.SessionStatusWaitingApproval {
		t.Fatalf("expected waiting approval after create turn, got %s", snapshot.Status)
	}
	if snapshot.LastTurnKind != "creation" {
		t.Fatalf("expected creation turn kind, got %s", snapshot.LastTurnKind)
	}
	if snapshot.PendingApproval == nil || snapshot.PendingApproval.PatchPlan == nil {
		t.Fatalf("expected pending bootstrap approval, got %+v", snapshot.PendingApproval)
	}
	turns = append(turns, captureTurn("create a minimal flogo app", snapshot))

	approveOut, approveErr, err := runAgent(t, root, env,
		"session", "approve", sessionID,
		"--daemon-url", baseURL,
	)
	if err != nil {
		t.Fatalf("approve live create turn failed: %v\nstdout:\n%s\nstderr:\n%s", err, approveOut, approveErr)
	}

	snapshot = fetchSessionSnapshot(t, client, sessionID)
	assertAppliedVerification(t, snapshot)
	turns = append(turns, captureTurn("approve pending bootstrap", snapshot))

	writeLiveArtifacts(t, "create", snapshot.Messages, turns, nil)
}

func skipUnlessLiveOpenAI(t *testing.T) {
	t.Helper()
	if !liveOpenAIEnabled() {
		t.Skip("set OPENAI_E2E=1 or OPENAI_E2E_SMOKE=1 to run live OpenAI e2e tests")
	}
	if strings.TrimSpace(os.Getenv("OPENAI_API_KEY")) == "" {
		t.Skip("OPENAI_API_KEY is required for live OpenAI e2e tests")
	}
}

func liveOpenAIEnabled() bool {
	return strings.TrimSpace(os.Getenv("OPENAI_E2E")) == "1" || strings.TrimSpace(os.Getenv("OPENAI_E2E_SMOKE")) == "1"
}

func captureTurn(userMessage string, snapshot *contracts.SessionSnapshot) evals.ConversationTurn {
	turn := evals.ConversationTurn{
		UserMessage:      userMessage,
		AssistantMessage: latestAssistantMessage(snapshot),
		Status:           snapshot.Status,
		TurnKind:         snapshot.LastTurnKind,
		PendingApproval:  snapshot.PendingApproval != nil,
		StepResults:      append([]contracts.TurnStepResult(nil), snapshot.LastStepResults...),
	}
	if snapshot.LastTurnPlan != nil {
		turn.Planner = snapshot.LastTurnPlan.Planner
	}
	if snapshot.LastReport != nil {
		turn.Outcome = snapshot.LastReport.Outcome
	}
	return turn
}

func latestAssistantMessage(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return ""
	}
	for idx := len(snapshot.Messages) - 1; idx >= 0; idx-- {
		if snapshot.Messages[idx].Role == contracts.RoleAssistant {
			return strings.TrimSpace(snapshot.Messages[idx].Content)
		}
	}
	return ""
}

func assertAppliedVerification(t *testing.T, snapshot *contracts.SessionSnapshot) {
	t.Helper()
	if snapshot.Status != contracts.SessionStatusCompleted {
		t.Fatalf("expected completed status, got %s", snapshot.Status)
	}
	if snapshot.LastReport == nil {
		t.Fatal("expected final report")
	}
	if snapshot.LastReport.Outcome != contracts.RunOutcomeApplied {
		t.Fatalf("expected applied outcome, got %+v", snapshot.LastReport)
	}
	if snapshot.LastReport.Evidence.BuildResult == nil || snapshot.LastReport.Evidence.BuildResult.ExitCode != 0 {
		t.Fatalf("expected successful build evidence, got %+v", snapshot.LastReport.Evidence.BuildResult)
	}
	passed := 0
	for _, test := range snapshot.LastReport.Evidence.TestResults {
		if !test.Skipped && test.Passed {
			passed++
		}
	}
	if passed == 0 {
		t.Fatalf("expected at least one non-skipped passing test, got %+v", snapshot.LastReport.Evidence.TestResults)
	}
	last := snapshot.Messages[len(snapshot.Messages)-1]
	if last.Role != contracts.RoleAssistant || strings.TrimSpace(last.Content) == "" {
		t.Fatalf("expected final non-empty assistant message, got %+v", last)
	}
}

func evaluateConversationOrFatal(t *testing.T, scenario string, sessionID string, transcript []contracts.ChatMessage, turns []evals.ConversationTurn) *evals.ConversationEvalResult {
	t.Helper()
	client, err := model.RequireFromEnv()
	if err != nil {
		t.Fatalf("require eval model: %v", err)
	}
	evalModel := strings.TrimSpace(os.Getenv("OPENAI_EVAL_MODEL"))
	result, err := evals.EvaluateConversation(context.Background(), client, evalModel, evals.ConversationEvalInput{
		Scenario:   scenario,
		SessionID:  sessionID,
		Transcript: transcript,
		Turns:      turns,
	})
	if err != nil {
		t.Fatalf("evaluate conversation: %v", err)
	}
	if !result.Passed {
		t.Fatalf("conversation rubric failed: %+v", result)
	}
	return result
}

func writeLiveArtifacts(t *testing.T, scenario string, transcript []contracts.ChatMessage, turns []evals.ConversationTurn, result *evals.ConversationEvalResult) {
	t.Helper()
	dir := strings.TrimSpace(os.Getenv("OPENAI_E2E_ARTIFACT_DIR"))
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create artifact dir: %v", err)
	}
	writeJSONArtifact(t, filepath.Join(dir, scenario+"-transcript.json"), transcript)
	writeJSONArtifact(t, filepath.Join(dir, scenario+"-turns.json"), turns)
	writeJSONArtifact(t, filepath.Join(dir, scenario+"-eval.json"), result)
}

func writeJSONArtifact(t *testing.T, path string, value any) {
	t.Helper()
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("marshal %s: %v", path, err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
