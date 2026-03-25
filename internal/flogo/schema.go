package flogo

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/xeipuuv/gojsonschema"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

//go:embed schema/core.schema.json
var coreSchema []byte

//go:embed schema/compat.schema.json
var compatSchema []byte

func ValidateSchema(doc *Document) ([]contracts.ValidationIssue, error) {
	documentBytes, err := json.Marshal(doc.Raw)
	if err != nil {
		return nil, fmt.Errorf("marshal document: %w", err)
	}

	issues, valid, err := validateSchemaBytes(doc.Path, documentBytes, coreSchema, "schema.core")
	if err != nil {
		return nil, err
	}
	if valid {
		return nil, nil
	}

	compatIssues, compatValid, err := validateSchemaBytes(doc.Path, documentBytes, compatSchema, "schema.compat")
	if err != nil {
		return nil, err
	}
	if compatValid {
		return nil, nil
	}

	return dedupeIssues(append(issues, compatIssues...)), nil
}

func validateSchemaBytes(path string, document []byte, schema []byte, ruleID string) ([]contracts.ValidationIssue, bool, error) {
	result, err := gojsonschema.Validate(
		gojsonschema.NewBytesLoader(schema),
		gojsonschema.NewBytesLoader(document),
	)
	if err != nil {
		return nil, false, fmt.Errorf("schema validation: %w", err)
	}
	if result.Valid() {
		return nil, true, nil
	}

	issues := make([]contracts.ValidationIssue, 0, len(result.Errors()))
	for _, item := range result.Errors() {
		issues = append(issues, contracts.ValidationIssue{
			Severity: "error",
			RuleID:   ruleID,
			Message:  item.Description(),
			File:     path,
			JSONPath: normalizeJSONPath(item.Field()),
		})
	}
	return issues, false, nil
}

func normalizeJSONPath(field string) string {
	if field == "(root)" || field == "" {
		return "$"
	}
	parts := strings.Split(field, ".")
	return "$." + strings.Join(parts, ".")
}

func dedupeIssues(items []contracts.ValidationIssue) []contracts.ValidationIssue {
	seen := make(map[string]bool, len(items))
	out := make([]contracts.ValidationIssue, 0, len(items))
	for _, item := range items {
		key := item.RuleID + "::" + item.JSONPath + "::" + item.Message
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, item)
	}
	return out
}
