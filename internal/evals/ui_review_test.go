package evals

import "testing"

func TestParseUIReviewReport(t *testing.T) {
	report, err := ParseUIReviewReport(`{
		"readability":{"score":2,"reason":"clear transcript"},
		"visual_hierarchy":{"score":1,"reason":"side panel is readable"},
		"approval_clarity":{"score":2,"reason":"approval is obvious"},
		"diff_clarity":{"score":1,"reason":"diff is somewhat noisy"},
		"overall_coherence":{"score":2,"reason":"consistent"},
		"findings":[{"severity":"medium","title":"Diff noise","details":"JSON reordering dominates the view","captures":["diff-view"]}],
		"tasks":[{"priority":"high","title":"Highlight semantic changes","rationale":"Review should focus on wiring changes","suggested_change":"Collapse unchanged JSON regions in the diff pane","captures":["diff-view"]}],
		"summary":"Usable but diff presentation needs tightening."
	}`)
	if err != nil {
		t.Fatal(err)
	}
	if report.Readability.Score != 2 {
		t.Fatalf("unexpected readability score %+v", report.Readability)
	}
	if len(report.Findings) != 1 || report.Findings[0].Title != "Diff noise" {
		t.Fatalf("unexpected findings %+v", report.Findings)
	}
	if len(report.Tasks) != 1 || report.Tasks[0].Priority != "high" {
		t.Fatalf("unexpected tasks %+v", report.Tasks)
	}
}
