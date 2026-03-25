package knowledge

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestIngestAndSearch(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "sample.md"), []byte("# Flow URI\nUse res://flow:<id> in handlers."), 0o644); err != nil {
		t.Fatal(err)
	}
	manifestPath := filepath.Join(root, "manifest.json")
	if err := os.WriteFile(manifestPath, []byte(`{"sources":[{"id":"sample","title":"Sample","type":"local_file","location":"docs/sample.md","tags":["flow","uri"]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := Open(ctx, filepath.Join(root, "knowledge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if err := IngestManifest(ctx, root, store, manifestPath); err != nil {
		t.Fatal(err)
	}

	citations, err := store.Search(ctx, "flow uri handler", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(citations) == 0 {
		t.Fatal("expected citations")
	}
	if citations[0].SourceID != "sample" {
		t.Fatalf("unexpected source id %q", citations[0].SourceID)
	}
}

func TestSearchPrefersOfficialSources(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()

	store, err := Open(ctx, filepath.Join(root, "knowledge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if err := store.InsertChunks(ctx, []Chunk{
		{
			SourceID:   "local",
			Title:      "Local",
			Locator:    "Local",
			SourceType: "local_file",
			Content:    "Use res://flow:<id> in handlers",
			Tags:       []string{"local"},
		},
		{
			SourceID:   "official",
			Title:      "Official",
			Locator:    "Official",
			SourceType: "web",
			Content:    "Use res://flow:<id> in handlers",
			Tags:       []string{"official", "docs"},
		},
	}); err != nil {
		t.Fatal(err)
	}

	citations, err := store.Search(ctx, "res flow handlers", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(citations) < 2 {
		t.Fatalf("expected 2 citations, got %d", len(citations))
	}
	if citations[0].SourceID != "official" {
		t.Fatalf("expected official source first, got %+v", citations)
	}
}

func TestIngestWebHTMLExtractsText(t *testing.T) {
	ctx := context.Background()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>x</title><style>.x{}</style></head><body><main><h1>Flow URI</h1><p>Use res://flow:&lt;id&gt; in handlers.</p></main></body></html>`))
	}))
	defer server.Close()

	root := t.TempDir()
	manifestPath := filepath.Join(root, "manifest.json")
	if err := os.WriteFile(manifestPath, []byte(`{"sources":[{"id":"web","title":"Web","type":"web","location":"`+server.URL+`","tags":["flow","uri"]}]}`), 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := Open(ctx, filepath.Join(root, "knowledge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if err := IngestManifest(ctx, root, store, manifestPath); err != nil {
		t.Fatal(err)
	}

	citations, err := store.Search(ctx, "res flow handlers", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(citations) == 0 {
		t.Fatal("expected citations from html source")
	}
}
