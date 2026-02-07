// Package docker provides Docker container and image management.
package docker

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// Container represents a Docker container.
type Container struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Image   string   `json:"image"`
	Status  string   `json:"status"`
	State   string   `json:"state"`
	Ports   []string `json:"ports"`
	Created string   `json:"created"`
}

// Image represents a Docker image.
type Image struct {
	ID         string `json:"id"`
	Repository string `json:"repository"`
	Tag        string `json:"tag"`
	Size       int64  `json:"size"`
	Created    string `json:"created"`
}

// Status represents the overall Docker status.
type Status struct {
	Installed  bool        `json:"installed"`
	Containers []Container `json:"containers"`
	Images     []Image     `json:"images"`
}

// Manager handles Docker operations.
type Manager struct {
	client *client.Client
}

// NewManager creates a new Docker manager.
// Returns nil if Docker is not available.
func NewManager() (*Manager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = cli.Ping(ctx)
	if err != nil {
		cli.Close()
		return nil, err
	}

	return &Manager{client: cli}, nil
}

// Close closes the Docker client connection.
func (m *Manager) Close() error {
	if m.client != nil {
		return m.client.Close()
	}
	return nil
}

// GetStatus returns the current Docker status including containers and images.
func (m *Manager) GetStatus(ctx context.Context) (*Status, error) {
	containers, err := m.ListContainers(ctx)
	if err != nil {
		return nil, err
	}

	images, err := m.ListImages(ctx)
	if err != nil {
		return nil, err
	}

	return &Status{
		Installed:  true,
		Containers: containers,
		Images:     images,
	}, nil
}

// ListContainers lists all Docker containers.
func (m *Manager) ListContainers(ctx context.Context) ([]Container, error) {
	containers, err := m.client.ContainerList(ctx, types.ContainerListOptions{All: true})
	if err != nil {
		return nil, err
	}

	result := make([]Container, 0, len(containers))
	for _, c := range containers {
		// Format ports
		var ports []string
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				ports = append(ports, formatPort(p))
			}
		}

		// Get container name (remove leading /)
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		result = append(result, Container{
			ID:      c.ID[:12], // Short ID
			Name:    name,
			Image:   c.Image,
			Status:  c.Status,
			State:   c.State,
			Ports:   ports,
			Created: time.Unix(c.Created, 0).Format(time.RFC3339),
		})
	}

	return result, nil
}

// ListImages lists all Docker images.
func (m *Manager) ListImages(ctx context.Context) ([]Image, error) {
	images, err := m.client.ImageList(ctx, types.ImageListOptions{})
	if err != nil {
		return nil, err
	}

	result := make([]Image, 0, len(images))
	for _, img := range images {
		repo := "<none>"
		tag := "<none>"
		if len(img.RepoTags) > 0 {
			parts := strings.SplitN(img.RepoTags[0], ":", 2)
			if len(parts) >= 1 {
				repo = parts[0]
			}
			if len(parts) >= 2 {
				tag = parts[1]
			}
		}

		result = append(result, Image{
			ID:         img.ID[7:19], // Short ID (skip "sha256:")
			Repository: repo,
			Tag:        tag,
			Size:       img.Size,
			Created:    time.Unix(img.Created, 0).Format(time.RFC3339),
		})
	}

	return result, nil
}

// StartContainer starts a container by ID.
func (m *Manager) StartContainer(ctx context.Context, containerID string) error {
	return m.client.ContainerStart(ctx, containerID, types.ContainerStartOptions{})
}

// StopContainer stops a container by ID.
func (m *Manager) StopContainer(ctx context.Context, containerID string) error {
	stopTimeout := 10 // seconds
	return m.client.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &stopTimeout})
}

// formatPort formats a port binding for display.
func formatPort(p types.Port) string {
	return fmt.Sprintf("%d->%d/%s", p.PublicPort, p.PrivatePort, p.Type)
}
