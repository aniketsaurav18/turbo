// Package docker provides Docker container and image management.
package docker

import (
	"bufio"
	"context"
	"fmt"
	"io"
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

// ContainerDetails represents detailed container information.
type ContainerDetails struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Image     string            `json:"image"`
	Status    string            `json:"status"`
	State     string            `json:"state"`
	Ports     []string          `json:"ports"`
	Created   string            `json:"created"`
	IPAddress string            `json:"ipAddress"`
	Pid       int               `json:"pid"`
	Labels    map[string]string `json:"labels"`
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
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithVersion("1.44"))
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

// GetContainerDetails returns detailed information about a specific container.
func (m *Manager) GetContainerDetails(ctx context.Context, containerID string) (*ContainerDetails, error) {
	c, err := m.client.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, err
	}

	var ports []string
	for _, p := range c.NetworkSettings.Ports {
		for _, binding := range p {
			if binding.HostPort != "" {
				ports = append(ports, fmt.Sprintf("%s:%s->%s/%s", binding.HostIP, binding.HostPort, p[0].HostPort, "tcp"))
			}
		}
	}

	name := c.Name
	if len(name) > 0 && name[0] == '/' {
		name = name[1:]
	}

	ipAddress := ""
	if c.NetworkSettings != nil && c.NetworkSettings.IPAddress != "" {
		ipAddress = c.NetworkSettings.IPAddress
	}

	return &ContainerDetails{
		ID:        c.ID[:12],
		Name:      name,
		Image:     c.Config.Image,
		Status:    c.State.Status,
		State:     c.State.Status,
		Ports:     ports,
		Created:   c.Created,
		IPAddress: ipAddress,
		Pid:       c.State.Pid,
		Labels:    c.Config.Labels,
	}, nil
}

// LogsOptions contains options for streaming container logs.
type LogsOptions struct {
	Follow     bool
	Tail       string
	Timestamps bool
}

// StreamLogs streams container logs to the provided channel.
// The channel is closed when streaming is complete or an error occurs.
func (m *Manager) StreamLogs(ctx context.Context, containerID string, opts LogsOptions, logChan chan<- string) error {
	options := types.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     opts.Follow,
		Tail:       opts.Tail,
		Timestamps: opts.Timestamps,
	}

	reader, err := m.client.ContainerLogs(ctx, containerID, options)
	if err != nil {
		return err
	}
	defer reader.Close()

	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case logChan <- scanner.Text():
		}
	}

	return scanner.Err()
}

// GetContainerLogs returns recent container logs as a single string.
func (m *Manager) GetContainerLogs(ctx context.Context, containerID string, tail string) (string, error) {
	options := types.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     false,
		Tail:       tail,
		Timestamps: true,
	}

	reader, err := m.client.ContainerLogs(ctx, containerID, options)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	logs, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}

	return string(logs), nil
}
