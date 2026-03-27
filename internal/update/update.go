package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"golang.org/x/mod/semver"
)

const (
	ChecksumAssetName = "flogo-agent_checksums.txt"
	ManifestAssetName = "release-manifest.json"
)

var HTTPClient = &http.Client{Timeout: 20 * time.Second}

type ReleaseAsset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

type ReleaseInfo struct {
	Version     string         `json:"version"`
	PublishedAt string         `json:"published_at"`
	Body        string         `json:"body"`
	HTMLURL     string         `json:"html_url"`
	Assets      []ReleaseAsset `json:"assets"`
}

func AssetArchiveName(binary string) string {
	osName := runtime.GOOS
	archName := runtime.GOARCH
	switch archName {
	case "amd64", "arm64":
	default:
		return ""
	}
	if osName == "windows" {
		return fmt.Sprintf("%s_%s_%s.zip", binary, osName, archName)
	}
	return fmt.Sprintf("%s_%s_%s.tar.gz", binary, osName, archName)
}

func FetchLatest(ctx context.Context, repo string) (*ReleaseInfo, error) {
	endpoint := latestReleaseEndpoint(repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "flogo-agent-updater")

	resp, err := HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch latest release: unexpected status %s", resp.Status)
	}

	var payload struct {
		TagName     string         `json:"tag_name"`
		PublishedAt string         `json:"published_at"`
		Body        string         `json:"body"`
		HTMLURL     string         `json:"html_url"`
		Draft       bool           `json:"draft"`
		Prerelease  bool           `json:"prerelease"`
		Assets      []ReleaseAsset `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.Draft {
		return nil, fmt.Errorf("latest release for %s is still a draft", repo)
	}
	if payload.Prerelease {
		return nil, fmt.Errorf("latest release for %s is a prerelease", repo)
	}

	info := &ReleaseInfo{
		Version:     strings.TrimSpace(payload.TagName),
		PublishedAt: strings.TrimSpace(payload.PublishedAt),
		Body:        strings.TrimSpace(payload.Body),
		HTMLURL:     strings.TrimSpace(payload.HTMLURL),
		Assets:      payload.Assets,
	}
	if info.Version == "" {
		return nil, fmt.Errorf("latest release for %s did not include a tag", repo)
	}
	return info, nil
}

func (r *ReleaseInfo) Asset(name string) (ReleaseAsset, bool) {
	for _, asset := range r.Assets {
		if strings.TrimSpace(asset.Name) == strings.TrimSpace(name) && strings.TrimSpace(asset.URL) != "" {
			return asset, true
		}
	}
	return ReleaseAsset{}, false
}

func IsUpdateAvailable(current string, latest string) bool {
	current = strings.TrimSpace(current)
	latest = strings.TrimSpace(latest)
	if current == "" || current == "dev" || latest == "" || latest == "dev" {
		return false
	}

	currentSemver := normalizeSemver(current)
	latestSemver := normalizeSemver(latest)
	if semver.IsValid(currentSemver) && semver.IsValid(latestSemver) {
		return semver.Compare(latestSemver, currentSemver) > 0
	}
	return latest != current
}

func latestReleaseEndpoint(repo string) string {
	if value := strings.TrimSpace(os.Getenv("FLOGO_AGENT_RELEASE_API_URL")); value != "" {
		return value
	}
	return "https://api.github.com/repos/" + strings.TrimSpace(repo) + "/releases/latest"
}

func normalizeSemver(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == "dev" {
		return value
	}
	if !strings.HasPrefix(value, "v") {
		value = "v" + value
	}
	return value
}
