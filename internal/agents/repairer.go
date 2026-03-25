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
	if r != nil && r.modelClient != nil {
		plan, notes, err := flogo.BuildModelPatchPlan(ctx, doc, validation, citations, r.modelClient)
		if err == nil && plan != nil {
			if plan.Safe {
				return plan, notes, nil
			}

			fallbackPlan, fallbackNotes, fallbackErr := flogo.BuildSafePatchPlan(doc, citations)
			if fallbackErr != nil {
				return plan, append(notes, fallbackNotes...), fallbackErr
			}
			if fallbackPlan != nil {
				combinedNotes := append(notes, "model repair candidate was not executable-safe; used deterministic repair rules")
				combinedNotes = append(combinedNotes, fallbackNotes...)
				return fallbackPlan, combinedNotes, nil
			}
			return plan, notes, nil
		}
		fallbackPlan, fallbackNotes, fallbackErr := flogo.BuildSafePatchPlan(doc, citations)
		if fallbackErr != nil {
			return nil, append(notes, fallbackNotes...), fallbackErr
		}
		if fallbackPlan != nil {
			combinedNotes := append(notes, "model repair did not yield a usable patch; used deterministic repair rules")
			combinedNotes = append(combinedNotes, fallbackNotes...)
			return fallbackPlan, combinedNotes, nil
		}
		if err != nil {
			return nil, notes, err
		}
		return nil, notes, nil
	}

	return flogo.BuildSafePatchPlan(doc, citations)
}
