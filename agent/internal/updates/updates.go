// Package updates provides OS package update detection and installation.
package updates

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// PackageUpdate represents an available package update.
type PackageUpdate struct {
	Name           string `json:"name"`
	CurrentVersion string `json:"currentVersion"`
	NewVersion     string `json:"newVersion"`
	Repository     string `json:"repository,omitempty"`
}

// CommandResult contains the result of a command execution.
type CommandResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	Duration int64  `json:"duration"` // milliseconds
}

// Distro represents the detected Linux distribution.
type Distro string

const (
	DistroDebian  Distro = "debian"
	DistroUbuntu  Distro = "ubuntu"
	DistroRHEL    Distro = "rhel"
	DistroCentOS  Distro = "centos"
	DistroFedora  Distro = "fedora"
	DistroUnknown Distro = "unknown"
)

// Manager handles OS package updates.
type Manager struct {
	distro Distro
}

// NewManager creates a new updates manager.
func NewManager() *Manager {
	return &Manager{
		distro: detectDistro(),
	}
}

// GetDistro returns the detected distribution.
func (m *Manager) GetDistro() Distro {
	return m.distro
}

// GetUpdates retrieves available package updates.
func (m *Manager) GetUpdates(ctx context.Context) ([]PackageUpdate, error) {
	switch m.distro {
	case DistroDebian, DistroUbuntu:
		return m.getAptUpdates(ctx)
	case DistroRHEL, DistroCentOS, DistroFedora:
		return m.getYumUpdates(ctx)
	default:
		return nil, fmt.Errorf("unsupported distribution: %s", m.distro)
	}
}

// ApplyUpdate installs a specific package update.
func (m *Manager) ApplyUpdate(ctx context.Context, packageName string) (*CommandResult, error) {
	switch m.distro {
	case DistroDebian, DistroUbuntu:
		return executeCommand(ctx, "apt-get", "install", "-y", packageName)
	case DistroRHEL, DistroCentOS, DistroFedora:
		return executeCommand(ctx, "yum", "update", "-y", packageName)
	default:
		return nil, fmt.Errorf("unsupported distribution: %s", m.distro)
	}
}

// ApplyAllUpdates installs all available updates.
func (m *Manager) ApplyAllUpdates(ctx context.Context) (*CommandResult, error) {
	switch m.distro {
	case DistroDebian, DistroUbuntu:
		return executeCommand(ctx, "apt-get", "upgrade", "-y")
	case DistroRHEL, DistroCentOS, DistroFedora:
		return executeCommand(ctx, "yum", "update", "-y")
	default:
		return nil, fmt.Errorf("unsupported distribution: %s", m.distro)
	}
}

// ExecuteCommand runs an arbitrary shell command.
func ExecuteCommand(ctx context.Context, command string) (*CommandResult, error) {
	return executeCommand(ctx, "sh", "-c", command)
}

func (m *Manager) getAptUpdates(ctx context.Context) ([]PackageUpdate, error) {
	// First, update package cache
	_, err := executeCommand(ctx, "apt-get", "update", "-qq")
	if err != nil {
		return nil, fmt.Errorf("failed to update apt cache: %w", err)
	}

	// Get list of upgradable packages
	result, err := executeCommand(ctx, "apt", "list", "--upgradable")
	if err != nil {
		return nil, err
	}

	return parseAptOutput(result.Stdout), nil
}

func (m *Manager) getYumUpdates(ctx context.Context) ([]PackageUpdate, error) {
	result, err := executeCommand(ctx, "yum", "check-update", "-q")
	// yum check-update returns exit code 100 if updates are available
	if err != nil && result != nil && result.ExitCode != 100 && result.ExitCode != 0 {
		return nil, err
	}

	return parseYumOutput(result.Stdout), nil
}

// parseAptOutput parses the output of apt list --upgradable.
// Format: package/repo version arch [upgradable from: current]
func parseAptOutput(output string) []PackageUpdate {
	var updates []PackageUpdate
	scanner := bufio.NewScanner(strings.NewReader(output))

	// Pattern: name/repo version arch [upgradable from: current_version]
	re := regexp.MustCompile(`^([^/]+)/([^\s]+)\s+([^\s]+)\s+\S+\s+\[upgradable from:\s+([^\]]+)\]`)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Listing...") {
			continue
		}

		matches := re.FindStringSubmatch(line)
		if len(matches) >= 5 {
			updates = append(updates, PackageUpdate{
				Name:           matches[1],
				Repository:     matches[2],
				NewVersion:     matches[3],
				CurrentVersion: matches[4],
			})
		}
	}

	return updates
}

// parseYumOutput parses the output of yum check-update.
// Format: package.arch  version  repository
func parseYumOutput(output string) []PackageUpdate {
	var updates []PackageUpdate
	scanner := bufio.NewScanner(strings.NewReader(output))

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "Obsoleting") || strings.HasPrefix(line, "Security") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) >= 3 {
			// Package name includes arch, e.g., package.x86_64
			nameParts := strings.SplitN(fields[0], ".", 2)
			name := fields[0]
			if len(nameParts) >= 1 {
				name = nameParts[0]
			}

			updates = append(updates, PackageUpdate{
				Name:           name,
				NewVersion:     fields[1],
				Repository:     fields[2],
				CurrentVersion: "", // yum check-update doesn't show current version
			})
		}
	}

	return updates
}

func executeCommand(ctx context.Context, name string, args ...string) (*CommandResult, error) {
	start := time.Now()

	cmd := exec.CommandContext(ctx, name, args...)

	stdout, err := cmd.Output()
	duration := time.Since(start).Milliseconds()

	result := &CommandResult{
		Stdout:   string(stdout),
		Duration: duration,
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.Stderr = string(exitErr.Stderr)
			result.ExitCode = exitErr.ExitCode()
		} else {
			result.ExitCode = -1
			result.Stderr = err.Error()
		}
	}

	return result, nil
}

func detectDistro() Distro {
	data, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return DistroUnknown
	}

	content := strings.ToLower(string(data))

	switch {
	case strings.Contains(content, "ubuntu"):
		return DistroUbuntu
	case strings.Contains(content, "debian"):
		return DistroDebian
	case strings.Contains(content, "centos"):
		return DistroCentOS
	case strings.Contains(content, "rhel"), strings.Contains(content, "red hat"):
		return DistroRHEL
	case strings.Contains(content, "fedora"):
		return DistroFedora
	default:
		return DistroUnknown
	}
}
