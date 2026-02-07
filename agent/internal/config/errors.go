package config

import "errors"

var (
	// ErrMissingTLSCert is returned when the TLS certificate path is not provided.
	ErrMissingTLSCert = errors.New("TLS certificate path is required")

	// ErrMissingTLSKey is returned when the TLS key path is not provided.
	ErrMissingTLSKey = errors.New("TLS key path is required")

	// ErrInvalidPort is returned when the port number is invalid.
	ErrInvalidPort = errors.New("port must be between 1 and 65535")
)
