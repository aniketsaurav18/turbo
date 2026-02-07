package server

import (
	"encoding/json"
	"net/http"

	"github.com/aniket/servertui/agent/internal/docker"
	"github.com/aniket/servertui/agent/internal/updates"
	"github.com/gorilla/mux"
)

// HealthResponse represents the health check response.
type HealthResponse struct {
	Status string `json:"status"`
}

// ExecRequest represents a command execution request.
type ExecRequest struct {
	Command string `json:"command"`
}

// ApplyUpdateRequest represents an update request.
type ApplyUpdateRequest struct {
	Package string `json:"package"`
}

// ErrorResponse represents an error response.
type ErrorResponse struct {
	Error string `json:"error"`
}

// writeJSON writes a JSON response.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, ErrorResponse{Error: message})
}

// handleHealth handles the health check endpoint.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{Status: "ok"})
}

// handleSystemInfo handles the system info endpoint.
func (s *Server) handleSystemInfo(w http.ResponseWriter, r *http.Request) {
	info, err := s.metricsCollector.GetSystemInfo()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

// handleMetrics handles the metrics endpoint.
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	m, err := s.metricsCollector.GetMetrics()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// handleDocker handles the Docker status endpoint.
func (s *Server) handleDocker(w http.ResponseWriter, r *http.Request) {
	if s.dockerManager == nil {
		writeJSON(w, http.StatusOK, docker.Status{
			Installed:  false,
			Containers: []docker.Container{},
			Images:     []docker.Image{},
		})
		return
	}

	status, err := s.dockerManager.GetStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// handleContainerStart handles starting a Docker container.
func (s *Server) handleContainerStart(w http.ResponseWriter, r *http.Request) {
	if s.dockerManager == nil {
		writeError(w, http.StatusServiceUnavailable, "Docker not available")
		return
	}

	vars := mux.Vars(r)
	containerID := vars["id"]

	if err := s.dockerManager.StartContainer(r.Context(), containerID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

// handleContainerStop handles stopping a Docker container.
func (s *Server) handleContainerStop(w http.ResponseWriter, r *http.Request) {
	if s.dockerManager == nil {
		writeError(w, http.StatusServiceUnavailable, "Docker not available")
		return
	}

	vars := mux.Vars(r)
	containerID := vars["id"]

	if err := s.dockerManager.StopContainer(r.Context(), containerID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// handleUpdates handles the updates endpoint.
func (s *Server) handleUpdates(w http.ResponseWriter, r *http.Request) {
	pkgs, err := s.updatesManager.GetUpdates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pkgs)
}

// handleApplyUpdate handles applying a single package update.
func (s *Server) handleApplyUpdate(w http.ResponseWriter, r *http.Request) {
	var req ApplyUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Package == "" {
		writeError(w, http.StatusBadRequest, "package name required")
		return
	}

	result, err := s.updatesManager.ApplyUpdate(r.Context(), req.Package)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleApplyAllUpdates handles applying all available updates.
func (s *Server) handleApplyAllUpdates(w http.ResponseWriter, r *http.Request) {
	result, err := s.updatesManager.ApplyAllUpdates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleExec handles command execution.
func (s *Server) handleExec(w http.ResponseWriter, r *http.Request) {
	var req ExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Command == "" {
		writeError(w, http.StatusBadRequest, "command required")
		return
	}

	result, err := updates.ExecuteCommand(r.Context(), req.Command)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}
