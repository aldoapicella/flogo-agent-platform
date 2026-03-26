package ui

import (
	"fmt"
	"strings"

	"github.com/rivo/tview"
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
