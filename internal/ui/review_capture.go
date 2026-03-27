package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

type ReviewCapture struct {
	Name            string `json:"name"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Path            string `json:"path"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	SideMode        string `json:"sideMode,omitempty"`
	SessionStatus   string `json:"sessionStatus,omitempty"`
	SessionID       string `json:"sessionId,omitempty"`
	PendingApproval bool   `json:"pendingApproval,omitempty"`
	ScreenText      string `json:"screenText,omitempty"`
}

type captureSpec struct {
	Name             string
	Title            string
	Description      string
	RepoPath         string
	Mode             contracts.SessionMode
	SideMode         string
	ConnectionStatus string
	StatusError      string
	Current          *contracts.SessionSnapshot
	Overlay          string
	Sessions         []contracts.SessionSnapshot
}

func CaptureScriptedReview(ctx context.Context, outDir string, repoPath string, width int, height int) ([]ReviewCapture, error) {
	if strings.TrimSpace(outDir) == "" {
		return nil, fmt.Errorf("output directory is required")
	}
	if width <= 0 {
		width = 140
	}
	if height <= 0 {
		height = 42
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}

	baseSession := sampleSessionSnapshot(repoPath)
	waitingApproval := sampleWaitingApprovalSnapshot(repoPath)
	summaryView := sampleSummarySnapshot(repoPath)

	scenarios := []captureSpec{
		{
			Name:             "startup-loading",
			Title:            "Startup Loading",
			Description:      "Initial full-screen TUI boot state before the session is loaded.",
			RepoPath:         repoPath,
			Mode:             contracts.ModeReview,
			SideMode:         "summary",
			ConnectionStatus: "connecting",
		},
		{
			Name:             "idle-conversation",
			Title:            "Idle Conversation",
			Description:      "Loaded session with the default summary side panel and no pending approval.",
			RepoPath:         repoPath,
			Mode:             contracts.ModeReview,
			SideMode:         "summary",
			ConnectionStatus: "connected",
			Current:          baseSession,
		},
		{
			Name:             "repair-waiting-approval",
			Title:            "Repair Waiting Approval",
			Description:      "Review-mode session after analysis with a pending patch waiting for user approval.",
			RepoPath:         repoPath,
			Mode:             contracts.ModeReview,
			SideMode:         "summary",
			ConnectionStatus: "connected",
			Current:          waitingApproval,
		},
		{
			Name:             "diff-view",
			Title:            "Diff View",
			Description:      "Pending approval session after toggling the side panel into diff mode.",
			RepoPath:         repoPath,
			Mode:             contracts.ModeReview,
			SideMode:         "diff",
			ConnectionStatus: "connected",
			Current:          waitingApproval,
		},
		{
			Name:             "plan-view",
			Title:            "Plan View",
			Description:      "Session summary panel with richer plan and report context after a repair iteration.",
			RepoPath:         repoPath,
			Mode:             contracts.ModeReview,
			SideMode:         "summary",
			ConnectionStatus: "connected",
			Current:          summaryView,
		},
		{
			Name:             "session-picker",
			Title:            "Session Picker",
			Description:      "Session picker overlay listing resumable sessions for the current repo.",
			RepoPath:         repoPath,
			Mode:             contracts.ModeReview,
			SideMode:         "summary",
			ConnectionStatus: "connected",
			Current:          baseSession,
			Overlay:          "sessions",
			Sessions: []contracts.SessionSnapshot{
				*cloneSnapshot(baseSession),
				*cloneSnapshot(waitingApproval),
				*cloneSnapshot(summaryView),
			},
		},
	}

	captures := make([]ReviewCapture, 0, len(scenarios))
	for _, scenario := range scenarios {
		capture, err := runCaptureScenario(ctx, outDir, width, height, scenario)
		if err != nil {
			return nil, err
		}
		captures = append(captures, capture)
	}
	return captures, nil
}

func runCaptureScenario(ctx context.Context, outDir string, width int, height int, spec captureSpec) (ReviewCapture, error) {
	_ = ctx
	screen := tcell.NewSimulationScreen("")
	if err := screen.Init(); err != nil {
		return ReviewCapture{}, err
	}
	defer screen.Fini()
	screen.SetSize(width, height)
	if err := drawScenario(screen, width, height, spec); err != nil {
		return ReviewCapture{}, err
	}
	screenText := simulationScreenText(screen)
	pngPath := filepath.Join(outDir, spec.Name+".png")
	if err := writeSimulationPNG(screen, pngPath); err != nil {
		return ReviewCapture{}, err
	}
	width, height = simulationScreenSize(screen)
	result := ReviewCapture{
		Name:            spec.Name,
		Title:           spec.Title,
		Description:     spec.Description,
		Path:            pngPath,
		Width:           width,
		Height:          height,
		SideMode:        spec.SideMode,
		ScreenText:      screenText,
		SessionID:       activeSessionID(spec.Current),
		SessionStatus:   sessionStatus(spec.Current),
		PendingApproval: spec.Current != nil && spec.Current.PendingApproval != nil,
	}
	if err := writeCaptureMetadata(filepath.Join(outDir, spec.Name+".json"), result); err != nil {
		return ReviewCapture{}, err
	}
	return result, nil
}

func drawScenario(screen tcell.SimulationScreen, width int, height int, spec captureSpec) error {
	topBar := newTopBar()
	bannerView := newBanner()
	transcriptView := newTranscriptView()
	sideView := newSideView()
	actionsView := newActionsView()
	composer := newComposer()

	state := renderState{
		RepoPath:         spec.RepoPath,
		Mode:             spec.Mode,
		SideMode:         spec.SideMode,
		ConnectionStatus: spec.ConnectionStatus,
		StatusError:      spec.StatusError,
		ActiveSessionID:  activeSessionID(spec.Current),
		ActiveOverlay:    spec.Overlay,
		Current:          spec.Current,
	}
	renderTopBar(topBar, state)
	renderBanner(bannerView, state)
	renderTranscript(transcriptView, state)
	renderSide(sideView, spec.Current, spec.SideMode)
	renderActions(actionsView, state)

	layout := buildMainLayout(topBar, bannerView, transcriptView, sideView, actionsView, composer, spec.SideMode)

	pages := tview.NewPages()
	pages.AddPage("main", layout, true, true)
	if spec.Overlay == "sessions" {
		pages.AddAndSwitchToPage("sessions", buildSessionPicker(spec.Sessions, activeSessionID(spec.Current), nil, nil), true)
	}

	screen.Clear()
	pages.SetRect(0, 0, width, height)
	pages.Draw(screen)
	screen.Show()
	return nil
}

func writeCaptureMetadata(path string, capture ReviewCapture) error {
	payload, err := json.MarshalIndent(capture, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o644)
}

func writeSimulationPNG(screen tcell.SimulationScreen, path string) error {
	const cellWidth = 8
	const cellHeight = 16
	cells, width, height := screen.GetContents()
	img := image.NewRGBA(image.Rect(0, 0, width*cellWidth, height*cellHeight))
	draw.Draw(img, img.Bounds(), image.NewUniform(color.RGBA{R: 12, G: 12, B: 12, A: 255}), image.Point{}, draw.Src)
	face := basicfont.Face7x13

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			cell := cells[y*width+x]
			fg, bg, _ := cell.Style.Decompose()
			bgColor := toRGBA(bg, color.RGBA{R: 12, G: 12, B: 12, A: 255})
			fgColor := toRGBA(fg, color.RGBA{R: 232, G: 232, B: 232, A: 255})
			rect := image.Rect(x*cellWidth, y*cellHeight, (x+1)*cellWidth, (y+1)*cellHeight)
			draw.Draw(img, rect, image.NewUniform(bgColor), image.Point{}, draw.Src)

			r := rune(' ')
			if len(cell.Runes) > 0 && cell.Runes[0] != 0 {
				r = cell.Runes[0]
			} else if len(cell.Bytes) > 0 {
				r = rune(cell.Bytes[0])
			}
			r = screenshotRune(r)
			if r == ' ' {
				continue
			}
			drawer := &font.Drawer{
				Dst:  img,
				Src:  image.NewUniform(fgColor),
				Face: face,
				Dot:  fixed.P(x*cellWidth, y*cellHeight+13),
			}
			drawer.DrawString(string(r))
		}
	}

	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return png.Encode(file, img)
}

func simulationScreenText(screen tcell.SimulationScreen) string {
	cells, width, height := screen.GetContents()
	lines := make([]string, 0, height)
	for y := 0; y < height; y++ {
		var builder strings.Builder
		for x := 0; x < width; x++ {
			cell := cells[y*width+x]
			r := rune(' ')
			if len(cell.Runes) > 0 && cell.Runes[0] != 0 {
				r = cell.Runes[0]
			} else if len(cell.Bytes) > 0 {
				r = rune(cell.Bytes[0])
			}
			builder.WriteRune(r)
		}
		lines = append(lines, strings.TrimRight(builder.String(), " "))
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func simulationScreenSize(screen tcell.SimulationScreen) (int, int) {
	_, width, height := screen.GetContents()
	return width, height
}

func toRGBA(value tcell.Color, fallback color.RGBA) color.RGBA {
	r, g, b := value.RGB()
	if r < 0 || g < 0 || b < 0 {
		return fallback
	}
	return color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 255}
}

func screenshotRune(r rune) rune {
	switch r {
	case '─', '━', '═':
		return '-'
	case '│', '┃', '║':
		return '|'
	case '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬':
		return '+'
	case '…':
		return '.'
	default:
		return r
	}
}

func sessionStatus(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return ""
	}
	return string(snapshot.Status)
}

func activeSessionID(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return ""
	}
	return snapshot.ID
}

func defaultGoal() string {
	return "Inspect, repair, build, and test the Flogo app"
}

func sampleSessionSnapshot(repoPath string) *contracts.SessionSnapshot {
	return &contracts.SessionSnapshot{
		ID:       "ui-review-session",
		RepoPath: repoPath,
		Goal:     defaultGoal(),
		Mode:     contracts.ModeReview,
		Status:   contracts.SessionStatusActive,
		Messages: []contracts.ChatMessage{
			{ID: "msg-user-1", Role: contracts.RoleUser, Content: "what are you", CreatedAt: "2026-03-27T12:00:00Z"},
			{ID: "msg-assistant-1", Role: contracts.RoleAssistant, Content: "I am a conversational coding agent specialized for TIBCO Flogo apps. I can inspect a repo, explain `flogo.json`, propose repairs, show diffs, and run the build-and-verify loop with approval gating.", CreatedAt: "2026-03-27T12:00:03Z"},
		},
		Plan: []contracts.PlanItem{
			{ID: "plan-1", Title: "Inspect the current Flogo app", Status: contracts.PlanItemCompleted, Details: "Validated the descriptor and loaded the latest session context"},
			{ID: "plan-2", Title: "Wait for the next user request", Status: contracts.PlanItemInProgress},
		},
		LastTurnKind: "conversation",
		LastTurnPlan: &contracts.TurnPlan{
			GoalSummary: "Answer the direct product question",
			Planner:     "openai/gpt-5.2",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepShowStatus, Reason: "Direct question answered without repo mutation"},
			},
		},
		CreatedAt: "2026-03-27T12:00:00Z",
		UpdatedAt: "2026-03-27T12:00:03Z",
	}
}

func sampleWaitingApprovalSnapshot(repoPath string) *contracts.SessionSnapshot {
	return &contracts.SessionSnapshot{
		ID:       "ui-review-approval",
		RepoPath: repoPath,
		Goal:     defaultGoal(),
		Mode:     contracts.ModeReview,
		Status:   contracts.SessionStatusWaitingApproval,
		Messages: []contracts.ChatMessage{
			{ID: "msg-user-1", Role: contracts.RoleUser, Content: "repair and verify the app", CreatedAt: "2026-03-27T12:10:00Z"},
			{ID: "msg-assistant-1", Role: contracts.RoleAssistant, Content: "I found wiring issues in the REST handler and prepared a safe patch. Review the diff, then approve to apply it and run verification.", CreatedAt: "2026-03-27T12:10:08Z"},
		},
		Plan: []contracts.PlanItem{
			{ID: "plan-1", Title: "Inspect the current Flogo app", Status: contracts.PlanItemCompleted},
			{ID: "plan-2", Title: "Repair semantic issues and prepare a patch", Status: contracts.PlanItemCompleted},
			{ID: "plan-3", Title: "Wait for user approval before applying changes", Status: contracts.PlanItemBlocked, Details: "Review mode requires explicit approval"},
		},
		LastTurnKind: "repair",
		LastTurnPlan: &contracts.TurnPlan{
			GoalSummary: "Repair and verify the current Flogo app",
			Planner:     "openai/gpt-5.2",
			Steps: []contracts.TurnStep{
				{Type: contracts.TurnStepInspectWorkspace, Reason: "Load the descriptor and current session state"},
				{Type: contracts.TurnStepRepairAndVerify, Reason: "Prepare a safe patch and verify before applying"},
			},
		},
		LastStepResults: []contracts.TurnStepResult{
			{Type: contracts.TurnStepInspectWorkspace, Status: contracts.TurnStepStatusCompleted, Summary: "Loaded flogo.json and existing session state"},
			{Type: contracts.TurnStepRepairAndVerify, Status: contracts.TurnStepStatusBlocked, Summary: "Prepared a safe patch and paused for user approval"},
		},
		PendingApproval: &contracts.PendingApproval{
			Kind:        "patch",
			Summary:     "Apply the prepared flogo.json repair patch",
			RequestedAt: "2026-03-27T12:10:08Z",
			PatchPlan: &contracts.PatchPlan{
				TargetFiles: []string{"flogo.json"},
				Rationale:   "Normalize flowURI, repair handler input mapping, and remove noisy action id drift",
				Safe:        true,
				UnifiedDiff: strings.TrimSpace(`--- a/flogo.json
+++ b/flogo.json
@@
-            "flowURI": "main",
-            "input": {"message": "$flow.body"},
+            "flowURI": "res://flow:main",
+            "input": {"message": "=$.pathParams.val"},
@@
-      "id": "inline-action",
`),
			},
		},
		LastReport: &contracts.RunReport{
			Outcome:    contracts.RunOutcomeReady,
			NextAction: "Review the diff and approve the patch to apply it and run verification.",
			Messages: []string{
				"Semantic validation found a non-canonical flowURI and an invalid handler input mapping.",
			},
		},
		CreatedAt: "2026-03-27T12:10:00Z",
		UpdatedAt: "2026-03-27T12:10:08Z",
	}
}

func sampleSummarySnapshot(repoPath string) *contracts.SessionSnapshot {
	snapshot := sampleSessionSnapshot(repoPath)
	snapshot.ID = "ui-review-summary"
	snapshot.Messages = append(snapshot.Messages,
		contracts.ChatMessage{ID: "msg-user-2", Role: contracts.RoleUser, Content: "show me the current repair status", CreatedAt: "2026-03-27T12:20:00Z"},
		contracts.ChatMessage{ID: "msg-assistant-2", Role: contracts.RoleAssistant, Content: "The app is buildable after the last patch, the REST flow wiring is valid, and the next step is to approve the pending patch or ask for another change.", CreatedAt: "2026-03-27T12:20:04Z"},
	)
	snapshot.Status = contracts.SessionStatusActive
	snapshot.LastTurnKind = "status"
	snapshot.LastTurnPlan = &contracts.TurnPlan{
		GoalSummary: "Show the current repair status",
		Planner:     "openai/gpt-5.2",
		Steps: []contracts.TurnStep{
			{Type: contracts.TurnStepShowStatus, Reason: "Summarize the current session state and latest report"},
		},
	}
	snapshot.LastStepResults = []contracts.TurnStepResult{
		{Type: contracts.TurnStepShowStatus, Status: contracts.TurnStepStatusCompleted, Summary: "Rendered the latest report, plan, and approval state"},
	}
	snapshot.Plan = []contracts.PlanItem{
		{ID: "plan-1", Title: "Inspect flogo.json and flow wiring", Status: contracts.PlanItemCompleted},
		{ID: "plan-2", Title: "Prepare and explain the repair patch", Status: contracts.PlanItemCompleted},
		{ID: "plan-3", Title: "Verify build and startup smoke results", Status: contracts.PlanItemCompleted},
		{ID: "plan-4", Title: "Wait for another user decision", Status: contracts.PlanItemInProgress},
	}
	snapshot.LastReport = &contracts.RunReport{
		Outcome:      contracts.RunOutcomeApplied,
		ChangedFiles: []string{"flogo.json"},
		NextAction:   "Either approve another patch iteration or continue with additional review requests.",
		Messages: []string{
			"Validation passed after the latest patch.",
			"Build succeeded and startup smoke stayed alive for the expected timeout window.",
		},
	}
	return snapshot
}

func cloneSnapshot(snapshot *contracts.SessionSnapshot) *contracts.SessionSnapshot {
	if snapshot == nil {
		return nil
	}
	payload, _ := json.Marshal(snapshot)
	var clone contracts.SessionSnapshot
	_ = json.Unmarshal(payload, &clone)
	return &clone
}
