package agents

import (
	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
)

type Repairer struct{}

func NewRepairer() *Repairer {
	return &Repairer{}
}

func (r *Repairer) BuildPatchPlan(doc *flogo.Document, citations []contracts.SourceCitation) (*contracts.PatchPlan, []string, error) {
	return flogo.BuildSafePatchPlan(doc, citations)
}
