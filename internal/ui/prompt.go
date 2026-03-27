package ui

import (
	"fmt"
	"strings"

	"github.com/rivo/tview"

	"github.com/aldoapicella/flogo-agent-platform/internal/update"
)

func PromptForModelAPIKey() (string, error) {
	app := tview.NewApplication()
	form := tview.NewForm()
	message := tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(true)
	message.SetText("Enter a model API key to start Flogo Agent.\nThe key will be stored in your user config and reused on future launches.")
	message.SetBorder(true).SetTitle("Model Setup")

	input := tview.NewInputField().
		SetLabel("Model API Key: ").
		SetFieldWidth(48).
		SetMaskCharacter('*')

	var result string
	var runErr error

	form.AddFormItem(input)
	form.AddButton("Continue", func() {
		value := strings.TrimSpace(input.GetText())
		if value == "" {
			message.SetText("[red]Model API Key is required to continue.[-]")
			return
		}
		result = value
		app.Stop()
	})
	form.AddButton("Quit", func() {
		runErr = fmt.Errorf("model API key entry was canceled")
		app.Stop()
	})
	form.SetBorder(true).SetTitle("First Run")

	layout := tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(nil, 0, 1, false).
		AddItem(centered(72, 14,
			tview.NewFlex().SetDirection(tview.FlexRow).
				AddItem(message, 4, 0, false).
				AddItem(form, 0, 1, true),
		), 14, 0, true).
		AddItem(nil, 0, 1, false)

	app.SetRoot(layout, true)
	app.SetFocus(input)
	if err := app.Run(); err != nil {
		return "", err
	}
	if runErr != nil {
		return "", runErr
	}
	return result, nil
}

func PromptForFlogoCLIInstall() (bool, error) {
	app := tview.NewApplication()
	form := tview.NewForm()
	message := tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(true)
	message.SetText("Flogo Agent needs the official `flogo` CLI for create, build, and test workflows.\nInstall a managed per-user copy now?")
	message.SetBorder(true).SetTitle("Flogo Setup")

	var confirmed bool
	var runErr error

	form.AddButton("Install", func() {
		confirmed = true
		app.Stop()
	})
	form.AddButton("Quit", func() {
		runErr = fmt.Errorf("flogo CLI installation was canceled")
		app.Stop()
	})
	form.SetBorder(true).SetTitle("First Run")

	layout := tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(nil, 0, 1, false).
		AddItem(centered(72, 13,
			tview.NewFlex().SetDirection(tview.FlexRow).
				AddItem(message, 4, 0, false).
				AddItem(form, 0, 1, true),
		), 13, 0, true).
		AddItem(nil, 0, 1, false)

	app.SetRoot(layout, true)
	app.SetFocus(form)
	if err := app.Run(); err != nil {
		return false, err
	}
	if runErr != nil {
		return false, runErr
	}
	return confirmed, nil
}

func PromptForUpdate(info update.ReleaseInfo, currentVersion string) (string, error) {
	app := tview.NewApplication()
	header := tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(true)
	header.SetBorder(true).SetTitle("Update Available")
	header.SetText(fmt.Sprintf("A newer Flogo Agent release is available.\nCurrent: [yellow]%s[-]\nLatest: [green]%s[-]\nPublished: %s", currentVersion, info.Version, info.PublishedAt))

	notes := tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(true).
		SetScrollable(true)
	notes.SetBorder(true).SetTitle("Release Notes")
	body := strings.TrimSpace(info.Body)
	if body == "" {
		body = "No release notes were published for this release."
	}
	notes.SetText(body)

	form := tview.NewForm()
	var result string
	var runErr error
	form.AddButton("Update Now", func() {
		result = "update"
		app.Stop()
	})
	form.AddButton("Skip This Version", func() {
		result = "skip"
		app.Stop()
	})
	form.AddButton("Continue", func() {
		result = "continue"
		app.Stop()
	})
	form.SetBorder(true).SetTitle("Startup Update")

	layout := tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(nil, 0, 1, false).
		AddItem(centered(92, 24,
			tview.NewFlex().SetDirection(tview.FlexRow).
				AddItem(header, 5, 0, false).
				AddItem(notes, 0, 1, false).
				AddItem(form, 6, 0, true),
		), 24, 0, true).
		AddItem(nil, 0, 1, false)

	app.SetRoot(layout, true)
	app.SetFocus(form)
	if err := app.Run(); err != nil {
		return "", err
	}
	if runErr != nil {
		return "", runErr
	}
	return result, nil
}
