package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/aldoapicella/flogo-agent-platform/internal/agentloop"
	"github.com/aldoapicella/flogo-agent-platform/internal/contracts"
	"github.com/aldoapicella/flogo-agent-platform/internal/session"
)

type Manager struct {
	service     *session.Service
	coordinator *agentloop.Coordinator
	stateDir    string
	sessionsDir string

	mu       sync.Mutex
	sessions map[string]*contracts.SessionSnapshot
	repoLock map[string]*sync.Mutex
}

type Options struct {
	ServiceOptions session.Options
}

func NewManager(ctx context.Context, repoRoot string, stateDir string, manifestPath string, options Options) (*Manager, error) {
	service, err := session.NewServiceWithOptions(ctx, repoRoot, stateDir, manifestPath, options.ServiceOptions)
	if err != nil {
		return nil, err
	}
	if stateDir == "" {
		stateDir = filepath.Join(repoRoot, ".flogo-agent")
	}
	manager := &Manager{
		service:     service,
		coordinator: agentloop.New(service),
		stateDir:    stateDir,
		sessionsDir: filepath.Join(stateDir, "sessions"),
		sessions:    map[string]*contracts.SessionSnapshot{},
		repoLock:    map[string]*sync.Mutex{},
	}
	if err := os.MkdirAll(manager.sessionsDir, 0o755); err != nil {
		_ = service.Close()
		return nil, err
	}
	if err := manager.loadSessions(); err != nil {
		_ = service.Close()
		return nil, err
	}
	return manager, nil
}

func (m *Manager) Close() error {
	if m.service == nil {
		return nil
	}
	return m.service.Close()
}

func (m *Manager) CreateSession(_ context.Context, req contracts.SessionRequest) (*contracts.SessionSnapshot, error) {
	if err := session.EnsureRepoPath(req.RepoPath); err != nil {
		return nil, err
	}
	if req.Mode == "" {
		req.Mode = contracts.ModeReview
	}
	if req.StateDir == "" {
		req.StateDir = m.stateDir
	}

	now := timestamp()
	snapshot := &contracts.SessionSnapshot{
		ID:              sessionID(),
		RepoPath:        req.RepoPath,
		Goal:            req.Goal,
		Mode:            req.Mode,
		ApprovalPolicy:  req.ApprovalPolicy,
		Sandbox:         req.Sandbox,
		StateDir:        req.StateDir,
		SourcesManifest: req.SourcesManifest,
		Status:          contracts.SessionStatusActive,
		Messages: []contracts.ChatMessage{
			{
				ID:        "msg-system",
				Role:      contracts.RoleSystem,
				Content:   "Flogo coding agent session started.",
				CreatedAt: now,
			},
		},
		Plan: []contracts.PlanItem{
			{ID: "inspect", Title: "Inspect flogo.json and flow resources", Status: contracts.PlanItemPending},
			{ID: "repair", Title: "Repair Flogo descriptor issues", Status: contracts.PlanItemPending},
			{ID: "build", Title: "Build the generated app", Status: contracts.PlanItemPending},
			{ID: "test", Title: "Run available flow and unit tests", Status: contracts.PlanItemPending},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	m.mu.Lock()
	m.sessions[snapshot.ID] = snapshot
	m.mu.Unlock()
	if err := m.saveSession(snapshot); err != nil {
		return nil, err
	}
	return cloneSnapshot(snapshot), nil
}

func (m *Manager) ListSessions() ([]contracts.SessionSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make([]contracts.SessionSnapshot, 0, len(m.sessions))
	for _, snapshot := range m.sessions {
		out = append(out, *cloneSnapshot(snapshot))
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out, nil
}

func (m *Manager) GetSession(id string) (*contracts.SessionSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	snapshot, ok := m.sessions[id]
	if !ok {
		return nil, fmt.Errorf("session %s not found", id)
	}
	return cloneSnapshot(snapshot), nil
}

func (m *Manager) SendMessage(ctx context.Context, id string, content string) (*contracts.SessionSnapshot, error) {
	snapshot, err := m.withSessionLock(id, func(snapshot *contracts.SessionSnapshot) error {
		return m.coordinator.HandleUserMessage(ctx, snapshot, content)
	})
	if err != nil {
		return nil, err
	}
	return snapshot, nil
}

func (m *Manager) Approve(ctx context.Context, id string) (*contracts.SessionSnapshot, error) {
	snapshot, err := m.withSessionLock(id, func(snapshot *contracts.SessionSnapshot) error {
		return m.coordinator.ApprovePending(ctx, snapshot)
	})
	if err != nil {
		return nil, err
	}
	return snapshot, nil
}

func (m *Manager) Reject(id string, reason string) (*contracts.SessionSnapshot, error) {
	snapshot, err := m.withSessionLock(id, func(snapshot *contracts.SessionSnapshot) error {
		return m.coordinator.RejectPending(snapshot, reason)
	})
	if err != nil {
		return nil, err
	}
	return snapshot, nil
}

func (m *Manager) withSessionLock(id string, fn func(*contracts.SessionSnapshot) error) (*contracts.SessionSnapshot, error) {
	m.mu.Lock()
	snapshot, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("session %s not found", id)
	}
	repoPath := snapshot.RepoPath
	m.mu.Unlock()

	lock := m.repoLockFor(repoPath)
	lock.Lock()
	defer lock.Unlock()

	m.mu.Lock()
	current := m.sessions[id]
	m.mu.Unlock()

	if err := fn(current); err != nil {
		return nil, err
	}
	current.UpdatedAt = timestamp()

	if err := m.saveSession(current); err != nil {
		return nil, err
	}
	return cloneSnapshot(current), nil
}

func (m *Manager) repoLockFor(repoPath string) *sync.Mutex {
	m.mu.Lock()
	defer m.mu.Unlock()
	if lock, ok := m.repoLock[repoPath]; ok {
		return lock
	}
	lock := &sync.Mutex{}
	m.repoLock[repoPath] = lock
	return lock
}

func (m *Manager) loadSessions() error {
	entries, err := os.ReadDir(m.sessionsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(m.sessionsDir, entry.Name(), "session.json")
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var snapshot contracts.SessionSnapshot
		if err := json.Unmarshal(contents, &snapshot); err != nil {
			return err
		}
		m.sessions[snapshot.ID] = &snapshot
		m.repoLockFor(snapshot.RepoPath)
	}
	return nil
}

func (m *Manager) saveSession(snapshot *contracts.SessionSnapshot) error {
	dir := filepath.Join(m.sessionsDir, snapshot.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "session.json"), append(payload, '\n'), 0o644)
}

func cloneSnapshot(snapshot *contracts.SessionSnapshot) *contracts.SessionSnapshot {
	if snapshot == nil {
		return nil
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		cloned := *snapshot
		return &cloned
	}
	var cloned contracts.SessionSnapshot
	if err := json.Unmarshal(payload, &cloned); err != nil {
		cloned = *snapshot
	}
	return &cloned
}

func sessionID() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("session-%d", time.Now().UTC().UnixNano())
	}
	return "session-" + hex.EncodeToString(buf[:])
}

func timestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
