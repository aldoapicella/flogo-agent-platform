package agents

import (
	"context"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/knowledge"
)

type Retriever struct {
	store *knowledge.Store
}

func NewRetriever(store *knowledge.Store) *Retriever {
	return &Retriever{store: store}
}

func (r *Retriever) FindCitations(ctx context.Context, issue contracts.ValidationIssue, limit int) []contracts.SourceCitation {
	if r == nil || r.store == nil {
		return nil
	}
	query := strings.TrimSpace(issue.RuleID + " " + issue.Message)
	citations, err := r.store.Search(ctx, query, limit)
	if err != nil {
		return nil
	}
	return citations
}
