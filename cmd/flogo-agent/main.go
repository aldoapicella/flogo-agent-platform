package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/evals"
	"github.com/aldoapicella/flogo-agent-platform/internal/knowledge"
	"github.com/aldoapicella/flogo-agent-platform/internal/reporting"
	agentruntime "github.com/aldoapicella/flogo-agent-platform/internal/runtime"
	"github.com/aldoapicella/flogo-agent-platform/internal/sandbox"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
	"github.com/aldoapicella/flogo-agent-platform/internal/tools"
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
	var benchRoot string
	var sandboxProfile string
	var sandboxImage string
	var sandboxRuntime string
	var sandboxNetwork string
	var daemonURL string
	var listenAddr string
	var sessionID string
	var message string
	var rejectionReason string

	root := &cobra.Command{
		Use:   "flogo-agent",
		Short: "Conversational Flogo coding agent",
	}

	root.PersistentFlags().StringVar(&repoPath, "repo", ".", "path to the target Flogo repository")
	root.PersistentFlags().StringVar(&goal, "goal", "Inspect, repair, build, and test the Flogo app", "task goal")
	root.PersistentFlags().StringVar(&mode, "mode", string(contracts.ModeReview), "session mode: review|apply|auto")
	root.PersistentFlags().StringVar(&stateDir, "state-dir", "", "state directory for artifacts, knowledge, and sessions")
	root.PersistentFlags().StringVar(&sources, "sources", "", "path to the knowledge manifest")
	root.PersistentFlags().StringVar(&benchRoot, "bench-root", filepath.Join("testdata", "benchmarks"), "path to benchmark fixtures")
	root.PersistentFlags().StringVar(&sandboxProfile, "sandbox", string(contracts.SandboxProfileLocal), "sandbox profile: local|isolated")
	root.PersistentFlags().StringVar(&sandboxImage, "sandbox-image", "", "container image to use for the isolated sandbox")
	root.PersistentFlags().StringVar(&sandboxRuntime, "sandbox-runtime", "", "container runtime to use for the isolated sandbox")
	root.PersistentFlags().StringVar(&sandboxNetwork, "sandbox-network", "bridge", "network mode for isolated sandbox execution")
	root.PersistentFlags().StringVar(&daemonURL, "daemon-url", "http://127.0.0.1:7777", "local daemon base URL")
	root.PersistentFlags().StringVar(&listenAddr, "listen", "127.0.0.1:7777", "daemon listen address")
	root.PersistentFlags().StringVar(&sessionID, "session", "", "existing session identifier")
	root.PersistentFlags().StringVar(&message, "message", "", "single message to send in chat mode")
	root.PersistentFlags().StringVar(&rejectionReason, "reason", "", "optional rejection reason")

	root.AddCommand(&cobra.Command{
		Use:   "daemon",
		Short: "Run the local session daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDaemon(listenAddr, stateDir, sources, buildSandboxConfig(sandboxProfile, sandboxImage, sandboxRuntime, sandboxNetwork))
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "chat",
		Short: "Create or resume a conversational Flogo session",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runChat(daemonURL, repoPath, goal, mode, stateDir, sources, sessionID, message, buildSandboxConfig(sandboxProfile, sandboxImage, sandboxRuntime, sandboxNetwork))
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "tui",
		Short: "Launch the terminal UI against the local daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			client := agentruntime.NewClient(daemonURL)
			if err := client.Health(context.Background()); err != nil {
				return err
			}
			return ui.New(client).Run(context.Background(), repoPath, goal, contracts.SessionMode(mode), stateDir, sources, buildSandboxConfig(sandboxProfile, sandboxImage, sandboxRuntime, sandboxNetwork), sessionID)
		},
	})

	sessionCmd := &cobra.Command{
		Use:   "session",
		Short: "Inspect or control persisted chat sessions",
	}
	root.AddCommand(sessionCmd)

	sessionCmd.AddCommand(&cobra.Command{
		Use:   "list",
		Short: "List persisted sessions",
		RunE: func(cmd *cobra.Command, args []string) error {
			client := agentruntime.NewClient(daemonURL)
			items, err := client.ListSessions(context.Background())
			if err != nil {
				return err
			}
			payload, err := json.MarshalIndent(items, "", "  ")
			if err != nil {
				return err
			}
			fmt.Println(string(payload))
			return nil
		},
	})

	sessionCmd.AddCommand(&cobra.Command{
		Use:   "show <id>",
		Short: "Show a session snapshot",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client := agentruntime.NewClient(daemonURL)
			snapshot, err := client.GetSession(context.Background(), args[0])
			if err != nil {
				return err
			}
			fmt.Println(renderSession(snapshot))
			return nil
		},
	})

	sessionCmd.AddCommand(&cobra.Command{
		Use:   "approve <id>",
		Short: "Approve the current pending patch",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client := agentruntime.NewClient(daemonURL)
			snapshot, err := client.Approve(context.Background(), args[0])
			if err != nil {
				return err
			}
			fmt.Println(renderSession(snapshot))
			return nil
		},
	})

	sessionCmd.AddCommand(&cobra.Command{
		Use:   "reject <id>",
		Short: "Reject the current pending patch",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client := agentruntime.NewClient(daemonURL)
			snapshot, err := client.Reject(context.Background(), args[0], rejectionReason)
			if err != nil {
				return err
			}
			fmt.Println(renderSession(snapshot))
			return nil
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "run",
		Short: "Run one non-interactive compatibility session",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSession(repoPath, goal, mode, stateDir, sources, buildSandboxConfig(sandboxProfile, sandboxImage, sandboxRuntime, sandboxNetwork))
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

	root.AddCommand(&cobra.Command{
		Use:   "benchmark",
		Short: "Run benchmark fixtures and print a summary",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := context.Background()
			rootDir := mustRepoRoot()
			if stateDir == "" {
				stateDir = filepath.Join(rootDir, ".flogo-agent")
			}
			summary, err := evals.RunBenchmarks(ctx, rootDir, stateDir, resolveSources(sources), benchRoot, contracts.SessionMode(mode))
			if err != nil {
				return err
			}
			encoded, err := json.MarshalIndent(summary, "", "  ")
			if err != nil {
				return err
			}
			fmt.Println(string(encoded))
			return nil
		},
	})

	repoCmd := &cobra.Command{
		Use:   "repo",
		Short: "Run forge-agnostic local git operations",
	}
	root.AddCommand(repoCmd)

	repoCmd.AddCommand(&cobra.Command{
		Use:   "status",
		Short: "Print git status --short",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runGitStatus(repoPath, stateDir)
		},
	})

	var staged bool
	diffCmd := &cobra.Command{
		Use:   "diff",
		Short: "Print git diff",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runGitDiff(repoPath, stateDir, staged)
		},
	}
	diffCmd.Flags().BoolVar(&staged, "staged", false, "show staged changes")
	repoCmd.AddCommand(diffCmd)

	var checkout bool
	branchCmd := &cobra.Command{
		Use:   "branch <name>",
		Short: "Create a local git branch",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runGitCreateBranch(repoPath, stateDir, args[0], checkout)
		},
	}
	branchCmd.Flags().BoolVar(&checkout, "checkout", true, "switch to the created branch")
	repoCmd.AddCommand(branchCmd)

	var commitMessage string
	commitCmd := &cobra.Command{
		Use:   "commit",
		Short: "Stage and commit local changes",
		RunE: func(cmd *cobra.Command, args []string) error {
			if strings.TrimSpace(commitMessage) == "" {
				return fmt.Errorf("--message is required")
			}
			return runGitCommit(repoPath, stateDir, commitMessage)
		},
	}
	commitCmd.Flags().StringVarP(&commitMessage, "message", "m", "", "commit message")
	repoCmd.AddCommand(commitCmd)

	return root
}

func runDaemon(listenAddr string, stateDir string, sources string, sandboxConfig sandbox.Config) error {
	ctx := context.Background()
	manager, err := agentruntime.NewManager(ctx, mustRepoRoot(), stateDir, resolveSources(sources), agentruntime.Options{
		ServiceOptions: session.Options{Sandbox: sandboxConfig},
	})
	if err != nil {
		return err
	}
	defer manager.Close()

	server := agentruntime.NewServer(listenAddr, manager)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	fmt.Printf("Flogo agent daemon listening on http://%s\n", listenAddr)

	select {
	case sig := <-stop:
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		fmt.Printf("Received %s, shutting down daemon\n", sig)
		return nil
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func runChat(daemonURL string, repoPath string, goal string, mode string, stateDir string, sources string, sessionID string, message string, sandboxConfig sandbox.Config) error {
	ctx := context.Background()
	client := agentruntime.NewClient(daemonURL)
	if err := client.Health(ctx); err != nil {
		return err
	}

	var snapshot *contracts.SessionSnapshot
	var err error
	if strings.TrimSpace(sessionID) == "" {
		snapshot, err = client.CreateSession(ctx, contracts.SessionRequest{
			RepoPath: repoPath,
			Goal:     goal,
			Mode:     contracts.SessionMode(mode),
			ApprovalPolicy: contracts.ApprovalPolicy{
				RequireWriteApproval: contracts.SessionMode(mode) == contracts.ModeReview,
			},
			Sandbox:         contracts.SandboxConfig(sandboxConfig),
			StateDir:        stateDir,
			SourcesManifest: sources,
		})
		if err != nil {
			return err
		}
		fmt.Printf("Session: %s\n", snapshot.ID)
	} else {
		snapshot, err = client.GetSession(ctx, sessionID)
		if err != nil {
			return err
		}
	}

	if strings.TrimSpace(message) != "" {
		snapshot, err = client.SendMessage(ctx, snapshot.ID, message)
		if err != nil {
			return err
		}
		fmt.Println(renderLatestAssistant(snapshot))
		return nil
	}

	return interactiveChat(ctx, client, snapshot)
}

func interactiveChat(ctx context.Context, client *agentruntime.Client, snapshot *contracts.SessionSnapshot) error {
	reader := bufio.NewScanner(os.Stdin)
	fmt.Println(renderSessionHeader(snapshot))
	for {
		fmt.Print("flogo> ")
		if !reader.Scan() {
			if err := reader.Err(); err != nil {
				return err
			}
			return nil
		}
		line := strings.TrimSpace(reader.Text())
		if line == "" {
			continue
		}
		if line == "/exit" || line == "/quit" {
			return nil
		}

		var err error
		switch line {
		case "/approve":
			snapshot, err = client.Approve(ctx, snapshot.ID)
		case "/reject":
			snapshot, err = client.Reject(ctx, snapshot.ID, "")
		default:
			snapshot, err = client.SendMessage(ctx, snapshot.ID, line)
		}
		if err != nil {
			return err
		}
		fmt.Println(renderLatestAssistant(snapshot))
	}
}

func runSession(repoPath string, goal string, mode string, stateDir string, sources string, sandboxConfig sandbox.Config) error {
	ctx := context.Background()
	if err := session.EnsureRepoPath(repoPath); err != nil {
		return err
	}
	service, err := session.NewServiceWithOptions(ctx, mustRepoRoot(), stateDir, resolveSources(sources), session.Options{
		Sandbox: sandboxConfig,
	})
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
		Sandbox:         contracts.SandboxConfig(sandboxConfig),
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

func buildSandboxConfig(profile string, image string, runtime string, network string) sandbox.Config {
	config := sandbox.DefaultConfig()
	if profile != "" {
		config.Profile = contracts.SandboxProfile(profile)
	}
	if image != "" {
		config.Image = image
	}
	if runtime != "" {
		config.Runtime = runtime
	}
	if network != "" {
		config.Network = network
	}
	return config
}

func runGitStatus(repoPath string, stateDir string) error {
	result, err := newGitClient(stateDir).Status(context.Background(), repoPath)
	if err != nil {
		return err
	}
	return printToolResult(result)
}

func runGitDiff(repoPath string, stateDir string, staged bool) error {
	result, err := newGitClient(stateDir).Diff(context.Background(), repoPath, staged)
	if err != nil {
		return err
	}
	return printToolResult(result)
}

func runGitCreateBranch(repoPath string, stateDir string, branch string, checkout bool) error {
	result, err := newGitClient(stateDir).CreateBranch(context.Background(), repoPath, branch, checkout)
	if err != nil {
		return err
	}
	return printToolResult(result)
}

func runGitCommit(repoPath string, stateDir string, message string) error {
	result, err := newGitClient(stateDir).CommitAll(context.Background(), repoPath, message)
	if err != nil {
		return err
	}
	return printToolResult(result)
}

func newGitClient(stateDir string) *tools.GitClient {
	rootDir := mustRepoRoot()
	if stateDir == "" {
		stateDir = filepath.Join(rootDir, ".flogo-agent")
	}
	return tools.NewGitClient(sandbox.NewLocalRunner(filepath.Join(stateDir, "artifacts")))
}

func printToolResult(result contracts.ToolResult) error {
	if result.StdoutPath != "" {
		if stdout, err := os.ReadFile(result.StdoutPath); err == nil && len(stdout) > 0 {
			fmt.Print(string(stdout))
		}
	}
	if result.StderrPath != "" {
		if stderr, err := os.ReadFile(result.StderrPath); err == nil && len(stderr) > 0 {
			fmt.Fprint(os.Stderr, string(stderr))
		}
	}
	if result.ExitCode != 0 {
		if result.Error != "" {
			return fmt.Errorf("%s", result.Error)
		}
		return fmt.Errorf("%s exited with code %d", result.Command, result.ExitCode)
	}
	return nil
}

func renderLatestAssistant(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return "no session"
	}
	for idx := len(snapshot.Messages) - 1; idx >= 0; idx-- {
		message := snapshot.Messages[idx]
		if message.Role == contracts.RoleAssistant {
			return message.Content
		}
	}
	return renderSession(snapshot)
}

func renderSession(snapshot *contracts.SessionSnapshot) string {
	if snapshot == nil {
		return "no session"
	}
	var builder strings.Builder
	builder.WriteString(renderSessionHeader(snapshot))
	builder.WriteByte('\n')
	for _, message := range snapshot.Messages {
		builder.WriteString(fmt.Sprintf("%s: %s\n", strings.ToUpper(string(message.Role)), message.Content))
	}
	if snapshot.LastTurnPlan != nil {
		builder.WriteString("\nLast turn:\n")
		builder.WriteString(fmt.Sprintf("- Planner: %s\n", snapshot.LastTurnPlan.Planner))
		builder.WriteString(fmt.Sprintf("- Goal: %s\n", snapshot.LastTurnPlan.GoalSummary))
		if snapshot.LastTurnKind != "" {
			builder.WriteString(fmt.Sprintf("- Kind: %s\n", snapshot.LastTurnKind))
		}
	}
	if len(snapshot.LastStepResults) > 0 {
		builder.WriteString("\nStep results:\n")
		for _, result := range snapshot.LastStepResults {
			builder.WriteString(fmt.Sprintf("- [%s] %s: %s\n", result.Status, result.Type, result.Summary))
		}
	}
	if snapshot.PendingApproval != nil && snapshot.PendingApproval.PatchPlan != nil && strings.TrimSpace(snapshot.PendingApproval.PatchPlan.UnifiedDiff) != "" {
		builder.WriteString("\nDiff:\n")
		builder.WriteString(snapshot.PendingApproval.PatchPlan.UnifiedDiff)
	}
	if len(snapshot.Plan) > 0 {
		builder.WriteString("\nPlan:\n")
		for _, item := range snapshot.Plan {
			builder.WriteString(fmt.Sprintf("- [%s] %s", item.Status, item.Title))
			if item.Details != "" {
				builder.WriteString(": " + item.Details)
			}
			builder.WriteByte('\n')
		}
	}
	if snapshot.LastReport != nil {
		builder.WriteString("\nReport:\n")
		builder.WriteString(reporting.FormatReport(snapshot.LastReport))
		builder.WriteByte('\n')
	}
	return strings.TrimSpace(builder.String())
}

func renderSessionHeader(snapshot *contracts.SessionSnapshot) string {
	return fmt.Sprintf("Session %s | status=%s | repo=%s", snapshot.ID, snapshot.Status, snapshot.RepoPath)
}
