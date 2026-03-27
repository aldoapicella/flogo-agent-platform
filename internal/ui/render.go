package ui

import (
	"fmt"
	"strings"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

const (
	headerHeight        = 2
	bannerHeight        = 2
	actionsHeight       = 1
	composerHeight      = 3
	maxFocusedDiffWidth = 64
)

func newTopBar() *tview.TextView {
	return tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(false)
}

func newBanner() *tview.TextView {
	return tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(true)
}

func newTranscriptView() *tview.TextView {
	view := tview.NewTextView().
		SetDynamicColors(true).
		SetScrollable(true).
		SetWrap(true)
	view.SetBorder(true).SetTitle("Conversation")
	return view
}

func newSideView() *tview.TextView {
	view := tview.NewTextView().
		SetDynamicColors(true).
		SetScrollable(true).
		SetWrap(true)
	view.SetBorder(true).SetTitle("Context")
	return view
}

func newActionsView() *tview.TextView {
	return tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(false)
}

func newComposer() *tview.InputField {
	composer := tview.NewInputField().
		SetLabel("> ").
		SetFieldWidth(0)
	composer.SetBorder(true).SetTitle("Message")
	return composer
}

func buildMainLayout(topBar *tview.TextView, bannerView *tview.TextView, transcriptView *tview.TextView, sideView *tview.TextView, actionsView *tview.TextView, composer *tview.InputField, sideMode string) *tview.Flex {
	transcriptRatio := 4
	sideRatio := 3
	if sideMode == "diff" {
		transcriptRatio = 2
		sideRatio = 5
	}
	return tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(topBar, headerHeight, 0, false).
		AddItem(bannerView, bannerHeight, 0, false).
		AddItem(
			tview.NewFlex().
				AddItem(transcriptView, 0, transcriptRatio, false).
				AddItem(sideView, 0, sideRatio, false),
			0, 1, false,
		).
		AddItem(actionsView, actionsHeight, 0, false).
		AddItem(composer, composerHeight, 0, true)
}

func renderTopBar(view *tview.TextView, state renderState) {
	view.Clear()
	status := styledSessionStatus(state.Current)
	sessionID := "connecting"
	if state.Current != nil {
		sessionID = shortSessionID(state.Current.ID)
	}

	line1 := fmt.Sprintf("%s  [white::b]Repo[-] %s  [white::b]Mode[-] %s  [white::b]View[-] %s",
		status,
		filepathBase(state.RepoPath),
		strings.ToUpper(string(state.Mode)),
		strings.ToUpper(state.SideMode),
	)
	line2 := fmt.Sprintf("[white::b]Session[-] %s  [white::b]Connection[-] %s",
		sessionID,
		strings.ToUpper(state.ConnectionStatus),
	)
	if outcome := latestOutcomeLabel(state.Current); outcome != "" {
		line2 += "  [white::b]Run[-] " + outcome
	}
	if state.Current != nil && state.Current.PendingApproval != nil {
		line2 += "  [black:yellow::b] APPROVAL PENDING [-:-:-]"
	}
	if state.StatusError != "" {
		line2 += "  [white:red::b] ERROR [-:-:-] " + state.StatusError
	}
	fmt.Fprintf(view, "%s\n%s", line1, line2)
}

func renderBanner(view *tview.TextView, state renderState) {
	view.Clear()
	switch {
	case state.ActiveOverlay == "sessions":
		fmt.Fprint(view, "[black:blue::b] SESSION PICKER [-:-:-] Choose a saved session. Use Up/Down to move, Enter to load, Esc to close.")
	case state.Current == nil:
		fmt.Fprint(view, "[black:blue::b] STARTING [-:-:-] Connecting to the local daemon and restoring the latest repo session.")
	case state.Current.PendingApproval != nil:
		fmt.Fprintf(view, "[black:yellow::b] REVIEW REQUIRED [-:-:-] %s Approve with Ctrl+A or reject with Ctrl+R.", state.Current.PendingApproval.Summary)
	case state.Current.LastTurnKind == "inspection":
		fmt.Fprintf(view, "[black:blue::b] INSPECTION [-:-:-] %s", nextActionText(state.Current))
	case state.Current.LastReport != nil:
		fmt.Fprintf(view, "%s %s", styledOutcomeLabel(state.Current.LastReport.Outcome), nextActionText(state.Current))
	default:
		next := nextActionText(state.Current)
		fmt.Fprintf(view, "[black:green::b] READY [-:-:-] %s", next)
	}
}

func renderTranscript(view *tview.TextView, state renderState) {
	view.Clear()
	if state.Current == nil {
		fmt.Fprintln(view, "[blue::b]Restoring the latest repo session[-]")
		fmt.Fprintln(view)
		fmt.Fprintln(view, "[white::b]> resolve repo path[-]")
		fmt.Fprintln(view, "[gray]- connect local daemon[-]")
		fmt.Fprintln(view, "[gray]- restore latest session[-]")
		fmt.Fprintln(view)
		fmt.Fprintln(view, "[gray]The conversation will appear here as soon as the session is ready.[-]")
		view.ScrollToBeginning()
		return
	}

	assistantCount := 0
	for _, item := range state.Current.Messages {
		roleLabel := "[white]System[-]"
		switch item.Role {
		case contracts.RoleUser:
			roleLabel = "[blue::b]You[-]"
		case contracts.RoleAssistant:
			roleLabel = "[green::b]Agent[-]"
			assistantCount++
		}
		fmt.Fprintf(view, "%s\n%s\n\n", roleLabel, item.Content)
	}
	if assistantCount == 0 {
		fmt.Fprintln(view, "[gray]Type your first request below. Example: repair and verify the app[-]")
	}
	view.ScrollToEnd()
}

func renderActions(view *tview.TextView, state renderState) {
	view.Clear()
	switch {
	case state.ActiveOverlay == "sessions":
		fmt.Fprint(view, "[white::b]Up/Down[-] move   [white::b]Enter[-] load   [white::b]Esc[-] close")
	case state.Current == nil:
		fmt.Fprint(view, "[white::b]Please wait[-] restoring the session...")
	case state.Current.PendingApproval != nil && state.SideMode == "diff":
		fmt.Fprint(view, "[green::b]Ctrl+A[-] approve   [red::b]Ctrl+R[-] reject   [white::b]Ctrl+P[-] summary   [white::b]Ctrl+U[-] undo")
	case state.Current.PendingApproval != nil:
		fmt.Fprint(view, "[green::b]Ctrl+A[-] approve   [red::b]Ctrl+R[-] reject   [white::b]Ctrl+D[-] review patch   [white::b]Ctrl+U[-] undo")
	default:
		fmt.Fprint(view, "[white::b]Enter[-] send   [white::b]Ctrl+O[-] sessions   [white::b]Ctrl+D[-] diff   [white::b]Ctrl+L[-] refresh")
	}
}

func renderSide(view *tview.TextView, snapshot *contracts.SessionSnapshot, sideMode string) {
	view.Clear()
	if snapshot == nil {
		view.SetTitle("Startup")
		view.SetWrap(true)
		fmt.Fprintln(view, "[::b]What Happens Next[-]")
		fmt.Fprintln(view, wrapTextBlock("The app is resolving the repo path, connecting to the local daemon, and restoring the most recent session.", 38, ""))
		fmt.Fprintln(view)
		fmt.Fprintln(view, "[::b]While You Wait[-]")
		fmt.Fprintln(view, wrapTextBlock("Once restore completes, the latest conversation and current approval state will appear automatically.", 38, ""))
		return
	}

	if sideMode == "diff" {
		view.SetTitle("Patch Review")
		view.SetWrap(false)
		fmt.Fprint(view, renderDiffContext(snapshot))
		return
	}

	view.SetTitle("Context")
	view.SetWrap(true)
	fmt.Fprint(view, renderSummaryContext(snapshot))
}

func renderSummaryContext(snapshot *contracts.SessionSnapshot) string {
	var builder strings.Builder

	builder.WriteString("[::b]NEXT ACTION[-]\n")
	builder.WriteString(wrapTextBlock(nextActionText(renderState{Current: snapshot}), 38, ""))

	if snapshot.LastTurnPlan != nil {
		builder.WriteString("\n\n[::b]CURRENT TURN[-]\n")
		builder.WriteString(wrapTextBlock(snapshot.LastTurnPlan.GoalSummary, 38, ""))
		var meta []string
		if snapshot.LastTurnPlan.Planner != "" {
			meta = append(meta, "planner "+snapshot.LastTurnPlan.Planner)
		}
		if snapshot.LastTurnKind != "" {
			meta = append(meta, "kind "+snapshot.LastTurnKind)
		}
		if len(meta) > 0 {
			builder.WriteString("\n" + strings.Join(meta, "   "))
		}
		if len(snapshot.LastStepResults) > 0 {
			builder.WriteString("\nRecent:\n")
			for idx, result := range snapshot.LastStepResults {
				if idx >= 2 {
					break
				}
				builder.WriteString(fmt.Sprintf("- %s\n", wrapTextBlock(result.Summary, 34, "  ")))
			}
		}
	}

	if len(snapshot.Plan) > 0 {
		builder.WriteString("\n\n[::b]PLAN[-]\n")
		for idx, item := range snapshot.Plan {
			if idx >= 3 {
				break
			}
			builder.WriteString(fmt.Sprintf("%s %s\n", planStatusBadge(item.Status), item.Title))
		}
	}

	if snapshot.LastReport != nil {
		builder.WriteString("\n\n[::b]LATEST REPORT[-]\n")
		builder.WriteString(compactReport(snapshot.LastReport))
	}

	return strings.TrimSpace(builder.String())
}

func renderDiffContext(snapshot *contracts.SessionSnapshot) string {
	var builder strings.Builder
	diff := pendingDiff(snapshot)
	if diff == "" {
		return "No patch diff is available."
	}

	builder.WriteString("[::b]SEMANTIC SUMMARY[-]\n")
	rows := semanticDiffRows(diff)
	if len(rows) > 0 {
		builder.WriteString(formatSemanticDiffRows(rows))
	} else {
		builder.WriteString("Review the focused diff excerpt below before applying the patch.\n")
	}
	builder.WriteString("\n[::b]PATCH STATS[-]\n")
	builder.WriteString(fmt.Sprintf("file: flogo.json\nsemantic changes: %d\nchanged diff lines: %d\n", len(rows), changedDiffLineCount(diff)))
	builder.WriteString("\n[::b]TARGET[-]\n")
	builder.WriteString("flogo.json\n")

	focused := anchoredDiffBlocks(diff)
	if len(focused) > 0 {
		builder.WriteString("\n[::b]CHANGE LOCATIONS[-]\n")
		for idx, block := range focused {
			builder.WriteString(fmt.Sprintf("%d) %s\n", idx+1, truncateVisualLine(block.Anchor, maxFocusedDiffWidth)))
			for _, line := range block.Lines {
				builder.WriteString("   " + truncateVisualLine(line, maxFocusedDiffWidth-3) + "\n")
			}
			if idx < len(focused)-1 {
				builder.WriteByte('\n')
			}
		}
	} else {
		builder.WriteString("\n[::b]PATCH EXCERPT[-]\n")
		for _, line := range focusedDiffLines(diff, 10) {
			builder.WriteString(truncateVisualLine(line, maxFocusedDiffWidth) + "\n")
		}
	}

	return strings.TrimSpace(builder.String())
}

func styledSessionStatus(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return "[black:blue::b] CONNECTING [-:-:-]"
	}
	switch snapshot.Status {
	case contracts.SessionStatusWaitingApproval:
		return "[black:yellow::b] WAITING APPROVAL [-:-:-]"
	case contracts.SessionStatusBlocked:
		return "[white:red::b] BLOCKED [-:-:-]"
	case contracts.SessionStatusCompleted:
		return "[black:green::b] COMPLETE [-:-:-]"
	default:
		return "[black:green::b] ACTIVE [-:-:-]"
	}
}

func nextActionText(state any) string {
	var snapshot *contracts.SessionSnapshot
	switch value := state.(type) {
	case renderState:
		snapshot = value.Current
	case *contracts.SessionSnapshot:
		snapshot = value
	}
	if snapshot == nil {
		return "Starting the local session."
	}
	if snapshot.PendingApproval != nil {
		return "Review the patch and decide whether to approve or reject it."
	}
	if observationNext := latestObservationSummary(snapshot, "local_test_plan"); observationNext != "" {
		return observationNext
	}
	if snapshot.LastTurnKind == "inspection" {
		if observationNext := latestObservationSummary(snapshot, "rest_endpoint", "binary", "test_support"); observationNext != "" {
			return observationNext
		}
	}
	if snapshot.LastReport != nil && strings.TrimSpace(snapshot.LastReport.NextAction) != "" {
		return snapshot.LastReport.NextAction
	}
	return "Send another request, review the latest context, or open a saved session."
}

func latestObservationSummary(snapshot *contracts.SessionSnapshot, kinds ...string) string {
	if snapshot == nil || len(snapshot.LastStepResults) == 0 {
		return ""
	}
	allowed := make(map[string]struct{}, len(kinds))
	for _, kind := range kinds {
		allowed[kind] = struct{}{}
	}
	for idx := len(snapshot.LastStepResults) - 1; idx >= 0; idx-- {
		for _, observation := range snapshot.LastStepResults[idx].Observations {
			if len(allowed) > 0 {
				if _, ok := allowed[observation.Kind]; !ok {
					continue
				}
			}
			if strings.TrimSpace(observation.Summary) != "" {
				return observation.Summary
			}
		}
	}
	return ""
}

func compactReport(report *contracts.RunReport) string {
	if report == nil {
		return ""
	}
	var lines []string
	lines = append(lines, fmt.Sprintf("Outcome: %s", strings.ToUpper(string(report.Outcome))))
	if report.Evidence.ValidationResult.Passed {
		lines = append(lines, "Validation: passing")
	}
	if report.Evidence.BuildResult != nil {
		if report.Evidence.BuildResult.ExitCode == 0 {
			lines = append(lines, "Build: passed")
		} else {
			lines = append(lines, fmt.Sprintf("Build: failed (%d)", report.Evidence.BuildResult.ExitCode))
		}
	}
	if len(report.Evidence.TestResults) > 0 {
		lines = append(lines, "Tests:")
		for _, test := range report.Evidence.TestResults {
			switch {
			case test.Skipped && test.SkipReason != "":
				lines = append(lines, fmt.Sprintf("  - %s skipped: %s", test.Name, test.SkipReason))
			case test.Skipped:
				lines = append(lines, fmt.Sprintf("  - %s skipped", test.Name))
			case test.Passed:
				lines = append(lines, fmt.Sprintf("  - %s passed", test.Name))
			default:
				lines = append(lines, fmt.Sprintf("  - %s failed (%d)", test.Name, test.Result.ExitCode))
			}
		}
	}
	if len(report.Messages) > 0 {
		lines = append(lines, "Notes:")
		for idx, message := range report.Messages {
			if idx >= 2 {
				break
			}
			lines = append(lines, "  - "+wrapTextBlock(message, 34, "    "))
		}
	}
	return strings.Join(lines, "\n")
}

func pendingDiff(snapshot *contracts.SessionSnapshot) string {
	switch {
	case snapshot == nil:
		return ""
	case snapshot.PendingApproval != nil && snapshot.PendingApproval.PatchPlan != nil:
		return strings.TrimSpace(snapshot.PendingApproval.PatchPlan.UnifiedDiff)
	case snapshot.LastReport != nil && snapshot.LastReport.PatchPlan != nil:
		return strings.TrimSpace(snapshot.LastReport.PatchPlan.UnifiedDiff)
	default:
		return ""
	}
}

func focusedDiffLines(unifiedDiff string, limit int) []string {
	if limit <= 0 {
		limit = 10
	}
	lines := strings.Split(unifiedDiff, "\n")
	selected := make([]string, 0, limit)
	for _, line := range lines {
		if strings.HasPrefix(line, "---") || strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "@@") {
			continue
		}
		if !strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "-") {
			continue
		}
		trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(line, "+"), "-"))
		if trimmed == "" || trimmed == "{" || trimmed == "}" || trimmed == "," || trimmed == "}," {
			continue
		}
		selected = append(selected, shortenSemanticDiffLine(line))
		if len(selected) >= limit {
			break
		}
	}
	if len(selected) == 0 {
		return []string{"No focused diff lines are available."}
	}
	return selected
}

type anchoredDiffBlock struct {
	Anchor string
	Lines  []string
}

type semanticDiffRow struct {
	Label  string
	Path   string
	Before string
	After  string
}

func anchoredDiffBlocks(unifiedDiff string) []anchoredDiffBlock {
	rows := semanticDiffRows(unifiedDiff)
	if len(rows) == 0 {
		return nil
	}
	out := make([]anchoredDiffBlock, 0, len(rows))
	for _, row := range rows {
		lines := make([]string, 0, 2)
		if row.Before != "" {
			lines = append(lines, "before: "+row.Before)
		}
		if row.After != "" {
			lines = append(lines, "after:  "+row.After)
		}
		out = append(out, anchoredDiffBlock{Anchor: row.Path, Lines: lines})
	}
	return out
}

func semanticDiffRows(unifiedDiff string) []semanticDiffRow {
	lines := strings.Split(unifiedDiff, "\n")
	rows := map[string]*semanticDiffRow{}
	order := make([]string, 0, 4)

	record := func(field, before, after string) {
		row, ok := rows[field]
		if !ok {
			row = &semanticDiffRow{Label: semanticLabel(field), Path: field}
			rows[field] = row
			order = append(order, field)
		}
		if before != "" {
			row.Before = before
		}
		if after != "" {
			row.After = after
		}
	}

	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		prefix := line[0]
		if prefix != '+' && prefix != '-' {
			continue
		}
		field, value := semanticFieldValue(strings.TrimSpace(line[1:]))
		if field == "" {
			continue
		}
		if prefix == '-' {
			record(field, value, "")
		} else {
			record(field, "", value)
		}
	}

	out := make([]semanticDiffRow, 0, len(order))
	for _, field := range order {
		out = append(out, *rows[field])
	}
	return out
}

func shortenSemanticDiffLine(line string) string {
	prefix := ""
	switch {
	case strings.HasPrefix(line, "+"):
		prefix = "+"
	case strings.HasPrefix(line, "-"):
		prefix = "-"
	default:
		return strings.TrimSpace(line)
	}
	trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(line, "+"), "-"))
	if field, value := semanticFieldValue(trimmed); field != "" {
		return prefix + " " + semanticLabel(field) + ": " + value
	}
	return prefix + " " + trimmed
}

func extractQuotedValue(text string) string {
	parts := strings.Split(text, `"`)
	if len(parts) >= 4 {
		return parts[3]
	}
	return text
}

func truncateVisualLine(line string, limit int) string {
	if limit <= 0 {
		return line
	}
	runes := []rune(line)
	if len(runes) <= limit {
		return line
	}
	if limit <= 3 {
		return string(runes[:limit])
	}
	return string(runes[:limit-3]) + "..."
}

func shortSessionID(id string) string {
	id = strings.TrimSpace(id)
	if len(id) <= 24 {
		return id
	}
	if len(id) <= 18 {
		return id
	}
	return id[:10] + "..." + id[len(id)-6:]
}

func filepathBase(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return "."
	}
	parts := strings.Split(strings.ReplaceAll(path, "\\", "/"), "/")
	if len(parts) == 0 {
		return path
	}
	last := parts[len(parts)-1]
	if last == "" && len(parts) > 1 {
		return parts[len(parts)-2]
	}
	if last == "" {
		return path
	}
	return last
}

func wrapTextBlock(text string, width int, indent string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if width <= 0 {
		return text
	}
	words := strings.Fields(text)
	if len(words) == 0 {
		return text
	}
	var lines []string
	current := words[0]
	for _, word := range words[1:] {
		if len([]rune(current))+1+len([]rune(word)) <= width {
			current += " " + word
			continue
		}
		lines = append(lines, current)
		current = indent + word
	}
	lines = append(lines, current)
	return strings.Join(lines, "\n")
}

func buildSessionPicker(sessions []contracts.SessionSnapshot, currentSessionID string, onSelect func(string), onClose func()) tview.Primitive {
	table := tview.NewTable().
		SetSelectable(true, false).
		SetFixed(1, 0)
	table.SetBorder(true).SetTitle("Sessions")
	table.SetSelectedStyle(tcell.StyleDefault.Background(tcell.ColorDarkCyan).Foreground(tcell.ColorWhite))
	table.SetSeparator(' ')

	addCell := func(row, col int, text string, align int, style tcell.Style, maxWidth int) {
		cell := tview.NewTableCell(text).
			SetAlign(align).
			SetSelectable(row > 0).
			SetTextColor(tcell.ColorWhite).
			SetExpansion(1).
			SetStyle(style)
		if maxWidth > 0 {
			cell.SetMaxWidth(maxWidth)
		}
		table.SetCell(row, col, cell)
	}

	headerStyle := tcell.StyleDefault.Foreground(tcell.ColorSilver).Bold(true)
	addCell(0, 0, "SEL", tview.AlignLeft, headerStyle, 8)
	addCell(0, 1, "ID", tview.AlignLeft, headerStyle, 24)
	addCell(0, 2, "STATUS", tview.AlignLeft, headerStyle, 18)
	addCell(0, 3, "UPDATED", tview.AlignLeft, headerStyle, 18)
	addCell(0, 4, "REPO", tview.AlignLeft, headerStyle, 18)

	for idx, item := range sessions {
		row := idx + 1
		marker := ""
		if item.ID == currentSessionID {
			marker = "CURRENT"
		}
		addCell(row, 0, marker, tview.AlignLeft, tcell.StyleDefault, 8)
		addCell(row, 1, shortSessionID(item.ID), tview.AlignLeft, tcell.StyleDefault, 24)
		addCell(row, 2, strings.ToUpper(string(item.Status)), tview.AlignLeft, tcell.StyleDefault, 18)
		addCell(row, 3, compactTimestamp(item.UpdatedAt), tview.AlignLeft, tcell.StyleDefault, 18)
		addCell(row, 4, filepathBase(item.RepoPath), tview.AlignLeft, tcell.StyleDefault, 18)
	}
	if len(sessions) > 0 {
		table.Select(1, 0)
	}
	table.SetSelectedFunc(func(row, column int) {
		if row <= 0 || row-1 >= len(sessions) {
			return
		}
		if onSelect != nil {
			onSelect(sessions[row-1].ID)
		}
	})
	table.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		if event.Key() == tcell.KeyEsc {
			if onClose != nil {
				onClose()
			}
			return nil
		}
		return event
	})

	help := tview.NewTextView().
		SetDynamicColors(true).
		SetWrap(false)
	fmt.Fprint(help, "[white::b]Up/Down[-] move   [white::b]Enter[-] load   [white::b]Esc[-] close")

	return centered(112, 18, tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(table, 0, 1, true).
		AddItem(help, 1, 0, false))
}

func latestOutcomeLabel(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil || snapshot.LastReport == nil {
		return ""
	}
	return strings.ToUpper(string(snapshot.LastReport.Outcome))
}

func styledOutcomeLabel(outcome contracts.RunOutcome) string {
	switch outcome {
	case contracts.RunOutcomeApplied:
		return "[black:green::b] APPLIED [-:-:-]"
	case contracts.RunOutcomeBlocked, contracts.RunOutcomeFailed:
		return "[white:red::b] BLOCKED [-:-:-]"
	default:
		return "[black:blue::b] READY [-:-:-]"
	}
}

func compactTimestamp(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimSuffix(value, "Z")
	value = strings.ReplaceAll(value, "T", " ")
	if len(value) >= 16 {
		return value[:16]
	}
	return value
}

func planStatusBadge(status contracts.PlanItemStatus) string {
	switch status {
	case contracts.PlanItemCompleted:
		return "[DONE]"
	case contracts.PlanItemInProgress:
		return "[NOW ]"
	case contracts.PlanItemBlocked:
		return "[WAIT]"
	default:
		return "[TODO]"
	}
}

func semanticFieldValue(trimmed string) (string, string) {
	switch {
	case strings.Contains(trimmed, `"flowURI"`):
		return "triggers[].handlers[].action.settings.flowURI", extractJSONFieldValue(trimmed, "flowURI")
	case strings.Contains(trimmed, `"message"`):
		return "triggers[].handlers[].action.input.message", extractJSONFieldValue(trimmed, "message")
	case strings.Contains(trimmed, `"id"`):
		return "triggers[].handlers[].action.id", extractJSONFieldValue(trimmed, "id")
	default:
		return "", ""
	}
}

func extractJSONFieldValue(text string, key string) string {
	keyToken := `"` + key + `"`
	start := strings.Index(text, keyToken)
	if start == -1 {
		return strings.TrimSpace(text)
	}
	rest := text[start+len(keyToken):]
	colon := strings.Index(rest, ":")
	if colon == -1 {
		return strings.TrimSpace(text)
	}
	value := strings.TrimSpace(rest[colon+1:])
	value = strings.TrimSuffix(value, ",")
	value = strings.TrimSuffix(value, "}")
	value = strings.TrimSuffix(value, ",")
	value = strings.TrimSpace(value)
	value = strings.Trim(value, `"`)
	if value == "" {
		return "<empty>"
	}
	return value
}

func formatSemanticDiffRows(rows []semanticDiffRow) string {
	var builder strings.Builder
	builder.WriteString("Field             Before             After\n")
	builder.WriteString("----------------  -----------------  -----------------\n")
	for _, row := range rows {
		builder.WriteString(fmt.Sprintf("%-16s  %-17s  %s\n",
			truncateVisualLine(row.Label, 16),
			truncateVisualLine(diffValueOr(row.Before, "added"), 17),
			truncateVisualLine(diffValueOr(row.After, "removed"), 17),
		))
	}
	return builder.String()
}

func diffValueOr(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func semanticLabel(path string) string {
	switch path {
	case "triggers[].handlers[].action.settings.flowURI":
		return "flowURI"
	case "triggers[].handlers[].action.input.message":
		return "input.message"
	case "triggers[].handlers[].action.id":
		return "action.id"
	default:
		return path
	}
}

func changedDiffLineCount(unifiedDiff string) int {
	count := 0
	for _, line := range strings.Split(unifiedDiff, "\n") {
		if strings.HasPrefix(line, "---") || strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "@@") {
			continue
		}
		if strings.HasPrefix(line, "+") || strings.HasPrefix(line, "-") {
			count++
		}
	}
	return count
}
