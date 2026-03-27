package ui

import (
	"context"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/reporting"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
)

type Client interface {
	ListSessions(context.Context) ([]contracts.SessionSnapshot, error)
	GetSession(context.Context, string) (*contracts.SessionSnapshot, error)
	CreateSession(context.Context, contracts.SessionRequest) (*contracts.SessionSnapshot, error)
	SendMessage(context.Context, string, string) (*contracts.SessionSnapshot, error)
	Approve(context.Context, string) (*contracts.SessionSnapshot, error)
	Reject(context.Context, string, string) (*contracts.SessionSnapshot, error)
	Undo(context.Context, string) (*contracts.SessionSnapshot, error)
	StreamSession(context.Context, string, func(contracts.SessionStreamEvent) error) error
}

type AppOptions struct {
	Screen           tcell.Screen
	AfterDraw        func(*tview.Application, tcell.Screen, renderState)
	DisableStreaming bool
}

type renderState struct {
	RepoPath         string
	Mode             contracts.SessionMode
	SideMode         string
	ConnectionStatus string
	StatusError      string
	ActiveSessionID  string
	ActiveOverlay    string
	Current          *contracts.SessionSnapshot
}

type App struct {
	client Client
	opts   AppOptions
}

func New(client Client) *App {
	return &App{client: client}
}

func NewWithOptions(client Client, opts AppOptions) *App {
	return &App{client: client, opts: opts}
}

func (a *App) Run(ctx context.Context, initialRepo string, initialGoal string, initialMode contracts.SessionMode, stateDir string, sources string, sandboxConfig sandbox.Config, initialSession string) error {
	app := tview.NewApplication()
	if a.opts.Screen != nil {
		app.SetScreen(a.opts.Screen)
	}
	pages := tview.NewPages()

	statusView := tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(true)
	statusView.SetBorder(true).SetTitle("Status")

	transcriptView := tview.NewTextView().
		SetDynamicColors(true).
		SetScrollable(true).
		SetWrap(true)
	transcriptView.SetBorder(true).SetTitle("Conversation")

	sideView := tview.NewTextView().
		SetDynamicColors(true).
		SetScrollable(true).
		SetWrap(true)
	sideView.SetBorder(true).SetTitle("Plan")

	composer := tview.NewInputField().
		SetLabel("> ").
		SetFieldWidth(0)
	composer.SetBorder(true).SetTitle("Message")

	repoPath := initialRepo
	if strings.TrimSpace(repoPath) == "" {
		repoPath = "."
	}
	goal := initialGoal
	if strings.TrimSpace(goal) == "" {
		goal = "Inspect, repair, build, and test the Flogo app"
	}
	mode := initialMode
	if mode == "" {
		mode = contracts.ModeReview
	}

	var current *contracts.SessionSnapshot
	sideMode := "summary"
	connectionStatus := "connecting"
	statusError := ""
	var streamCancel context.CancelFunc
	activeSessionID := ""
	activeOverlay := ""
	var render func(snapshot *contracts.SessionSnapshot, err error)

	attachStream := func(sessionID string) {
		if strings.TrimSpace(sessionID) == "" {
			return
		}
		if a.opts.DisableStreaming {
			activeSessionID = sessionID
			connectionStatus = "connected"
			return
		}
		if streamCancel != nil {
			streamCancel()
			streamCancel = nil
		}
		streamCtx, cancel := context.WithCancel(ctx)
		streamCancel = cancel
		activeSessionID = sessionID
		connectionStatus = "streaming"
		go func() {
			err := a.client.StreamSession(streamCtx, sessionID, func(event contracts.SessionStreamEvent) error {
				if event.Snapshot == nil {
					return nil
				}
				app.QueueUpdateDraw(func() {
					connectionStatus = "streaming"
					statusError = ""
					render(event.Snapshot, nil)
				})
				return nil
			})
			if streamCtx.Err() != nil {
				return
			}
			app.QueueUpdateDraw(func() {
				connectionStatus = "disconnected"
				if err != nil {
					statusError = err.Error()
				} else {
					statusError = "session stream disconnected"
				}
				render(current, nil)
			})
		}()
	}

	render = func(snapshot *contracts.SessionSnapshot, err error) {
		if snapshot != nil {
			if snapshot.ID != "" && snapshot.ID != activeSessionID {
				attachStream(snapshot.ID)
			}
			current = snapshot
			statusError = ""
			if activeSessionID == snapshot.ID && streamCancel != nil {
				connectionStatus = "streaming"
			} else {
				connectionStatus = "connected"
			}
		}

		transcriptView.Clear()
		sideView.Clear()
		statusView.Clear()

		statusLines := []string{
			fmt.Sprintf("Repo: %s", repoPath),
			fmt.Sprintf("Mode: %s", mode),
			fmt.Sprintf("View: %s", strings.ToUpper(sideMode)),
			fmt.Sprintf("Connection: %s", connectionStatus),
		}
		if current != nil {
			statusLines = append(statusLines,
				fmt.Sprintf("Session: %s", current.ID),
				fmt.Sprintf("Status: %s", current.Status),
			)
		} else {
			statusLines = append(statusLines, "Session: connecting")
		}
		if err != nil {
			statusError = err.Error()
		}
		if statusError != "" {
			statusLines = append(statusLines, fmt.Sprintf("[red]Error:[-] %s", statusError))
		}
		if current != nil && current.PendingApproval != nil {
			statusLines = append(statusLines, fmt.Sprintf("[yellow]Pending approval:[-] %s", current.PendingApproval.Summary))
		}
		if current != nil && len(current.UndoStack) > 0 {
			statusLines = append(statusLines, fmt.Sprintf("Undo entries: %d", len(current.UndoStack)))
		}
		statusLines = append(statusLines, "Keys: Enter send | Ctrl+A approve | Ctrl+R reject | Ctrl+U undo | Ctrl+O sessions | Ctrl+D diff | Ctrl+P plan | Ctrl+L refresh | Ctrl+C quit")
		fmt.Fprint(statusView, strings.Join(statusLines, "\n"))

		if current == nil {
			fmt.Fprintln(transcriptView, "[gray]Connecting to the local daemon and preparing a session...[-]")
			transcriptView.ScrollToEnd()
			renderSide(sideView, nil, sideMode)
			return
		}

		assistantCount := 0
		for _, item := range current.Messages {
			labelColor := "white"
			switch item.Role {
			case contracts.RoleUser:
				labelColor = "blue"
			case contracts.RoleAssistant:
				labelColor = "green"
				assistantCount++
			case contracts.RoleSystem:
				labelColor = "yellow"
			}
			fmt.Fprintf(transcriptView, "[%s]%s[-]\n%s\n\n", labelColor, strings.ToUpper(string(item.Role)), item.Content)
		}
		if assistantCount == 0 {
			fmt.Fprintln(transcriptView, "[gray]Type your first request below. Example: repair and verify the app[-]")
		}
		transcriptView.ScrollToEnd()
		renderSide(sideView, current, sideMode)
	}

	runAsync := func(fn func() (*contracts.SessionSnapshot, error)) {
		go func() {
			snapshot, err := fn()
			app.QueueUpdateDraw(func() {
				if snapshot == nil {
					render(current, err)
					return
				}
				render(snapshot, err)
			})
		}()
	}

	loadSession := func(sessionID string) {
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.GetSession(ctx, sessionID)
		})
	}

	sendMessage := func() {
		if current == nil {
			render(current, fmt.Errorf("session is still loading"))
			return
		}
		text := strings.TrimSpace(composer.GetText())
		if text == "" {
			return
		}
		composer.SetText("")
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.SendMessage(ctx, current.ID, text)
		})
	}

	refresh := func() {
		if current == nil {
			render(current, fmt.Errorf("session is still loading"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.GetSession(ctx, current.ID)
		})
	}

	approve := func() {
		if current == nil {
			render(current, fmt.Errorf("session is still loading"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.Approve(ctx, current.ID)
		})
	}

	reject := func() {
		if current == nil {
			render(current, fmt.Errorf("session is still loading"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.Reject(ctx, current.ID, "")
		})
	}

	undo := func() {
		if current == nil {
			render(current, fmt.Errorf("session is still loading"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.Undo(ctx, current.ID)
		})
	}

	openSessionPicker := func() {
		go func() {
			sessions, err := a.client.ListSessions(ctx)
			app.QueueUpdateDraw(func() {
				if err != nil {
					render(current, err)
					return
				}
				sort.Slice(sessions, func(i, j int) bool { return sessions[i].UpdatedAt > sessions[j].UpdatedAt })
				list := tview.NewList().ShowSecondaryText(true)
				list.SetBorder(true).SetTitle("Sessions")
				for _, item := range sessions {
					label := item.ID
					secondary := fmt.Sprintf("%s | %s | %s", filepath.Base(item.RepoPath), item.Status, item.UpdatedAt)
					sessionID := item.ID
				list.AddItem(label, secondary, 0, func() {
					activeOverlay = ""
					pages.HidePage("sessions")
					loadSession(sessionID)
				})
			}
			list.SetDoneFunc(func() {
				activeOverlay = ""
				pages.HidePage("sessions")
				app.SetFocus(composer)
			})
			activeOverlay = "sessions"
			pages.AddAndSwitchToPage("sessions", centered(90, 20, list), true)
			app.SetFocus(list)
		})
		}()
	}

	composer.SetDoneFunc(func(key tcell.Key) {
		if key == tcell.KeyEnter {
			sendMessage()
		}
	})

	layout := tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(statusView, 5, 0, false).
		AddItem(
			tview.NewFlex().
				AddItem(transcriptView, 0, 3, false).
				AddItem(sideView, 0, 2, false),
			0, 1, false,
		).
		AddItem(composer, 3, 0, true)

	pages.AddPage("main", layout, true, true)
	app.SetRoot(pages, true)
	app.SetFocus(composer)
	if a.opts.AfterDraw != nil {
		app.SetAfterDrawFunc(func(screen tcell.Screen) {
			a.opts.AfterDraw(app, screen, renderState{
				RepoPath:         repoPath,
				Mode:             mode,
				SideMode:         sideMode,
				ConnectionStatus: connectionStatus,
				StatusError:      statusError,
				ActiveSessionID:  activeSessionID,
				ActiveOverlay:    activeOverlay,
				Current:          current,
			})
		})
	}
	app.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		switch event.Key() {
		case tcell.KeyCtrlC:
			app.Stop()
			return nil
		case tcell.KeyCtrlA:
			approve()
			return nil
		case tcell.KeyCtrlR:
			reject()
			return nil
		case tcell.KeyCtrlU:
			undo()
			return nil
		case tcell.KeyCtrlO:
			openSessionPicker()
			return nil
		case tcell.KeyCtrlD:
			sideMode = "diff"
			render(current, nil)
			return nil
		case tcell.KeyCtrlP:
			sideMode = "summary"
			render(current, nil)
			return nil
		case tcell.KeyCtrlL:
			refresh()
			return nil
		default:
			return event
		}
	})

	render(nil, nil)
	runAsync(func() (*contracts.SessionSnapshot, error) {
		return a.bootstrapSession(ctx, repoPath, goal, mode, stateDir, sources, sandboxConfig, initialSession)
	})

	defer func() {
		if streamCancel != nil {
			streamCancel()
		}
	}()
	return app.Run()
}

func (a *App) bootstrapSession(ctx context.Context, repoPath string, goal string, mode contracts.SessionMode, stateDir string, sources string, sandboxConfig sandbox.Config, initialSession string) (*contracts.SessionSnapshot, error) {
	if strings.TrimSpace(initialSession) != "" {
		return a.client.GetSession(ctx, initialSession)
	}

	sessions, err := a.client.ListSessions(ctx)
	if err == nil {
		if existing := findLatestSessionForRepo(sessions, repoPath); existing != nil {
			return a.client.GetSession(ctx, existing.ID)
		}
	}

	return a.client.CreateSession(ctx, contracts.SessionRequest{
		RepoPath: repoPath,
		Goal:     goal,
		Mode:     mode,
		ApprovalPolicy: contracts.ApprovalPolicy{
			RequireWriteApproval: mode == contracts.ModeReview,
		},
		Sandbox:         contracts.SandboxConfig(sandboxConfig),
		StateDir:        stateDir,
		SourcesManifest: sources,
	})
}

func renderSide(view *tview.TextView, snapshot *contracts.SessionSnapshot, sideMode string) {
	view.Clear()
	if snapshot == nil {
		fmt.Fprintln(view, "[gray]Session bootstrap in progress...[-]")
		return
	}

	title := "Plan"
	if sideMode == "diff" {
		title = "Diff"
	}
	view.SetTitle(title)

	if sideMode == "diff" {
		diff := ""
		switch {
		case snapshot.PendingApproval != nil && snapshot.PendingApproval.PatchPlan != nil:
			diff = strings.TrimSpace(snapshot.PendingApproval.PatchPlan.UnifiedDiff)
		case snapshot.LastReport != nil && snapshot.LastReport.PatchPlan != nil:
			diff = strings.TrimSpace(snapshot.LastReport.PatchPlan.UnifiedDiff)
		}
		if diff == "" {
			fmt.Fprintln(view, "[gray]No diff available for the current session.[-]")
			return
		}
		fmt.Fprintln(view, diff)
		return
	}

	if snapshot.LastTurnPlan != nil {
		fmt.Fprintf(view, "Goal: %s\n", snapshot.LastTurnPlan.GoalSummary)
		if snapshot.LastTurnPlan.Planner != "" {
			fmt.Fprintf(view, "Planner: %s\n", snapshot.LastTurnPlan.Planner)
		}
		if snapshot.LastTurnKind != "" {
			fmt.Fprintf(view, "Turn kind: %s\n", snapshot.LastTurnKind)
		}
		fmt.Fprintln(view)
	}

	if len(snapshot.LastStepResults) > 0 {
		fmt.Fprintln(view, "Step results:")
		for _, result := range snapshot.LastStepResults {
			fmt.Fprintf(view, "- [%s] %s: %s\n", result.Status, result.Type, result.Summary)
		}
		fmt.Fprintln(view)
	}

	if len(snapshot.Plan) > 0 {
		fmt.Fprintln(view, "Plan:")
		for _, item := range snapshot.Plan {
			fmt.Fprintf(view, "- [%s] %s", item.Status, item.Title)
			if item.Details != "" {
				fmt.Fprintf(view, ": %s", item.Details)
			}
			fmt.Fprintln(view)
		}
		fmt.Fprintln(view)
	}

	if snapshot.PendingApproval != nil {
		fmt.Fprintf(view, "Pending approval: %s\n\n", snapshot.PendingApproval.Summary)
	}

	if snapshot.LastReport != nil {
		fmt.Fprintln(view, "Report:")
		fmt.Fprintln(view, reporting.FormatReport(snapshot.LastReport))
	}
}

func findLatestSessionForRepo(items []contracts.SessionSnapshot, repoPath string) *contracts.SessionSnapshot {
	for idx := range items {
		if sameRepoPath(items[idx].RepoPath, repoPath) {
			snapshot := items[idx]
			return &snapshot
		}
	}
	return nil
}

func sameRepoPath(left string, right string) bool {
	leftAbs, leftErr := filepath.Abs(left)
	rightAbs, rightErr := filepath.Abs(right)
	if leftErr != nil || rightErr != nil {
		return filepath.Clean(left) == filepath.Clean(right)
	}
	return filepath.Clean(leftAbs) == filepath.Clean(rightAbs)
}

func centered(width int, height int, primitive tview.Primitive) tview.Primitive {
	return tview.NewFlex().
		AddItem(nil, 0, 1, false).
		AddItem(
			tview.NewFlex().SetDirection(tview.FlexRow).
				AddItem(nil, 0, 1, false).
				AddItem(primitive, height, 1, true).
				AddItem(nil, 0, 1, false),
			width, 1, true,
		).
		AddItem(nil, 0, 1, false)
}
