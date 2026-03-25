package ui

import (
	"context"
	"fmt"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/reporting"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
)

type App struct {
	service *session.Service
}

func New(service *session.Service) *App {
	return &App{service: service}
}

func (a *App) Run(ctx context.Context, initialRepo string, initialGoal string) error {
	app := tview.NewApplication()
	logView := tview.NewTextView().SetDynamicColors(true).SetScrollable(true)
	logView.SetBorder(true).SetTitle("Run Output")

	reportView := tview.NewTextView().SetDynamicColors(true).SetScrollable(true)
	reportView.SetBorder(true).SetTitle("Diff / Evidence")

	form := tview.NewForm()
	repoPath := initialRepo
	goal := initialGoal
	modeLabels := []string{"review", "apply", "auto"}
	modeIndex := 0

	form.AddInputField("Repo", initialRepo, 60, nil, func(text string) {
		repoPath = text
	})
	form.AddInputField("Goal", initialGoal, 60, nil, func(text string) {
		goal = text
	})
	form.AddDropDown("Mode", modeLabels, modeIndex, func(option string, index int) {
		modeIndex = index
	})
	form.AddButton("Run", func() {
		go func() {
			app.QueueUpdateDraw(func() {
				fmt.Fprintln(logView, "running session...")
			})
			req := contracts.SessionRequest{
				RepoPath: repoPath,
				Goal:     goal,
				Mode:     contracts.SessionMode(modeLabels[modeIndex]),
				ApprovalPolicy: contracts.ApprovalPolicy{
					RequireWriteApproval: contracts.SessionMode(modeLabels[modeIndex]) == contracts.ModeReview,
				},
			}
			report, err := a.service.Run(ctx, req)
			app.QueueUpdateDraw(func() {
				if err != nil {
					fmt.Fprintf(logView, "[red]error:[-] %v\n", err)
					return
				}
				fmt.Fprintln(logView, reporting.FormatReport(report))
				if report.PatchPlan != nil {
					fmt.Fprintln(reportView, report.PatchPlan.UnifiedDiff)
				} else {
					fmt.Fprintln(reportView, "no patch generated")
				}
			})
		}()
	})
	form.AddButton("Quit", func() {
		app.Stop()
	})
	form.SetBorder(true).SetTitle("Flogo Agent").SetTitleAlign(tview.AlignLeft)

	layout := tview.NewFlex().
		AddItem(form, 0, 1, true).
		AddItem(tview.NewFlex().SetDirection(tview.FlexRow).
			AddItem(logView, 0, 2, false).
			AddItem(reportView, 0, 2, false), 0, 2, false)

	app.SetRoot(layout, true)
	app.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		if event.Key() == tcell.KeyCtrlC {
			app.Stop()
			return nil
		}
		return event
	})

	return app.Run()
}
