package knowledge

import (
	"strings"
)

type Chunk struct {
	SourceID   string
	Title      string
	Locator    string
	SourceType string
	Content    string
	Tags       []string
}

func ChunkMarkdown(source Source, text string) []Chunk {
	lines := strings.Split(text, "\n")
	currentTitle := source.Title
	var current []string
	var chunks []Chunk

	flush := func() {
		content := strings.TrimSpace(strings.Join(current, "\n"))
		if content == "" {
			current = current[:0]
			return
		}
		chunks = append(chunks, Chunk{
			SourceID:   source.ID,
			Title:      source.Title,
			Locator:    currentTitle,
			SourceType: source.Type,
			Content:    content,
			Tags:       source.Tags,
		})
		current = current[:0]
	}

	for _, line := range lines {
		if strings.HasPrefix(line, "#") {
			flush()
			currentTitle = strings.TrimSpace(strings.TrimLeft(line, "#"))
			continue
		}
		current = append(current, line)
		if len(strings.Join(current, "\n")) >= 900 {
			flush()
		}
	}
	flush()

	if len(chunks) == 0 && strings.TrimSpace(text) != "" {
		chunks = append(chunks, Chunk{
			SourceID:   source.ID,
			Title:      source.Title,
			Locator:    source.Title,
			SourceType: source.Type,
			Content:    strings.TrimSpace(text),
			Tags:       source.Tags,
		})
	}
	return chunks
}
