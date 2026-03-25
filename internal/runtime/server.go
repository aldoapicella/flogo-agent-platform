package runtime

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
)

type Server struct {
	manager *Manager
	server  *http.Server
}

func NewServer(addr string, manager *Manager) *Server {
	mux := http.NewServeMux()
	s := &Server{
		manager: manager,
		server: &http.Server{
			Addr:    addr,
			Handler: mux,
		},
	}
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/sessions", s.handleSessions)
	mux.HandleFunc("/sessions/", s.handleSession)
	return s
}

func (s *Server) ListenAndServe() error {
	return s.server.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		items, err := s.manager.ListSessions()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"sessions": items})
	case http.MethodPost:
		var req contracts.SessionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("decode session request: %w", err))
			return
		}
		snapshot, err := s.manager.CreateSession(r.Context(), req)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusCreated, snapshot)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/sessions/")
	path = strings.Trim(path, "/")
	if path == "" {
		http.NotFound(w, r)
		return
	}
	parts := strings.Split(path, "/")
	id := parts[0]

	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		snapshot, err := s.manager.GetSession(id)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
		return
	}

	action := parts[1]
	switch action {
	case "messages":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("decode message request: %w", err))
			return
		}
		snapshot, err := s.manager.SendMessage(r.Context(), id, req.Content)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
	case "events":
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.handleSessionEvents(w, r, id)
	case "approve":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		snapshot, err := s.manager.Approve(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
	case "undo":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		snapshot, err := s.manager.Undo(id)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
	case "reject":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Reason string `json:"reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
			writeError(w, http.StatusBadRequest, fmt.Errorf("decode reject request: %w", err))
			return
		}
		snapshot, err := s.manager.Reject(id, req.Reason)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request, id string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	stream, cancel, err := s.manager.SubscribeSession(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	defer cancel()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	writer := bufio.NewWriter(w)
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-stream:
			if !ok {
				return
			}
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			if _, err := writer.WriteString("data: " + string(payload) + "\n\n"); err != nil {
				return
			}
			if err := writer.Flush(); err != nil {
				return
			}
			flusher.Flush()
		case <-heartbeat.C:
			if _, err := writer.WriteString(": heartbeat\n\n"); err != nil {
				return
			}
			if err := writer.Flush(); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{
		"error": err.Error(),
	})
}
