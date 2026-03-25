package agents

import (
	"context"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
	"github.com/aldoapicella/flogo-agent-platform/internal/model"
)

type Repairer struct {
	modelClient model.Client
}

func NewRepairer(modelClient model.Client) *Repairer {
	return &Repairer{modelClient: modelClient}
}

func (r *Repairer) BuildPatchPlan(ctx context.Context, doc *flogo.Document, validation contracts.ValidationResult, citations []contracts.SourceCitation) (*contracts.PatchPlan, []string, error) {
	plan, notes, err := flogo.BuildSafePatchPlan(doc, citations)
	if err != nil || plan != nil || r == nil || r.modelClient == nil {
		return plan, notes, err
	}
	return flogo.BuildModelPatchPlan(ctx, doc, validation, citations, r.modelClient)
}
