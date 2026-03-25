package flogo

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/xeipuuv/gojsonschema"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

//go:embed schema/bootstrap.schema.json
var bootstrapSchema []byte

func ValidateSchema(doc *Document) ([]contracts.ValidationIssue, error) {
	documentBytes, err := json.Marshal(doc.Raw)
	if err != nil {
		return nil, fmt.Errorf("marshal document: %w", err)
	}

	result, err := gojsonschema.Validate(
		gojsonschema.NewBytesLoader(bootstrapSchema),
		gojsonschema.NewBytesLoader(documentBytes),
	)
	if err != nil {
		return nil, fmt.Errorf("schema validation: %w", err)
	}

	if result.Valid() {
		return nil, nil
	}

	issues := make([]contracts.ValidationIssue, 0, len(result.Errors()))
	for _, item := range result.Errors() {
		issues = append(issues, contracts.ValidationIssue{
			Severity: "error",
			RuleID:   "schema.bootstrap",
			Message:  item.Description(),
			File:     doc.Path,
			JSONPath: normalizeJSONPath(item.Field()),
		})
	}

	return issues, nil
}

func normalizeJSONPath(field string) string {
	if field == "(root)" || field == "" {
		return "$"
	}
	parts := strings.Split(field, ".")
	return "$." + strings.Join(parts, ".")
}
