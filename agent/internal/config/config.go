// Package config provides configuration management for the server agent.
package config

import (
	"flag"
	"time"
)

// Config holds the agent configuration.
type Config struct {
	// Port is the port to listen on (default 8443)
	Port int

	// TLSCertPath is the path to the TLS certificate file
	TLSCertPath string

	// TLSKeyPath is the path to the TLS private key file
	TLSKeyPath string

	// MetricsInterval is how often to stream metrics via WebSocket
	MetricsInterval time.Duration
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		Port:            8443,
		TLSCertPath:     "",
		TLSKeyPath:      "",
		MetricsInterval: 1 * time.Second,
	}
}

// ParseFlags parses command line flags into a Config.
func ParseFlags() *Config {
	cfg := DefaultConfig()

	flag.IntVar(&cfg.Port, "port", cfg.Port, "Port to listen on")
	flag.StringVar(&cfg.TLSCertPath, "tls-cert", cfg.TLSCertPath, "Path to TLS certificate file")
	flag.StringVar(&cfg.TLSKeyPath, "tls-key", cfg.TLSKeyPath, "Path to TLS private key file")
	flag.DurationVar(&cfg.MetricsInterval, "metrics-interval", cfg.MetricsInterval, "Metrics streaming interval")

	flag.Parse()

	return cfg
}

// Validate checks if the configuration is valid.
func (c *Config) Validate() error {
	if c.TLSCertPath == "" {
		return ErrMissingTLSCert
	}
	if c.TLSKeyPath == "" {
		return ErrMissingTLSKey
	}
	if c.Port <= 0 || c.Port > 65535 {
		return ErrInvalidPort
	}
	return nil
}
