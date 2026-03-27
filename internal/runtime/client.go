package runtime

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:7777"
	}
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 2 * time.Minute},
	}
}

func (c *Client) Health(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/healthz", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("daemon health check failed: %s", strings.TrimSpace(string(body)))
	}
	return nil
}

func (c *Client) Shutdown(ctx context.Context) error {
	return c.doJSON(ctx, http.MethodPost, "/admin/shutdown", map[string]string{}, nil)
}

func (c *Client) CreateSession(ctx context.Context, req contracts.SessionRequest) (*contracts.SessionSnapshot, error) {
	var snapshot contracts.SessionSnapshot
	if err := c.doJSON(ctx, http.MethodPost, "/sessions", req, &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (c *Client) ListSessions(ctx context.Context) ([]contracts.SessionSnapshot, error) {
	var response struct {
		Sessions []contracts.SessionSnapshot `json:"sessions"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/sessions", nil, &response); err != nil {
		return nil, err
	}
	return response.Sessions, nil
}

func (c *Client) GetSession(ctx context.Context, id string) (*contracts.SessionSnapshot, error) {
	var snapshot contracts.SessionSnapshot
	if err := c.doJSON(ctx, http.MethodGet, "/sessions/"+id, nil, &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (c *Client) SendMessage(ctx context.Context, id string, content string) (*contracts.SessionSnapshot, error) {
	var snapshot contracts.SessionSnapshot
	payload := map[string]string{"content": content}
	if err := c.doJSON(ctx, http.MethodPost, "/sessions/"+id+"/messages", payload, &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (c *Client) Approve(ctx context.Context, id string) (*contracts.SessionSnapshot, error) {
	var snapshot contracts.SessionSnapshot
	if err := c.doJSON(ctx, http.MethodPost, "/sessions/"+id+"/approve", map[string]string{}, &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (c *Client) Reject(ctx context.Context, id string, reason string) (*contracts.SessionSnapshot, error) {
	var snapshot contracts.SessionSnapshot
	payload := map[string]string{"reason": reason}
	if err := c.doJSON(ctx, http.MethodPost, "/sessions/"+id+"/reject", payload, &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (c *Client) Undo(ctx context.Context, id string) (*contracts.SessionSnapshot, error) {
	var snapshot contracts.SessionSnapshot
	if err := c.doJSON(ctx, http.MethodPost, "/sessions/"+id+"/undo", map[string]string{}, &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (c *Client) StreamSession(ctx context.Context, id string, onEvent func(contracts.SessionStreamEvent) error) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/sessions/"+id+"/events", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s", strings.TrimSpace(string(body)))
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	var data strings.Builder
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			data.WriteString(strings.TrimPrefix(line, "data: "))
			continue
		}
		if strings.TrimSpace(line) != "" {
			continue
		}
		if data.Len() == 0 {
			continue
		}
		var event contracts.SessionStreamEvent
		if err := json.Unmarshal([]byte(data.String()), &event); err != nil {
			return err
		}
		if onEvent != nil {
			if err := onEvent(event); err != nil {
				return err
			}
		}
		data.Reset()
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		return err
	}
	return ctx.Err()
}

func (c *Client) doJSON(ctx context.Context, method string, path string, requestBody any, out any) error {
	var body io.Reader
	if requestBody != nil {
		payload, err := json.Marshal(requestBody)
		if err != nil {
			return err
		}
		body = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		var payload map[string]any
		if json.Unmarshal(responseBody, &payload) == nil {
			if message, ok := payload["error"].(string); ok && message != "" {
				return fmt.Errorf("%s", message)
			}
		}
		return fmt.Errorf("%s", strings.TrimSpace(string(responseBody)))
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	return json.Unmarshal(responseBody, out)
}
