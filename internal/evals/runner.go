package evals

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
)

type FixtureResult struct {
	Name             string               `json:"name"`
	RepoPath         string               `json:"repoPath"`
	Outcome          contracts.RunOutcome `json:"outcome"`
	SchemaIssues     int                  `json:"schemaIssues"`
	SemanticIssues   int                  `json:"semanticIssues"`
	ValidationPassed bool                 `json:"validationPassed"`
	BuildAttempted   bool                 `json:"buildAttempted"`
	BuildPassed      bool                 `json:"buildPassed"`
	TestTotal        int                  `json:"testTotal"`
	TestPassed       int                  `json:"testPassed"`
	TestSkipped      int                  `json:"testSkipped"`
	NextAction       string               `json:"nextAction,omitempty"`
}

type Summary struct {
	Root                     string                `json:"root"`
	Mode                     contracts.SessionMode `json:"mode"`
	Total                    int                   `json:"total"`
	Outcomes                 map[string]int        `json:"outcomes"`
	ValidationPassedFixtures int                   `json:"validationPassedFixtures"`
	FixturesWithBuild        int                   `json:"fixturesWithBuild"`
	BuildSuccessFixtures     int                   `json:"buildSuccessFixtures"`
	AppliedFixtures          int                   `json:"appliedFixtures"`
	ReadyFixtures            int                   `json:"readyFixtures"`
	NonSkippedTests          int                   `json:"nonSkippedTests"`
	PassedTests              int                   `json:"passedTests"`
	SkippedTests             int                   `json:"skippedTests"`
	ValidationPassRate       float64               `json:"validationPassRate"`
	BuildSuccessRate         float64               `json:"buildSuccessRate"`
	AppliedRate              float64               `json:"appliedRate"`
	ReadyRate                float64               `json:"readyRate"`
	TestPassRate             float64               `json:"testPassRate"`
	Fixtures                 []FixtureResult       `json:"fixtures"`
}

func RunBenchmarks(ctx context.Context, repoRoot string, stateDir string, sources string, benchRoot string, mode contracts.SessionMode, options session.Options) (*Summary, error) {
	service, err := session.NewServiceWithOptions(ctx, repoRoot, stateDir, sources, options)
	if err != nil {
		return nil, err
	}
	defer service.Close()

	fixtures, err := discoverFixtures(benchRoot)
	if err != nil {
		return nil, err
	}

	summary := &Summary{
		Root:     benchRoot,
		Mode:     mode,
		Outcomes: map[string]int{},
		Fixtures: make([]FixtureResult, 0, len(fixtures)),
	}

	for _, repoPath := range fixtures {
		report, err := service.Run(ctx, contracts.SessionRequest{
			RepoPath: repoPath,
			Goal:     "benchmark validation and repair",
			Mode:     mode,
			ApprovalPolicy: contracts.ApprovalPolicy{
				RequireWriteApproval: mode == contracts.ModeReview,
			},
			StateDir: filepath.Join(stateDir, "benchmarks", filepath.Base(repoPath)),
		})
		if err != nil {
			return nil, fmt.Errorf("run benchmark %s: %w", repoPath, err)
		}

		result := FixtureResult{
			Name:             filepath.Base(repoPath),
			RepoPath:         repoPath,
			Outcome:          report.Outcome,
			SchemaIssues:     len(report.Evidence.ValidationResult.SchemaIssues),
			SemanticIssues:   len(report.Evidence.ValidationResult.SemanticIssues),
			ValidationPassed: report.Evidence.ValidationResult.Passed,
			NextAction:       report.NextAction,
		}
		if report.Evidence.BuildResult != nil {
			result.BuildAttempted = true
			result.BuildPassed = report.Evidence.BuildResult.ExitCode == 0
		}
		for _, test := range report.Evidence.TestResults {
			result.TestTotal++
			if test.Skipped {
				result.TestSkipped++
				continue
			}
			if test.Passed {
				result.TestPassed++
			}
		}
		summary.Fixtures = append(summary.Fixtures, result)
		summary.Outcomes[string(report.Outcome)]++
		if result.ValidationPassed {
			summary.ValidationPassedFixtures++
		}
		if result.BuildAttempted {
			summary.FixturesWithBuild++
			if result.BuildPassed {
				summary.BuildSuccessFixtures++
			}
		}
		if report.Outcome == contracts.RunOutcomeApplied {
			summary.AppliedFixtures++
		}
		if report.Outcome == contracts.RunOutcomeReady {
			summary.ReadyFixtures++
		}
		summary.PassedTests += result.TestPassed
		summary.SkippedTests += result.TestSkipped
		summary.NonSkippedTests += result.TestTotal - result.TestSkipped
	}

	summary.Total = len(summary.Fixtures)
	if summary.Total > 0 {
		summary.ValidationPassRate = float64(summary.ValidationPassedFixtures) / float64(summary.Total)
		summary.AppliedRate = float64(summary.AppliedFixtures) / float64(summary.Total)
		summary.ReadyRate = float64(summary.ReadyFixtures) / float64(summary.Total)
	}
	if summary.FixturesWithBuild > 0 {
		summary.BuildSuccessRate = float64(summary.BuildSuccessFixtures) / float64(summary.FixturesWithBuild)
	}
	if summary.NonSkippedTests > 0 {
		summary.TestPassRate = float64(summary.PassedTests) / float64(summary.NonSkippedTests)
	}
	return summary, nil
}

func discoverFixtures(root string) ([]string, error) {
	set := map[string]bool{}
	if err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || d.Name() != "flogo.json" {
			return nil
		}
		set[filepath.Dir(path)] = true
		return nil
	}); err != nil {
		return nil, err
	}

	fixtures := make([]string, 0, len(set))
	for path := range set {
		fixtures = append(fixtures, path)
	}
	sort.Strings(fixtures)
	return fixtures, nil
}
