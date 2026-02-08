package server

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

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
