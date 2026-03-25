package ui

import (
	"context"
	"fmt"
	"strings"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/reporting"
	agentruntime "github.com/aldoapicella/flogo-agent-platform/internal/runtime"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
)

type App struct {
	client *agentruntime.Client
}

func New(client *agentruntime.Client) *App {
	return &App{client: client}
}

func (a *App) Run(ctx context.Context, initialRepo string, initialGoal string, initialMode contracts.SessionMode, stateDir string, sources string, sandboxConfig sandbox.Config, initialSession string) error {
	app := tview.NewApplication()
	transcriptView := tview.NewTextView().SetDynamicColors(true).SetScrollable(true)
	transcriptView.SetBorder(true).SetTitle("Conversation")

	planView := tview.NewTextView().SetDynamicColors(true).SetScrollable(true)
	planView.SetBorder(true).SetTitle("Plan / Diff")

	statusView := tview.NewTextView().SetDynamicColors(true).SetScrollable(true)
	statusView.SetBorder(true).SetTitle("Status")

	form := tview.NewForm()
	repoPath := initialRepo
	goal := initialGoal
	sessionID := initialSession
	message := ""
	modeLabels := []string{"review", "apply", "auto"}
	modeIndex := 0
	for idx, label := range modeLabels {
		if label == string(initialMode) {
			modeIndex = idx
			break
		}
	}

	var current *contracts.SessionSnapshot

	render := func(snapshot *contracts.SessionSnapshot, err error) {
		transcriptView.Clear()
		planView.Clear()
		statusView.Clear()

		if err != nil {
			fmt.Fprintf(statusView, "[red]error:[-] %v\n", err)
			return
		}
		if snapshot == nil {
			fmt.Fprintln(statusView, "[yellow]no session loaded[-]")
			return
		}

		current = snapshot
		sessionID = snapshot.ID
		fmt.Fprintf(statusView, "Session: %s\nStatus: %s\nRepo: %s\nMode: %s\n", snapshot.ID, snapshot.Status, snapshot.RepoPath, snapshot.Mode)
		if snapshot.LastTurnPlan != nil {
			fmt.Fprintf(statusView, "Planner: %s\nGoal: %s\n", snapshot.LastTurnPlan.Planner, snapshot.LastTurnPlan.GoalSummary)
		}
		if snapshot.LastTurnKind != "" {
			fmt.Fprintf(statusView, "Turn kind: %s\n", snapshot.LastTurnKind)
		}
		if snapshot.PendingApproval != nil {
			fmt.Fprintf(statusView, "\n[yellow]Pending approval[-]: %s\n", snapshot.PendingApproval.Summary)
		}

		for _, item := range snapshot.Messages {
			fmt.Fprintf(transcriptView, "[blue]%s[-] %s\n\n", strings.ToUpper(string(item.Role)), item.Content)
		}

		if snapshot.LastTurnPlan != nil {
			fmt.Fprintln(planView, "Last turn plan:")
			for _, step := range snapshot.LastTurnPlan.Steps {
				fmt.Fprintf(planView, "- %s", step.Type)
				if step.Reason != "" {
					fmt.Fprintf(planView, ": %s", step.Reason)
				}
				fmt.Fprintln(planView)
			}
			fmt.Fprintln(planView)
		}
		if len(snapshot.LastStepResults) > 0 {
			fmt.Fprintln(planView, "Step results:")
			for _, result := range snapshot.LastStepResults {
				fmt.Fprintf(planView, "- [%s] %s: %s\n", result.Status, result.Type, result.Summary)
			}
			fmt.Fprintln(planView)
		}
		if len(snapshot.Plan) > 0 {
			fmt.Fprintln(planView, "Execution plan:")
			for _, item := range snapshot.Plan {
				fmt.Fprintf(planView, "- [%s] %s", item.Status, item.Title)
				if item.Details != "" {
					fmt.Fprintf(planView, ": %s", item.Details)
				}
				fmt.Fprintln(planView)
			}
		}
		if snapshot.PendingApproval != nil && snapshot.PendingApproval.PatchPlan != nil && strings.TrimSpace(snapshot.PendingApproval.PatchPlan.UnifiedDiff) != "" {
			fmt.Fprintln(planView, "\nDiff:")
			fmt.Fprintln(planView, snapshot.PendingApproval.PatchPlan.UnifiedDiff)
		} else if snapshot.LastReport != nil && snapshot.LastReport.PatchPlan != nil && strings.TrimSpace(snapshot.LastReport.PatchPlan.UnifiedDiff) != "" {
			fmt.Fprintln(planView, "\nDiff:")
			fmt.Fprintln(planView, snapshot.LastReport.PatchPlan.UnifiedDiff)
		}
		if snapshot.LastReport != nil {
			fmt.Fprintln(planView, "\nReport:")
			fmt.Fprintln(planView, reporting.FormatReport(snapshot.LastReport))
		}
	}

	runAsync := func(fn func() (*contracts.SessionSnapshot, error)) {
		go func() {
			snapshot, err := fn()
			app.QueueUpdateDraw(func() {
				render(snapshot, err)
			})
		}()
	}

	form.AddInputField("Repo", initialRepo, 60, nil, func(text string) {
		repoPath = text
	})
	form.AddInputField("Goal", initialGoal, 60, nil, func(text string) {
		goal = text
	})
	form.AddDropDown("Mode", modeLabels, modeIndex, func(option string, index int) {
		modeIndex = index
	})
	form.AddInputField("Session", initialSession, 40, nil, func(text string) {
		sessionID = text
	})
	form.AddInputField("Message", "", 60, nil, func(text string) {
		message = text
	})
	form.AddButton("Start Session", func() {
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.CreateSession(ctx, contracts.SessionRequest{
				RepoPath: repoPath,
				Goal:     goal,
				Mode:     contracts.SessionMode(modeLabels[modeIndex]),
				ApprovalPolicy: contracts.ApprovalPolicy{
					RequireWriteApproval: contracts.SessionMode(modeLabels[modeIndex]) == contracts.ModeReview,
				},
				Sandbox:         contracts.SandboxConfig(sandboxConfig),
				StateDir:        stateDir,
				SourcesManifest: sources,
			})
		})
	})
	form.AddButton("Send", func() {
		if strings.TrimSpace(sessionID) == "" {
			render(nil, fmt.Errorf("start or attach a session first"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.SendMessage(ctx, sessionID, message)
		})
	})
	form.AddButton("Approve", func() {
		if strings.TrimSpace(sessionID) == "" {
			render(nil, fmt.Errorf("start or attach a session first"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.Approve(ctx, sessionID)
		})
	})
	form.AddButton("Reject", func() {
		if strings.TrimSpace(sessionID) == "" {
			render(nil, fmt.Errorf("start or attach a session first"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.Reject(ctx, sessionID, "")
		})
	})
	form.AddButton("Refresh", func() {
		if strings.TrimSpace(sessionID) == "" {
			render(nil, fmt.Errorf("start or attach a session first"))
			return
		}
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.GetSession(ctx, sessionID)
		})
	})
	form.AddButton("Quit", func() {
		app.Stop()
	})
	form.SetBorder(true).SetTitle("Flogo Agent").SetTitleAlign(tview.AlignLeft)

	layout := tview.NewFlex().
		AddItem(form, 0, 1, true).
		AddItem(tview.NewFlex().SetDirection(tview.FlexRow).
			AddItem(transcriptView, 0, 3, false).
			AddItem(planView, 0, 2, false).
			AddItem(statusView, 8, 0, false), 0, 2, false)

	app.SetRoot(layout, true)
	app.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		if event.Key() == tcell.KeyCtrlC {
			app.Stop()
			return nil
		}
		return event
	})

	if strings.TrimSpace(initialSession) != "" {
		runAsync(func() (*contracts.SessionSnapshot, error) {
			return a.client.GetSession(ctx, initialSession)
		})
	} else if current == nil {
		render(nil, nil)
	}
	return app.Run()
}
