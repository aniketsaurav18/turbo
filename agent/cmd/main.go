package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aniket/servertui/agent/internal/config"
	"github.com/aniket/servertui/agent/internal/server"
)

func main() {
	// Configure logging for Docker - immediate output, include timestamps
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.SetOutput(os.Stdout)

	log.Println("========================================")
	log.Println("ServerTUI Agent Starting...")
	log.Println("========================================")

	// Parse configuration from command line flags
	cfg := config.ParseFlags()
	log.Printf("Config: port=%d, cert=%s, key=%s", cfg.Port, cfg.TLSCertPath, cfg.TLSKeyPath)

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Invalid configuration: %v", err)
	}

	// Create and start server
	log.Println("Creating server instance...")
	srv := server.New(cfg)

	// Handle graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down server...")

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("Error during shutdown: %v", err)
		}

		os.Exit(0)
	}()

	// Start the server
	log.Printf("Server agent starting on port %d with TLS", cfg.Port)
	log.Println("Waiting for connections...")
	if err := srv.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
