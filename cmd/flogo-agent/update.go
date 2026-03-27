package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"

	agentruntime "github.com/aldoapicella/flogo-agent-platform/internal/runtime"
	"github.com/aldoapicella/flogo-agent-platform/internal/ui"
	"github.com/aldoapicella/flogo-agent-platform/internal/update"
)

type updateDecision string

const (
	updateDecisionNow      updateDecision = "update"
	updateDecisionSkip     updateDecision = "skip"
	updateDecisionContinue updateDecision = "continue"
)

var promptForUpdateTTY = promptForUpdateTTYImpl
var promptForUpdateUI = ui.PromptForUpdate
var fetchLatestRelease = update.FetchLatest
var loadUpdateState = update.LoadState
var saveUpdateState = update.SaveState
var installManagedReleaseTool = installManagedReleaseToolFromAssetURLs
var scheduleBinaryReplace = scheduleSelfReplace
var installCurrentBinary = installBinary
var executablePath = os.Executable
var shutdownDaemonForUpdate = shutdownLocalDaemon

type latestReleaseResult struct {
	Info  *update.ReleaseInfo
	State update.State
}

func maybeApplyStartupUpdateInteractive(ctx context.Context, opts interactiveOptions) (bool, error) {
	result, err := checkLatestRelease(ctx, false)
	if err != nil || result.Info == nil {
		return false, err
	}
	if !shouldOfferUpdate(result) {
		return false, nil
	}
	decision, err := promptForUpdateUI(*result.Info, version)
	if err != nil {
		return false, err
	}
	return handleUpdateDecision(ctx, decision, result, updateApplyOptions{
		restart:     true,
		restartArgs: os.Args[1:],
		daemonURL:   opts.daemonURL,
		listenAddr:  opts.listenAddr,
	})
}

func maybeApplyStartupUpdateCLI(ctx context.Context, daemonURL string, listenAddr string) (bool, error) {
	result, err := checkLatestRelease(ctx, false)
	if err != nil || result.Info == nil {
		return false, err
	}
	if !shouldOfferUpdate(result) {
		return false, nil
	}
	if !stdioIsTerminal() {
		fmt.Fprintf(os.Stderr, "Update available: %s -> %s (%s)\n", version, result.Info.Version, result.Info.HTMLURL)
		return false, nil
	}
	decision, err := promptForUpdateTTY(*result.Info, version)
	if err != nil {
		return false, err
	}
	return handleUpdateDecision(ctx, decision, result, updateApplyOptions{
		restart:     true,
		restartArgs: os.Args[1:],
		daemonURL:   daemonURL,
		listenAddr:  listenAddr,
	})
}

func runUpdateCheck(ctx context.Context) error {
	result, err := checkLatestRelease(ctx, true)
	if err != nil {
		return err
	}
	if result.Info == nil {
		if version == "dev" {
			fmt.Println("Development build; startup auto-update is disabled.")
			return nil
		}
		fmt.Println("No published release information was found.")
		return nil
	}
	if update.IsUpdateAvailable(version, result.Info.Version) {
		fmt.Printf("Update available: %s -> %s\n", version, result.Info.Version)
	} else {
		fmt.Printf("Up to date: %s\n", version)
	}
	fmt.Printf("Published: %s\n", result.Info.PublishedAt)
	if strings.TrimSpace(result.Info.HTMLURL) != "" {
		fmt.Printf("Release: %s\n", result.Info.HTMLURL)
	}
	body := strings.TrimSpace(result.Info.Body)
	if body != "" {
		fmt.Println()
		fmt.Println(body)
	}
	return nil
}

func runUpdateApply(ctx context.Context) error {
	result, err := checkLatestRelease(ctx, true)
	if err != nil {
		return err
	}
	if result.Info == nil || !update.IsUpdateAvailable(version, result.Info.Version) {
		fmt.Printf("Already up to date at %s\n", version)
		return nil
	}
	_, err = applyReleaseUpdate(ctx, result.Info, updateApplyOptions{})
	return err
}

type updateApplyOptions struct {
	restart     bool
	restartArgs []string
	daemonURL   string
	listenAddr  string
}

func handleUpdateDecision(ctx context.Context, decision string, result latestReleaseResult, opts updateApplyOptions) (bool, error) {
	switch updateDecision(strings.TrimSpace(decision)) {
	case updateDecisionSkip:
		result.State.SkippedVersion = result.Info.Version
		if err := saveUpdateState(result.State); err != nil {
			return false, err
		}
		return false, nil
	case updateDecisionNow:
		return applyReleaseUpdate(ctx, result.Info, opts)
	default:
		return false, nil
	}
}

func checkLatestRelease(ctx context.Context, explicit bool) (latestReleaseResult, error) {
	state, err := loadUpdateState()
	if err != nil {
		return latestReleaseResult{}, err
	}
	state = cloneUpdateState(state)
	if version == "dev" {
		return latestReleaseResult{State: *state}, nil
	}
	info, err := fetchLatestRelease(ctx, releaseRepo)
	nextState := update.MarkChecked(state, info, err)
	if saveErr := saveUpdateState(nextState); saveErr != nil && err == nil {
		err = saveErr
	}
	if err != nil {
		if explicit {
			return latestReleaseResult{}, err
		}
		fmt.Fprintf(os.Stderr, "warning: could not check for updates: %v\n", err)
		return latestReleaseResult{}, nil
	}
	return latestReleaseResult{Info: info, State: nextState}, nil
}

func shouldOfferUpdate(result latestReleaseResult) bool {
	if result.Info == nil {
		return false
	}
	if !update.IsUpdateAvailable(version, result.Info.Version) {
		return false
	}
	return strings.TrimSpace(result.State.SkippedVersion) != strings.TrimSpace(result.Info.Version)
}

func cloneUpdateState(state *update.State) *update.State {
	if state == nil {
		return &update.State{}
	}
	clone := *state
	return &clone
}

func applyReleaseUpdate(ctx context.Context, info *update.ReleaseInfo, opts updateApplyOptions) (bool, error) {
	if info == nil {
		return false, nil
	}
	if strings.TrimSpace(info.Version) == "" {
		return false, fmt.Errorf("release metadata did not include a version")
	}
	checksumAsset, ok := info.Asset(update.ChecksumAssetName)
	if !ok {
		return false, fmt.Errorf("release %s did not include %s", info.Version, update.ChecksumAssetName)
	}
	agentAssetName := update.AssetArchiveName("flogo-agent")
	agentAsset, ok := info.Asset(agentAssetName)
	if !ok {
		return false, fmt.Errorf("release %s did not include %s", info.Version, agentAssetName)
	}

	if shouldRefreshManagedFlogo() {
		flogoAssetName := update.AssetArchiveName("flogo")
		if flogoAsset, ok := info.Asset(flogoAssetName); ok {
			if err := installManagedReleaseTool("flogo", "flogo", info.Version, flogoAsset.URL, checksumAsset.URL); err != nil {
				return false, err
			}
		}
	}

	tempDir, err := os.MkdirTemp("", "flogo-agent-update-*")
	if err != nil {
		return false, err
	}
	archivePath := filepath.Join(tempDir, agentAssetName)
	checksumPath := filepath.Join(tempDir, update.ChecksumAssetName)
	if err := downloadFile(agentAsset.URL, archivePath); err != nil {
		return false, err
	}
	if err := downloadFile(checksumAsset.URL, checksumPath); err != nil {
		return false, err
	}
	if err := verifyChecksum(archivePath, checksumPath, agentAssetName); err != nil {
		return false, err
	}
	extractedPath, err := extractToolArchive(archivePath, tempDir, "flogo-agent")
	if err != nil {
		return false, err
	}
	targetPath, err := executablePath()
	if err != nil {
		return false, err
	}

	if opts.restart && sameBaseURL(opts.daemonURL, "http://"+strings.TrimSpace(opts.listenAddr)) {
		if err := shutdownDaemonForUpdate(ctx, opts.daemonURL); err != nil {
			return false, err
		}
	}

	if opts.restart || runtime.GOOS == "windows" {
		if err := scheduleBinaryReplace(extractedPath, targetPath, opts.restartArgs); err != nil {
			return false, err
		}
		if opts.restart {
			fmt.Printf("Updating to %s and restarting...\n", info.Version)
		} else {
			fmt.Printf("Updating to %s. This process will exit so the new binary can be installed.\n", info.Version)
		}
	} else {
		if err := installCurrentBinary(extractedPath, targetPath); err != nil {
			return false, err
		}
		fmt.Printf("Updated to %s at %s\n", info.Version, targetPath)
	}

	state, stateErr := loadUpdateState()
	if stateErr == nil {
		state.LastAppliedVersion = info.Version
		state.LastAppliedAt = time.Now().UTC().Format(time.RFC3339Nano)
		if state.SkippedVersion == info.Version {
			state.SkippedVersion = ""
		}
		_ = saveUpdateState(*state)
	}
	return true, nil
}

func shouldRefreshManagedFlogo() bool {
	path, ok := resolveAvailableFlogoBinary()
	if !ok {
		return true
	}
	return detectFlogoSource(path) == "managed"
}

func shutdownLocalDaemon(ctx context.Context, daemonURL string) error {
	if strings.TrimSpace(daemonURL) == "" {
		return nil
	}
	client := agentruntime.NewClient(daemonURL)
	if err := client.Health(ctx); err != nil {
		return nil
	}
	if err := client.Shutdown(ctx); err != nil {
		return err
	}
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if err := client.Health(ctx); err != nil {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("daemon at %s did not shut down in time", daemonURL)
}

func promptForUpdateTTYImpl(info update.ReleaseInfo, currentVersion string) (string, error) {
	fmt.Fprintf(os.Stderr, "A new Flogo Agent release is available.\nCurrent: %s\nLatest:  %s\nPublished: %s\n", currentVersion, info.Version, info.PublishedAt)
	if body := strings.TrimSpace(info.Body); body != "" {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, body)
	}
	fmt.Fprint(os.Stderr, "\nUpdate now [u], skip this version [s], or continue [c]? ")
	var response string
	if _, err := fmt.Fscanln(os.Stdin, &response); err != nil && !errors.Is(err, os.ErrClosed) {
		response = ""
	}
	switch strings.ToLower(strings.TrimSpace(response)) {
	case "u", "update", "y", "yes":
		return string(updateDecisionNow), nil
	case "s", "skip":
		return string(updateDecisionSkip), nil
	default:
		return string(updateDecisionContinue), nil
	}
}

func scheduleSelfReplace(sourcePath string, targetPath string, restartArgs []string) error {
	currentExecutable, err := os.Executable()
	if err != nil {
		return err
	}
	helperPath := filepath.Join(filepath.Dir(sourcePath), helperBinaryName())
	if err := copyFile(currentExecutable, helperPath, 0o755); err != nil {
		return err
	}

	args := []string{
		"self-replace",
		"--source", sourcePath,
		"--target", targetPath,
	}
	if len(restartArgs) > 0 {
		payload, err := json.Marshal(restartArgs)
		if err != nil {
			return err
		}
		args = append(args, "--restart-args", base64.StdEncoding.EncodeToString(payload))
	}
	cmd := exec.Command(helperPath, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = os.Environ()
	return cmd.Start()
}

func runSelfReplace(sourcePath string, targetPath string, encodedRestartArgs string) error {
	if strings.TrimSpace(sourcePath) == "" || strings.TrimSpace(targetPath) == "" {
		return fmt.Errorf("self-replace requires --source and --target")
	}
	restartArgs, err := decodeRestartArgs(encodedRestartArgs)
	if err != nil {
		return err
	}
	deadline := time.Now().Add(15 * time.Second)
	for {
		if err := installBinary(sourcePath, targetPath); err == nil {
			break
		} else if time.Now().After(deadline) {
			return err
		}
		time.Sleep(250 * time.Millisecond)
	}
	_ = os.Remove(sourcePath)
	if len(restartArgs) == 0 {
		return nil
	}
	cmd := exec.Command(targetPath, restartArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = os.Environ()
	return cmd.Start()
}

func decodeRestartArgs(encoded string) ([]string, error) {
	encoded = strings.TrimSpace(encoded)
	if encoded == "" {
		return nil, nil
	}
	payload, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	var args []string
	if err := json.Unmarshal(payload, &args); err != nil {
		return nil, err
	}
	return args, nil
}

func installBinary(sourcePath string, targetPath string) error {
	tempPath := targetPath + ".tmp"
	if err := copyFile(sourcePath, tempPath, 0o755); err != nil {
		return err
	}
	if runtime.GOOS == "windows" {
		_ = os.Remove(targetPath)
	}
	return os.Rename(tempPath, targetPath)
}

func copyFile(sourcePath string, targetPath string, mode os.FileMode) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer source.Close()

	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}
	target, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	defer target.Close()
	if _, err := io.Copy(target, source); err != nil {
		return err
	}
	return target.Close()
}

func helperBinaryName() string {
	name := "flogo-agent-self-replace"
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func addUpdateCommands(root *cobra.Command) {
	updateCmd := &cobra.Command{
		Use:   "update",
		Short: "Check for or apply published updates",
	}
	root.AddCommand(updateCmd)

	updateCmd.AddCommand(&cobra.Command{
		Use:   "check",
		Short: "Check whether a newer release is available",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUpdateCheck(context.Background())
		},
	})

	updateCmd.AddCommand(&cobra.Command{
		Use:   "apply",
		Short: "Apply the latest published update immediately",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runUpdateApply(context.Background())
		},
	})

	var sourcePath string
	var targetPath string
	var restartArgs string
	helperCmd := &cobra.Command{
		Use:    "self-replace",
		Short:  "Internal updater helper",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSelfReplace(sourcePath, targetPath, restartArgs)
		},
	}
	helperCmd.Flags().StringVar(&sourcePath, "source", "", "staged replacement binary path")
	helperCmd.Flags().StringVar(&targetPath, "target", "", "installed binary path")
	helperCmd.Flags().StringVar(&restartArgs, "restart-args", "", "base64 encoded restart arguments")
	root.AddCommand(helperCmd)
}
