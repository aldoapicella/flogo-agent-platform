package knowledge

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func IngestManifest(ctx context.Context, repoRoot string, store *Store, manifestPath string) error {
	manifest, err := LoadManifest(manifestPath)
	if err != nil {
		return err
	}

	for _, source := range manifest.Sources {
		if err := store.ResetSource(ctx, source.ID); err != nil {
			return err
		}
		text, err := loadSource(repoRoot, source)
		if err != nil {
			return err
		}
		chunks := ChunkMarkdown(source, text)
		if err := store.InsertChunks(ctx, chunks); err != nil {
			return err
		}
	}
	return nil
}

func loadSource(repoRoot string, source Source) (string, error) {
	switch source.Type {
	case "local_file":
		path := filepath.Join(repoRoot, source.Location)
		contents, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read source %s: %w", source.ID, err)
		}
		return string(contents), nil
	case "web":
		req, err := http.NewRequest(http.MethodGet, source.Location, nil)
		if err != nil {
			return "", err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("fetch source %s: %w", source.ID, err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			return "", fmt.Errorf("fetch source %s: unexpected status %s", source.ID, resp.Status)
		}
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}
		if isHTMLResponse(resp.Header.Get("Content-Type"), body) {
			return extractHTMLText(string(body)), nil
		}
		return string(body), nil
	default:
		return "", fmt.Errorf("unsupported source type %q", source.Type)
	}
}

func isHTMLResponse(contentType string, body []byte) bool {
	if strings.Contains(strings.ToLower(contentType), "html") {
		return true
	}
	trimmed := strings.TrimSpace(string(body))
	return strings.HasPrefix(strings.ToLower(trimmed), "<!doctype html") || strings.HasPrefix(strings.ToLower(trimmed), "<html")
}
