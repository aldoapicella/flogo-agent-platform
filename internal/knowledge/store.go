package knowledge

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

type Store struct {
	db *sql.DB
}

func Open(ctx context.Context, path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create knowledge dir: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	statements := []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(source_id, title, locator, source_type, content, tags);`,
		`CREATE TABLE IF NOT EXISTS run_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate sqlite: %w", err)
		}
	}
	return nil
}

func (s *Store) ResetSource(ctx context.Context, sourceID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM chunks_fts WHERE source_id = ?`, sourceID)
	return err
}

func (s *Store) InsertChunks(ctx context.Context, chunks []Chunk) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO chunks_fts (source_id, title, locator, source_type, content, tags) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, chunk := range chunks {
		if _, err := stmt.ExecContext(ctx, chunk.SourceID, chunk.Title, chunk.Locator, chunk.SourceType, chunk.Content, strings.Join(chunk.Tags, " ")); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) Search(ctx context.Context, query string, limit int) ([]contracts.SourceCitation, error) {
	if limit <= 0 {
		limit = 5
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT source_id, title, locator, source_type, snippet(chunks_fts, 4, '', '', '...', 18), bm25(chunks_fts)
		FROM chunks_fts
		WHERE chunks_fts MATCH ?
		ORDER BY bm25(chunks_fts)
		LIMIT ?`, buildFTSQuery(query), limit)
	if err != nil {
		return nil, fmt.Errorf("search knowledge: %w", err)
	}
	defer rows.Close()

	var citations []contracts.SourceCitation
	for rows.Next() {
		var citation contracts.SourceCitation
		if err := rows.Scan(&citation.SourceID, &citation.Title, &citation.Locator, &citation.SourceType, &citation.Excerpt, &citation.Score); err != nil {
			return nil, err
		}
		citations = append(citations, citation)
	}
	return citations, rows.Err()
}

func buildFTSQuery(text string) string {
	parts := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9')
	})
	if len(parts) == 0 {
		return "flogo"
	}
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		if len(part) < 3 {
			continue
		}
		filtered = append(filtered, part+"*")
	}
	if len(filtered) == 0 {
		filtered = append(filtered, "flogo*")
	}
	return strings.Join(filtered, " OR ")
}
