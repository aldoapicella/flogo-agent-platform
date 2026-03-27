package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/evals"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
	"github.com/aldoapicella/flogo-agent-platform/internal/ui"
)

func runUIReview(repoPath string, outDir string, width int, height int, reviewModel string) error {
	ctx := context.Background()
	modelClient, err := ensureAgentModelCLI()
	if err != nil {
		return err
	}
	if restarted, err := maybeApplyStartupUpdateCLI(ctx, "", ""); err != nil {
		return err
	} else if restarted {
		return nil
	}

	resolvedRepo, err := resolveRepoPath(repoPath)
	if err != nil {
		return err
	}
	if outDir == "" {
		outDir = filepath.Join(resolvedRepo, ".flogo-agent", "ui-review", time.Now().UTC().Format("20060102-150405"))
	}
	outDir, err = filepath.Abs(outDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}

	captures, err := ui.CaptureScriptedReview(ctx, outDir, resolvedRepo, width, height)
	if err != nil {
		return err
	}

	input, images, err := buildUIReviewInputs(captures)
	if err != nil {
		return err
	}

	report, err := evals.EvaluateUIReview(ctx, modelClient, reviewModel, input, images)
	if err != nil {
		return err
	}

	if err := writeJSON(filepath.Join(outDir, "review-input.json"), input); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(outDir, "review.json"), report); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(outDir, "review.md"), []byte(evals.FormatUIReviewMarkdown(input, report)), 0o644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(outDir, "tasks.md"), []byte(evals.FormatUIReviewTasksMarkdown(report)), 0o644); err != nil {
		return err
	}

	fmt.Printf("UI review completed.\nArtifacts: %s\nReviewer: %s\nTotal score: %d/10\n", outDir, report.Model, report.TotalScore)
	return nil
}

func buildUIReviewInputs(captures []ui.ReviewCapture) (evals.UIReviewInput, []model.ImageInput, error) {
	input := evals.UIReviewInput{
		Scenario: "scripted-terminal-ui-review",
		Captures: make([]evals.UIReviewCapture, 0, len(captures)),
	}
	images := make([]model.ImageInput, 0, len(captures))
	for _, capture := range captures {
		bytes, err := os.ReadFile(capture.Path)
		if err != nil {
			return evals.UIReviewInput{}, nil, err
		}
		input.Captures = append(input.Captures, evals.UIReviewCapture{
			Name:            capture.Name,
			Title:           capture.Title,
			Description:     capture.Description,
			Path:            capture.Path,
			Width:           capture.Width,
			Height:          capture.Height,
			SideMode:        capture.SideMode,
			SessionStatus:   capture.SessionStatus,
			SessionID:       capture.SessionID,
			PendingApproval: capture.PendingApproval,
			ScreenText:      capture.ScreenText,
		})
		images = append(images, model.ImageInput{
			MIMEType: "image/png",
			Data:     bytes,
		})
	}
	return input, images, nil
}

func writeJSON(path string, value any) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o644)
}
