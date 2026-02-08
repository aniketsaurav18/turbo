// Package updates provides OS package update detection and installation.
package updates

import (
	"bufio"
	"context"
	"fmt"
	"log"
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
	DistroAlpine  Distro = "alpine"
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
	log.Printf("[UPDATES] GetUpdates called, distro=%s", m.distro)
	switch m.distro {
	case DistroDebian, DistroUbuntu:
		return m.getAptUpdates(ctx)
	case DistroRHEL, DistroCentOS, DistroFedora:
		return m.getYumUpdates(ctx)
	case DistroAlpine:
		return m.getApkUpdates(ctx)
	default:
		log.Printf("[ERROR] Unsupported distribution: %s", m.distro)
		return nil, fmt.Errorf("unsupported distribution: %s", m.distro)
	}
}

// ApplyUpdate installs a specific package update.
func (m *Manager) ApplyUpdate(ctx context.Context, packageName string) (*CommandResult, error) {
	log.Printf("[UPDATES] ApplyUpdate called, package=%s, distro=%s", packageName, m.distro)
	switch m.distro {
	case DistroDebian, DistroUbuntu:
		return executeCommand(ctx, "apt-get", "install", "-y", packageName)
	case DistroRHEL, DistroCentOS, DistroFedora:
		return executeCommand(ctx, "yum", "update", "-y", packageName)
	case DistroAlpine:
		return executeCommand(ctx, "apk", "add", "--upgrade", packageName)
	default:
		log.Printf("[ERROR] Unsupported distribution: %s", m.distro)
		return nil, fmt.Errorf("unsupported distribution: %s", m.distro)
	}
}

// ApplyAllUpdates installs all available updates.
func (m *Manager) ApplyAllUpdates(ctx context.Context) (*CommandResult, error) {
	log.Printf("[UPDATES] ApplyAllUpdates called, distro=%s", m.distro)
	switch m.distro {
	case DistroDebian, DistroUbuntu:
		return executeCommand(ctx, "apt-get", "upgrade", "-y")
	case DistroRHEL, DistroCentOS, DistroFedora:
		return executeCommand(ctx, "yum", "update", "-y")
	case DistroAlpine:
		return executeCommand(ctx, "apk", "upgrade")
	default:
		log.Printf("[ERROR] Unsupported distribution: %s", m.distro)
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

func (m *Manager) getApkUpdates(ctx context.Context) ([]PackageUpdate, error) {
	log.Println("[UPDATES] Fetching Alpine apk updates")

	// First update package cache
	_, err := executeCommand(ctx, "apk", "update")
	if err != nil {
		log.Printf("[ERROR] Failed to update apk cache: %v", err)
		return nil, fmt.Errorf("failed to update apk cache: %w", err)
	}

	// Get list of upgradable packages
	result, err := executeCommand(ctx, "apk", "list", "--upgradable")
	if err != nil {
		log.Printf("[ERROR] Failed to list upgradable packages: %v", err)
		return nil, err
	}

	log.Printf("[UPDATES] apk list --upgradable output: %s", result.Stdout)
	return parseApkOutput(result.Stdout), nil
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

// parseApkOutput parses the output of apk list --upgradable.
// Format: package-version {repository} [flags] - description
func parseApkOutput(output string) []PackageUpdate {
	var updates []PackageUpdate
	scanner := bufio.NewScanner(strings.NewReader(output))

	// Pattern: package-newversion upgradable from: package-oldversion
	// Example: busybox-1.35.0-r3 upgradable from: busybox-1.34.1-r5
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// Try to parse "package-version upgradable from: package-oldversion"
		if strings.Contains(line, "upgradable from:") {
			parts := strings.Split(line, " upgradable from: ")
			if len(parts) == 2 {
				newPkg := strings.TrimSpace(parts[0])
				oldPkg := strings.TrimSpace(parts[1])

				// Extract package name and version from package-version format
				name, newVersion := splitPackageVersion(newPkg)
				_, oldVersion := splitPackageVersion(oldPkg)

				if name != "" {
					updates = append(updates, PackageUpdate{
						Name:           name,
						NewVersion:     newVersion,
						CurrentVersion: oldVersion,
					})
				}
			}
		}
	}

	log.Printf("[UPDATES] Parsed %d Alpine packages for upgrade", len(updates))
	return updates
}

// splitPackageVersion splits "package-version" into name and version.
// Alpine packages use format like: busybox-1.35.0-r3
func splitPackageVersion(pkgVersion string) (name, version string) {
	// Find the last hyphen followed by a digit (version start)
	for i := len(pkgVersion) - 1; i >= 0; i-- {
		if pkgVersion[i] == '-' && i+1 < len(pkgVersion) {
			nextChar := pkgVersion[i+1]
			if nextChar >= '0' && nextChar <= '9' {
				return pkgVersion[:i], pkgVersion[i+1:]
			}
		}
	}
	return pkgVersion, ""
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
	// Try reading /etc/os-release first
	data, err := os.ReadFile("/etc/os-release")
	if err == nil {
		content := strings.ToLower(string(data))
		log.Printf("[UPDATES] /etc/os-release content: %s", strings.ReplaceAll(content, "\n", " | "))

		switch {
		case strings.Contains(content, "alpine"):
			log.Println("[UPDATES] Detected Alpine Linux")
			return DistroAlpine
		case strings.Contains(content, "ubuntu"):
			log.Println("[UPDATES] Detected Ubuntu")
			return DistroUbuntu
		case strings.Contains(content, "debian"):
			log.Println("[UPDATES] Detected Debian")
			return DistroDebian
		case strings.Contains(content, "centos"):
			log.Println("[UPDATES] Detected CentOS")
			return DistroCentOS
		case strings.Contains(content, "rhel"), strings.Contains(content, "red hat"):
			log.Println("[UPDATES] Detected RHEL")
			return DistroRHEL
		case strings.Contains(content, "fedora"):
			log.Println("[UPDATES] Detected Fedora")
			return DistroFedora
		}
	} else {
		log.Printf("[UPDATES] Could not read /etc/os-release: %v", err)
	}

	// Fallback: detect by checking which package manager binary exists
	log.Println("[UPDATES] Falling back to package manager binary detection")

	if _, err := exec.LookPath("apk"); err == nil {
		log.Println("[UPDATES] Found apk - assuming Alpine")
		return DistroAlpine
	}
	if _, err := exec.LookPath("apt-get"); err == nil {
		log.Println("[UPDATES] Found apt-get - assuming Debian/Ubuntu")
		return DistroDebian
	}
	if _, err := exec.LookPath("yum"); err == nil {
		log.Println("[UPDATES] Found yum - assuming RHEL/CentOS")
		return DistroRHEL
	}
	if _, err := exec.LookPath("dnf"); err == nil {
		log.Println("[UPDATES] Found dnf - assuming Fedora")
		return DistroFedora
	}

	log.Println("[UPDATES] Could not detect distribution")
	return DistroUnknown
}
