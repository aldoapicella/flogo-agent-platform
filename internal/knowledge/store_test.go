package knowledge

import (
	"context"
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
