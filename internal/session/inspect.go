package session

import (
	"context"
	"fmt"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/flogo"
)

type ObservationBundle struct {
	Summary      string
	Observations []contracts.Observation
}

func (s *Service) InspectDescriptor(ctx context.Context, req contracts.SessionRequest) (*ObservationBundle, error) {
	doc, err := flogo.LoadDocument(req.RepoPath)
	if err != nil {
		return nil, err
	}
	validation, err := s.verifier.Validate(doc)
	if err != nil {
		return nil, err
	}
	attachCitations(ctx, s.retriever, &validation)

	observations := flogo.DescribeDescriptor(doc)
	summary := fmt.Sprintf("Inspected flogo.json and found %d descriptor fact(s).", len(observations))
	if len(validation.SemanticIssues)+len(validation.SchemaIssues) > 0 {
		summary = fmt.Sprintf("%s Validation currently reports %d issue(s).", summary, len(validation.SemanticIssues)+len(validation.SchemaIssues))
	}
	return &ObservationBundle{
		Summary:      summary,
		Observations: observations,
	}, nil
}

func (s *Service) InspectRuntimeConfig(_ context.Context, req contracts.SessionRequest) (*ObservationBundle, error) {
	doc, err := flogo.LoadDocument(req.RepoPath)
	if err != nil {
		return nil, err
	}
	observations := filterObservationKinds(flogo.DescribeDescriptor(doc), "trigger_type", "rest_endpoint", "runtime_config")
	summary := "Inspected trigger configuration and runtime-facing handler settings."
	if len(observations) == 0 {
		summary = "No trigger runtime configuration was found in flogo.json."
	}
	return &ObservationBundle{
		Summary:      summary,
		Observations: observations,
	}, nil
}

func (s *Service) InspectBuildArtifacts(ctx context.Context, req contracts.SessionRequest) (*ObservationBundle, error) {
	workspaceRoot := s.workspaceRoot(req.RepoPath, req.StateDir)
	_, observations, err := s.verifier.InspectBuildArtifacts(ctx, req.RepoPath, workspaceRoot)
	if err != nil {
		return nil, err
	}
	summary := "Inspected generated workspace and build artifacts."
	if len(observations) == 0 {
		summary = "No generated build artifacts are available yet."
	}
	return &ObservationBundle{
		Summary:      summary,
		Observations: observations,
	}, nil
}

func (s *Service) PlanLocalTesting(ctx context.Context, req contracts.SessionRequest) (*ObservationBundle, error) {
	doc, err := flogo.LoadDocument(req.RepoPath)
	if err != nil {
		return nil, err
	}
	workspaceRoot := s.workspaceRoot(req.RepoPath, req.StateDir)
	facts, _, err := s.verifier.InspectBuildArtifacts(ctx, req.RepoPath, workspaceRoot)
	if err != nil {
		return nil, err
	}
	observations := flogo.BuildLocalTestingObservations(doc, facts)
	summary := summarizeLocalTestingObservations(observations)
	return &ObservationBundle{
		Summary:      summary,
		Observations: observations,
	}, nil
}

func filterObservationKinds(observations []contracts.Observation, kinds ...string) []contracts.Observation {
	if len(observations) == 0 || len(kinds) == 0 {
		return nil
	}
	allowed := make(map[string]struct{}, len(kinds))
	for _, kind := range kinds {
		allowed[strings.TrimSpace(kind)] = struct{}{}
	}
	filtered := make([]contracts.Observation, 0, len(observations))
	for _, observation := range observations {
		if _, ok := allowed[observation.Kind]; ok {
			filtered = append(filtered, observation)
		}
	}
	return filtered
}

func summarizeLocalTestingObservations(observations []contracts.Observation) string {
	for _, observation := range observations {
		if observation.Kind == "local_test_plan" && strings.TrimSpace(observation.Summary) != "" {
			return observation.Summary
		}
	}
	if len(observations) == 0 {
		return "No local testing guidance is available yet."
	}
	return observations[0].Summary
}
