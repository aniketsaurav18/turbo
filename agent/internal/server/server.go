// Package server provides the HTTP/WebSocket server for the agent.
package server

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/aniket/servertui/agent/internal/config"
	"github.com/aniket/servertui/agent/internal/docker"
	"github.com/aniket/servertui/agent/internal/metrics"
	"github.com/aniket/servertui/agent/internal/updates"
	"github.com/gorilla/mux"
)

// Server is the main HTTP/WebSocket server.
type Server struct {
	config           *config.Config
	router           *mux.Router
	httpServer       *http.Server
	metricsCollector *metrics.Collector
	dockerManager    *docker.Manager
	updatesManager   *updates.Manager
}

// New creates a new server with the given configuration.
func New(cfg *config.Config) *Server {
	s := &Server{
		config:           cfg,
		router:           mux.NewRouter(),
		metricsCollector: metrics.NewCollector(),
		updatesManager:   updates.NewManager(),
	}

	// Try to initialize Docker manager (may fail if Docker not available)
	dockerMgr, err := docker.NewManager()
	if err != nil {
		log.Printf("Docker not available: %v", err)
	} else {
		s.dockerManager = dockerMgr
	}

	s.setupRoutes()
	return s
}

// setupRoutes configures all HTTP routes.
func (s *Server) setupRoutes() {
	// CORS middleware for all routes
	s.router.Use(corsMiddleware)

	// Health check
	s.router.HandleFunc("/health", s.handleHealth).Methods("GET")

	// API routes
	api := s.router.PathPrefix("/api").Subrouter()
	api.HandleFunc("/system", s.handleSystemInfo).Methods("GET")
	api.HandleFunc("/metrics", s.handleMetrics).Methods("GET")
	api.HandleFunc("/docker", s.handleDocker).Methods("GET")
	api.HandleFunc("/docker/containers/{id}/start", s.handleContainerStart).Methods("POST")
	api.HandleFunc("/docker/containers/{id}/stop", s.handleContainerStop).Methods("POST")
	api.HandleFunc("/updates", s.handleUpdates).Methods("GET")
	api.HandleFunc("/updates/apply", s.handleApplyUpdate).Methods("POST")
	api.HandleFunc("/updates/apply-all", s.handleApplyAllUpdates).Methods("POST")
	api.HandleFunc("/exec", s.handleExec).Methods("POST")

	// WebSocket route
	s.router.HandleFunc("/ws/metrics", s.handleMetricsWS)
}

// Start starts the HTTPS server.
func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.config.Port)

	s.httpServer = &http.Server{
		Addr:         addr,
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Starting agent server on %s with TLS", addr)
	return s.httpServer.ListenAndServeTLS(s.config.TLSCertPath, s.config.TLSKeyPath)
}

// Shutdown gracefully shuts down the server.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.dockerManager != nil {
		s.dockerManager.Close()
	}
	return s.httpServer.Shutdown(ctx)
}

// corsMiddleware adds CORS headers to responses.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
