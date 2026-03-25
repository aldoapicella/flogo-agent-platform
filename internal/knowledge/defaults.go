package knowledge

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

//go:embed default_manifest.json
var defaultManifestBytes []byte

func ResolveManifestPath(stateDir string, repoRoot string, explicitPath string) (string, error) {
	if path := strings.TrimSpace(explicitPath); path != "" {
		return path, nil
	}

	for _, candidate := range manifestCandidates(repoRoot) {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	if strings.TrimSpace(stateDir) == "" {
		return "", fmt.Errorf("state directory is required to materialize the default knowledge manifest")
	}
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return "", err
	}

	path := filepath.Join(stateDir, "sources-manifest.json")
	if err := os.WriteFile(path, defaultManifestBytes, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func manifestCandidates(repoRoot string) []string {
	candidates := []string{}
	if repoRoot = strings.TrimSpace(repoRoot); repoRoot != "" {
		candidates = append(candidates, filepath.Join(repoRoot, "docs", "sources", "manifest.json"))
	}
	if cwd, err := os.Getwd(); err == nil {
		candidate := filepath.Join(cwd, "docs", "sources", "manifest.json")
		if len(candidates) == 0 || candidates[len(candidates)-1] != candidate {
			candidates = append(candidates, candidate)
		}
	}
	return candidates
}
