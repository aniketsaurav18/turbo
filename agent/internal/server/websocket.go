package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/aniket/servertui/agent/internal/docker"
	"github.com/gorilla/websocket"
)

// AgentMessage represents a WebSocket message from the agent.
type AgentMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins (configurable in production)
	},
}

// handleMetricsWS handles the WebSocket connection for streaming metrics.
func (s *Server) handleMetricsWS(w http.ResponseWriter, r *http.Request) {
	log.Printf("[WS] WebSocket connection attempt from: %s", r.RemoteAddr)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("[WS] WebSocket client connected: %s", r.RemoteAddr)

	// Create a ticker for sending metrics at the configured interval
	log.Printf("[WS] Metrics interval: %v", s.config.MetricsInterval)
	ticker := time.NewTicker(s.config.MetricsInterval)
	defer ticker.Stop()

	// Channel to signal when the client disconnects
	done := make(chan struct{})

	// Read loop to detect client disconnect
	go func() {
		defer close(done)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[WS] WebSocket read error: %v", err)
				}
				return
			}
		}
	}()

	// Send initial metrics immediately
	log.Println("[WS] Sending initial metrics...")
	if err := s.sendMetrics(conn); err != nil {
		log.Printf("[WS] Failed to send initial metrics: %v", err)
		return
	}
	log.Println("[WS] Initial metrics sent successfully")

	// Main loop: send metrics on each tick
	for {
		select {
		case <-done:
			log.Printf("[WS] WebSocket client disconnected: %s", r.RemoteAddr)
			return
		case <-ticker.C:
			log.Println("[WS] Ticker: sending metrics...")
			if err := s.sendMetrics(conn); err != nil {
				log.Printf("[WS] Failed to send metrics: %v", err)
				return
			}
		}
	}
}

// sendMetrics collects and sends current metrics over the WebSocket.
func (s *Server) sendMetrics(conn *websocket.Conn) error {
	log.Println("[WS] Collecting metrics...")
	m, err := s.metricsCollector.GetMetrics()
	if err != nil {
		log.Printf("[WS] Failed to collect metrics: %v", err)
		return err
	}

	log.Printf("[WS] Metrics collected: CPU=%.2f%%, Mem=%.2f%%", m.CPU.UsagePercent, m.Memory.UsagePercent)

	msg := AgentMessage{
		Type:      "metrics",
		Data:      m,
		Timestamp: time.Now().UnixMilli(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[WS] Failed to marshal metrics: %v", err)
		return err
	}

	log.Printf("[WS] Sending %d bytes of metrics data", len(data))
	return conn.WriteMessage(websocket.TextMessage, data)
}

// ClientMessage represents a message from the client to the agent.
type ClientMessage struct {
	Action      string `json:"action"`
	ContainerID string `json:"containerId,omitempty"`
}

// handleDockerLogsWS handles WebSocket connections for streaming Docker container logs.
func (s *Server) handleDockerLogsWS(w http.ResponseWriter, r *http.Request) {
	log.Printf("[WS] Docker logs WebSocket connection attempt from: %s", r.RemoteAddr)

	if s.dockerManager == nil {
		log.Println("[WS] Docker not available, rejecting connection")
		http.Error(w, "Docker not available", http.StatusServiceUnavailable)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("[WS] Docker logs client connected: %s", r.RemoteAddr)

	// Read loop to handle client commands
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] WebSocket read error: %v", err)
			} else {
				log.Printf("[WS] Client disconnected: %s", r.RemoteAddr)
			}
			return
		}

		var msg ClientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("[WS] Invalid message format: %v", err)
			s.sendWSMessage(conn, "error", map[string]string{"message": "Invalid message format"})
			continue
		}

		switch msg.Action {
		case "getDetails":
			if msg.ContainerID == "" {
				s.sendWSMessage(conn, "error", map[string]string{"message": "Container ID required"})
				continue
			}
			s.handleGetContainerDetails(conn, msg.ContainerID)

		case "startLogs":
			if msg.ContainerID == "" {
				s.sendWSMessage(conn, "error", map[string]string{"message": "Container ID required"})
				continue
			}
			s.handleStartLogsStreaming(conn, msg.ContainerID)

		default:
			log.Printf("[WS] Unknown action: %s", msg.Action)
			s.sendWSMessage(conn, "error", map[string]string{"message": "Unknown action: " + msg.Action})
		}
	}
}

// handleGetContainerDetails fetches and sends container details.
func (s *Server) handleGetContainerDetails(conn *websocket.Conn, containerID string) {
	log.Printf("[WS] Getting container details for: %s", containerID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	details, err := s.dockerManager.GetContainerDetails(ctx, containerID)
	if err != nil {
		log.Printf("[WS] Failed to get container details: %v", err)
		s.sendWSMessage(conn, "error", map[string]string{"message": err.Error()})
		return
	}

	s.sendWSMessage(conn, "containerDetails", details)
}

// handleStartLogsStreaming starts streaming logs for a container.
func (s *Server) handleStartLogsStreaming(conn *websocket.Conn, containerID string) {
	log.Printf("[WS] Starting log streaming for container: %s", containerID)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Create a channel for log messages
	logChan := make(chan string, 100)
	defer close(logChan)

	// Start streaming in a goroutine
	go func() {
		opts := docker.LogsOptions{
			Follow:     true,
			Tail:       "100",
			Timestamps: true,
		}
		if err := s.dockerManager.StreamLogs(ctx, containerID, opts, logChan); err != nil {
			if err != context.Canceled {
				log.Printf("[WS] Log streaming error: %v", err)
			}
		}
	}()

	// Send logs to client
	for logLine := range logChan {
		if err := s.sendWSMessage(conn, "logLine", logLine); err != nil {
			log.Printf("[WS] Failed to send log line: %v", err)
			return
		}
	}

	log.Printf("[WS] Log streaming ended for container: %s", containerID)
}

// sendWSMessage sends a message over WebSocket.
func (s *Server) sendWSMessage(conn *websocket.Conn, msgType string, data interface{}) error {
	msg := AgentMessage{
		Type:      msgType,
		Data:      data,
		Timestamp: time.Now().UnixMilli(),
	}

	msgData, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, msgData)
}
