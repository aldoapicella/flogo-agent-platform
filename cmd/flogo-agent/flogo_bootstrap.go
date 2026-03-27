package main

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/config"
	"github.com/aldoapicella/flogo-agent-platform/internal/ui"
	"github.com/aldoapicella/flogo-agent-platform/internal/update"
)

const flogoInstallSource = "github.com/project-flogo/cli/...@latest"
const releaseRepo = "aldoapicella/flogo-agent-platform"

var errFlogoCLIMissing = errors.New("flogo CLI is required for build and test workflows")

var promptForFlogoInstallTTY = promptForFlogoInstallTTYImpl
var promptForFlogoInstallUI = ui.PromptForFlogoCLIInstall
var lookPath = exec.LookPath
var execCommand = exec.Command
var httpClient = &http.Client{Timeout: 60 * time.Second}

func ensureFlogoCLICLI() error {
	return ensureFlogoCLI(false)
}

func ensureFlogoCLIInteractive() error {
	return ensureFlogoCLI(true)
}

func setupFlogoCLI() error {
	if path, ok := resolveAvailableFlogoBinary(); ok {
		return ensureManagedToolRecord(path)
	}
	return installManagedFlogoCLI()
}

func ensureFlogoCLI(interactive bool) error {
	if path, ok := resolveAvailableFlogoBinary(); ok {
		return ensureManagedToolRecord(path)
	}

	var install bool
	var err error
	if interactive {
		install, err = promptForFlogoInstallUI()
	} else {
		if !stdioIsTerminal() {
			return fmt.Errorf("%w; run `flogo-agent setup flogo` or install %s first", errFlogoCLIMissing, flogoInstallSource)
		}
		install, err = promptForFlogoInstallTTY()
	}
	if err != nil {
		return err
	}
	if !install {
		return errFlogoCLIMissing
	}
	return installManagedFlogoCLI()
}

func resolveAvailableFlogoBinary() (string, bool) {
	if err := ensureManagedToolPath(); err != nil {
		return "", false
	}
	path, err := lookPath("flogo")
	if err != nil {
		return "", false
	}
	return path, true
}

func ensureManagedToolPath() error {
	binDir, err := config.ManagedBinDir()
	if err != nil {
		return err
	}
	managedPath, err := config.ManagedToolPath("flogo")
	if err != nil {
		return err
	}
	if info, statErr := os.Stat(managedPath); statErr != nil || info.IsDir() {
		return nil
	}
	pathParts := strings.Split(os.Getenv("PATH"), string(os.PathListSeparator))
	for _, part := range pathParts {
		if samePath(part, binDir) {
			return nil
		}
	}
	if current := os.Getenv("PATH"); current != "" {
		return os.Setenv("PATH", binDir+string(os.PathListSeparator)+current)
	}
	return os.Setenv("PATH", binDir)
}

func installManagedFlogoCLI() error {
	baseURL := releaseBaseURL()
	if baseURL != "" {
		if err := downloadManagedFlogoCLI(baseURL, version); err == nil {
			return nil
		} else if version != "dev" {
			return err
		}
	}
	return installManagedFlogoCLIDeveloperFallback()
}

func installManagedFlogoCLIDeveloperFallback() error {
	if _, err := lookPath("go"); err != nil {
		return fmt.Errorf("%w; automatic install requires the Go toolchain on PATH", errFlogoCLIMissing)
	}
	binDir, err := config.ManagedBinDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		return err
	}
	cmd := execCommand("go", "install", flogoInstallSource)
	cmd.Env = append(os.Environ(), "GOBIN="+binDir)
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	if err := cmd.Run(); err != nil {
		text := strings.TrimSpace(output.String())
		if text == "" {
			return fmt.Errorf("install managed flogo CLI: %w", err)
		}
		return fmt.Errorf("install managed flogo CLI: %w\n%s", err, text)
	}
	if err := ensureManagedToolPath(); err != nil {
		return err
	}
	path, err := config.ManagedToolPath("flogo")
	if err != nil {
		return err
	}
	return config.SaveManagedToolInstall(config.ManagedToolInstall{
		Name:    "flogo",
		Path:    path,
		Source:  "developer-go-install",
		Version: "latest",
	})
}

func downloadManagedFlogoCLI(baseURL string, releaseVersion string) error {
	assetName := update.AssetArchiveName("flogo")
	if assetName == "" {
		return fmt.Errorf("unsupported platform for managed flogo download")
	}
	return installManagedReleaseToolFromAssetURLs("flogo", "flogo", releaseVersion, joinURL(baseURL, assetName), joinURL(baseURL, update.ChecksumAssetName))
}

func ensureManagedToolRecord(path string) error {
	record, err := config.LoadManagedToolInstall("flogo")
	if err != nil {
		return err
	}
	if record != nil && samePath(record.Path, path) {
		return nil
	}
	return config.SaveManagedToolInstall(config.ManagedToolInstall{
		Name:    "flogo",
		Path:    path,
		Source:  detectFlogoSource(path),
		Version: "latest",
	})
}

func promptForFlogoInstallTTYImpl() (bool, error) {
	if !stdioIsTerminal() {
		return false, fmt.Errorf("%w; prompting requires a TTY", errFlogoCLIMissing)
	}
	fmt.Fprint(os.Stderr, "Flogo CLI is required. Install it now? [Y/n]: ")
	response, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && !errors.Is(err, os.ErrClosed) {
		text := strings.TrimSpace(response)
		if text == "" {
			return true, nil
		}
	}
	answer := strings.ToLower(strings.TrimSpace(response))
	return answer == "" || answer == "y" || answer == "yes", nil
}

func samePath(left string, right string) bool {
	if left == "" || right == "" {
		return false
	}
	leftClean, leftErr := filepath.Abs(left)
	rightClean, rightErr := filepath.Abs(right)
	if leftErr != nil || rightErr != nil {
		return strings.TrimSpace(left) == strings.TrimSpace(right)
	}
	return leftClean == rightClean
}

func detectFlogoSource(path string) string {
	managedPath, err := config.ManagedToolPath("flogo")
	if err == nil && samePath(path, managedPath) {
		return "managed"
	}
	if strings.Contains(filepath.ToSlash(path), "/.tools/bin/") {
		return "repo-local"
	}
	return "path"
}

func releaseBaseURL() string {
	if value := strings.TrimSpace(os.Getenv("FLOGO_AGENT_BASE_URL")); value != "" {
		return strings.TrimRight(value, "/")
	}
	if strings.TrimSpace(version) == "" || version == "dev" {
		return ""
	}
	return "https://github.com/" + releaseRepo + "/releases/download/" + version
}

func joinURL(base string, name string) string {
	return strings.TrimRight(base, "/") + "/" + name
}

func downloadFile(url string, path string) error {
	response, err := httpClient.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: unexpected status %s", url, response.Status)
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(file, response.Body)
	return err
}

func verifyChecksum(archivePath string, checksumPath string, assetName string) error {
	checksums, err := os.ReadFile(checksumPath)
	if err != nil {
		return err
	}
	var expected string
	for _, line := range strings.Split(string(checksums), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		name := strings.TrimPrefix(fields[len(fields)-1], "*")
		if name == assetName {
			expected = fields[0]
			break
		}
	}
	if expected == "" {
		return fmt.Errorf("checksum for %s not found", assetName)
	}
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}
	actual := fmt.Sprintf("%x", hash.Sum(nil))
	if !strings.EqualFold(expected, actual) {
		return fmt.Errorf("checksum mismatch for %s", assetName)
	}
	return nil
}

func installManagedReleaseToolFromAssetURLs(toolName string, binaryName string, releaseVersion string, assetURL string, checksumURL string) error {
	assetName := update.AssetArchiveName(binaryName)
	if assetName == "" {
		return fmt.Errorf("unsupported platform for managed %s download", toolName)
	}
	binDir, err := config.ManagedBinDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		return err
	}

	tempDir, err := os.MkdirTemp("", "flogo-agent-"+toolName+"-install-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	archivePath := filepath.Join(tempDir, assetName)
	checksumPath := filepath.Join(tempDir, update.ChecksumAssetName)
	if err := downloadFile(assetURL, archivePath); err != nil {
		return err
	}
	if err := downloadFile(checksumURL, checksumPath); err != nil {
		return err
	}
	if err := verifyChecksum(archivePath, checksumPath, assetName); err != nil {
		return err
	}

	extractedPath, err := extractToolArchive(archivePath, tempDir, binaryName)
	if err != nil {
		return err
	}
	managedPath, err := config.ManagedToolPath(toolName)
	if err != nil {
		return err
	}
	contents, err := os.ReadFile(extractedPath)
	if err != nil {
		return err
	}
	if err := os.WriteFile(managedPath, contents, 0o755); err != nil {
		return err
	}
	if toolName == "flogo" {
		if err := ensureManagedToolPath(); err != nil {
			return err
		}
	}
	return config.SaveManagedToolInstall(config.ManagedToolInstall{
		Name:    toolName,
		Path:    managedPath,
		Source:  "release-download",
		Version: strings.TrimSpace(releaseVersion),
	})
}

func extractToolArchive(archivePath string, tempDir string, binary string) (string, error) {
	if strings.HasSuffix(archivePath, ".zip") {
		return extractZipTool(archivePath, tempDir, binary)
	}
	return extractTarGzTool(archivePath, tempDir, binary)
}

func extractTarGzTool(archivePath string, tempDir string, binary string) (string, error) {
	file, err := os.Open(archivePath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	gzr, err := gzip.NewReader(file)
	if err != nil {
		return "", err
	}
	defer gzr.Close()
	tr := tar.NewReader(gzr)
	targetName := binary
	if runtime.GOOS == "windows" {
		targetName += ".exe"
	}
	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", err
		}
		if filepath.Base(header.Name) != targetName {
			continue
		}
		target := filepath.Join(tempDir, targetName)
		out, err := os.Create(target)
		if err != nil {
			return "", err
		}
		if _, err := io.Copy(out, tr); err != nil {
			out.Close()
			return "", err
		}
		if err := out.Close(); err != nil {
			return "", err
		}
		if err := os.Chmod(target, 0o755); err != nil {
			return "", err
		}
		return target, nil
	}
	return "", fmt.Errorf("binary %s not found in archive", targetName)
}

func extractZipTool(archivePath string, tempDir string, binary string) (string, error) {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	targetName := binary
	if runtime.GOOS == "windows" {
		targetName += ".exe"
	}
	for _, file := range reader.File {
		if filepath.Base(file.Name) != targetName {
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return "", err
		}
		target := filepath.Join(tempDir, targetName)
		out, err := os.Create(target)
		if err != nil {
			rc.Close()
			return "", err
		}
		if _, err := io.Copy(out, rc); err != nil {
			rc.Close()
			out.Close()
			return "", err
		}
		rc.Close()
		if err := out.Close(); err != nil {
			return "", err
		}
		if err := os.Chmod(target, 0o755); err != nil {
			return "", err
		}
		return target, nil
	}
	return "", fmt.Errorf("binary %s not found in archive", targetName)
}
