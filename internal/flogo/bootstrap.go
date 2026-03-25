package flogo

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

type BootstrapRequest struct {
	AppName     string
	Description string
	FlowName    string
	Route       string
	Port        string
}

func DefaultBootstrapRequest(repoPath string) BootstrapRequest {
	appName := sanitizeBootstrapName(filepath.Base(repoPath))
	if appName == "" {
		appName = "flogo-app"
	}
	return BootstrapRequest{
		AppName:     appName,
		Description: appName,
		FlowName:    "main",
		Route:       "/",
		Port:        "8888",
	}
}

func CreateMinimalApp(repoPath string, req BootstrapRequest) (*Document, error) {
	doc, err := BuildMinimalAppDocument(repoPath, req)
	if err != nil {
		return nil, err
	}
	if err := WriteDocument(doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func BuildMinimalAppDocument(repoPath string, req BootstrapRequest) (*Document, error) {
	request := DefaultBootstrapRequest(repoPath)
	if strings.TrimSpace(req.AppName) != "" {
		request.AppName = sanitizeBootstrapName(req.AppName)
	}
	if strings.TrimSpace(req.Description) != "" {
		request.Description = strings.TrimSpace(req.Description)
	}
	if strings.TrimSpace(req.FlowName) != "" {
		request.FlowName = sanitizeBootstrapName(req.FlowName)
	}
	if strings.TrimSpace(req.Route) != "" {
		request.Route = strings.TrimSpace(req.Route)
	}
	if strings.TrimSpace(req.Port) != "" {
		request.Port = strings.TrimSpace(req.Port)
	}
	if request.AppName == "" {
		request.AppName = "flogo-app"
	}
	if request.FlowName == "" {
		request.FlowName = "main"
	}
	if request.Route == "" {
		request.Route = "/"
	}
	if request.Port == "" {
		request.Port = "8888"
	}

	return &Document{
		Path: filepath.Join(repoPath, "flogo.json"),
		Raw: map[string]any{
			"name":        request.AppName,
			"type":        "flogo:app",
			"version":     "1.0.0",
			"appModel":    "1.1.0",
			"description": request.Description,
			"imports": []any{
				"github.com/project-flogo/contrib/trigger/rest",
				"github.com/project-flogo/flow",
			},
			"properties": []any{},
			"channels":   []any{},
			"triggers": []any{
				map[string]any{
					"id":   "receive_http_message",
					"name": "rest",
					"ref":  "#rest",
					"settings": map[string]any{
						"port": request.Port,
					},
					"handlers": []any{
						map[string]any{
							"settings": map[string]any{
								"method": "GET",
								"path":   request.Route,
							},
							"action": map[string]any{
								"ref": "#flow",
								"settings": map[string]any{
									"flowURI": "res://flow:" + request.FlowName,
								},
								"input":  map[string]any{},
								"output": map[string]any{},
							},
						},
					},
				},
			},
			"resources": []any{
				map[string]any{
					"id": "flow:" + request.FlowName,
					"data": map[string]any{
						"metadata": map[string]any{
							"input":  []any{},
							"output": []any{},
						},
						"tasks": []any{},
						"links": []any{},
					},
				},
			},
			"actions": []any{},
		},
	}, nil
}

func WriteDocument(doc *Document) error {
	if doc == nil {
		return fmt.Errorf("document is required")
	}
	if err := os.MkdirAll(filepath.Dir(doc.Path), 0o755); err != nil {
		return fmt.Errorf("create repo directory: %w", err)
	}
	updated, err := doc.PrettyJSON()
	if err != nil {
		return fmt.Errorf("marshal flogo.json: %w", err)
	}
	updated = append(updated, '\n')
	if err := os.WriteFile(doc.Path, updated, 0o644); err != nil {
		return fmt.Errorf("write flogo.json: %w", err)
	}
	doc.Original = updated
	return nil
}

func BuildDocumentPatchPlan(doc *Document, rationale string, citations []contracts.SourceCitation, safe bool) (*contracts.PatchPlan, string, error) {
	if doc == nil {
		return nil, "", fmt.Errorf("document is required")
	}
	updated, err := doc.PrettyJSON()
	if err != nil {
		return nil, "", fmt.Errorf("marshal flogo.json: %w", err)
	}
	diff, err := unifiedDiff(doc.Original, updated)
	if err != nil {
		return nil, "", err
	}
	content := string(append(updated, '\n'))
	return &contracts.PatchPlan{
		TargetFiles: []string{doc.Path},
		UnifiedDiff: diff,
		Rationale:   rationale,
		Citations:   citations,
		Safe:        safe,
	}, content, nil
}

func sanitizeBootstrapName(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	var builder strings.Builder
	lastDash := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			builder.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || r == ' ':
			if builder.Len() == 0 || lastDash {
				continue
			}
			builder.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(builder.String(), "-")
	if out == "" {
		return ""
	}
	return out
}
