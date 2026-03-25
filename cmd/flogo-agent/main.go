package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/knowledge"
	"github.com/aldoapicella/flogo-agent-platform/internal/reporting"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
	"github.com/aldoapicella/flogo-agent-platform/internal/ui"
)

func main() {
	if err := newRootCommand().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newRootCommand() *cobra.Command {
	var repoPath string
	var goal string
	var mode string
	var stateDir string
	var sources string

	root := &cobra.Command{
		Use:   "flogo-agent",
		Short: "Terminal-first Flogo agent scaffold",
	}

	root.PersistentFlags().StringVar(&repoPath, "repo", ".", "path to the target Flogo repository")
	root.PersistentFlags().StringVar(&goal, "goal", "Validate and repair flogo.json", "task goal")
	root.PersistentFlags().StringVar(&mode, "mode", string(contracts.ModeReview), "session mode: review|apply|auto")
	root.PersistentFlags().StringVar(&stateDir, "state-dir", "", "state directory for artifacts and knowledge")
	root.PersistentFlags().StringVar(&sources, "sources", "", "path to the knowledge manifest")

	root.AddCommand(&cobra.Command{
		Use:   "run",
		Short: "Run one non-interactive session",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSession(repoPath, goal, mode, stateDir, sources)
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "tui",
		Short: "Launch the tview terminal UI",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := context.Background()
			if err := session.EnsureRepoPath(repoPath); err != nil {
				return err
			}
			service, err := session.NewService(ctx, mustRepoRoot(), stateDir, resolveSources(sources))
			if err != nil {
				return err
			}
			defer service.Close()
			return ui.New(service).Run(ctx, repoPath, goal)
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "index",
		Short: "Ingest knowledge sources into SQLite",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := context.Background()
			rootDir := mustRepoRoot()
			if stateDir == "" {
				stateDir = filepath.Join(rootDir, ".flogo-agent")
			}
			store, err := knowledge.Open(ctx, filepath.Join(stateDir, "knowledge.db"))
			if err != nil {
				return err
			}
			defer store.Close()
			return knowledge.IngestManifest(ctx, rootDir, store, resolveSources(sources))
		},
	})

	return root
}

func runSession(repoPath string, goal string, mode string, stateDir string, sources string) error {
	ctx := context.Background()
	if err := session.EnsureRepoPath(repoPath); err != nil {
		return err
	}
	service, err := session.NewService(ctx, mustRepoRoot(), stateDir, resolveSources(sources))
	if err != nil {
		return err
	}
	defer service.Close()

	report, err := service.Run(ctx, contracts.SessionRequest{
		RepoPath: repoPath,
		Goal:     goal,
		Mode:     contracts.SessionMode(mode),
		ApprovalPolicy: contracts.ApprovalPolicy{
			RequireWriteApproval: contracts.SessionMode(mode) == contracts.ModeReview,
		},
		StateDir:        stateDir,
		SourcesManifest: sources,
	})
	if err != nil {
		return err
	}

	fmt.Println(reporting.FormatReport(report))
	encoded, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(encoded))
	return nil
}

func mustRepoRoot() string {
	root, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	return root
}

func resolveSources(path string) string {
	if path != "" {
		return path
	}
	return filepath.Join(mustRepoRoot(), "docs", "sources", "manifest.json")
}
