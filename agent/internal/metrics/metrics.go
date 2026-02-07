// Package metrics provides system metrics collection using gopsutil.
package metrics

import (
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

// Metrics contains all system metrics.
type Metrics struct {
	CPU       CPUMetrics     `json:"cpu"`
	Memory    MemoryMetrics  `json:"memory"`
	Disk      DiskMetrics    `json:"disk"`
	Network   NetworkMetrics `json:"network"`
	Timestamp int64          `json:"timestamp"`
}

// CPUMetrics contains CPU usage information.
type CPUMetrics struct {
	UsagePercent float64 `json:"usagePercent"`
	Cores        int     `json:"cores"`
	Model        string  `json:"model"`
}

// MemoryMetrics contains memory usage information.
type MemoryMetrics struct {
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	UsagePercent float64 `json:"usagePercent"`
}

// DiskMetrics contains disk usage information.
type DiskMetrics struct {
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	UsagePercent float64 `json:"usagePercent"`
	MountPoint   string  `json:"mountPoint"`
}

// NetworkMetrics contains network I/O information.
type NetworkMetrics struct {
	BytesRecv   uint64 `json:"bytesRecv"`
	BytesSent   uint64 `json:"bytesSent"`
	PacketsRecv uint64 `json:"packetsRecv"`
	PacketsSent uint64 `json:"packetsSent"`
}

// SystemInfo contains static system information.
type SystemInfo struct {
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	OSVersion    string `json:"osVersion"`
	Kernel       string `json:"kernel"`
	Uptime       uint64 `json:"uptime"`
	Architecture string `json:"architecture"`
}

// Collector gathers system metrics.
type Collector struct{}

// NewCollector creates a new metrics collector.
func NewCollector() *Collector {
	return &Collector{}
}

// GetMetrics gathers and returns current system metrics.
func (c *Collector) GetMetrics() (*Metrics, error) {
	cpuMetrics, err := c.getCPUMetrics()
	if err != nil {
		return nil, err
	}

	memMetrics, err := c.getMemoryMetrics()
	if err != nil {
		return nil, err
	}

	diskMetrics, err := c.getDiskMetrics()
	if err != nil {
		return nil, err
	}

	netMetrics, err := c.getNetworkMetrics()
	if err != nil {
		return nil, err
	}

	return &Metrics{
		CPU:       *cpuMetrics,
		Memory:    *memMetrics,
		Disk:      *diskMetrics,
		Network:   *netMetrics,
		Timestamp: time.Now().UnixMilli(),
	}, nil
}

// GetSystemInfo returns static system information.
func (c *Collector) GetSystemInfo() (*SystemInfo, error) {
	info, err := host.Info()
	if err != nil {
		return nil, err
	}

	return &SystemInfo{
		Hostname:     info.Hostname,
		OS:           info.OS,
		OSVersion:    info.PlatformVersion,
		Kernel:       info.KernelVersion,
		Uptime:       info.Uptime,
		Architecture: info.KernelArch,
	}, nil
}

func (c *Collector) getCPUMetrics() (*CPUMetrics, error) {
	// Get CPU usage percentage (1 second interval)
	percentages, err := cpu.Percent(time.Second, false)
	if err != nil {
		return nil, err
	}

	usagePercent := 0.0
	if len(percentages) > 0 {
		usagePercent = percentages[0]
	}

	// Get CPU info
	infos, err := cpu.Info()
	if err != nil {
		return nil, err
	}

	cores := 0
	model := ""
	if len(infos) > 0 {
		cores = int(infos[0].Cores)
		model = infos[0].ModelName
	}

	// Count total logical cores
	logicalCores, err := cpu.Counts(true)
	if err == nil && logicalCores > cores {
		cores = logicalCores
	}

	return &CPUMetrics{
		UsagePercent: usagePercent,
		Cores:        cores,
		Model:        model,
	}, nil
}

func (c *Collector) getMemoryMetrics() (*MemoryMetrics, error) {
	v, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}

	return &MemoryMetrics{
		Total:        v.Total,
		Used:         v.Used,
		Free:         v.Free,
		UsagePercent: v.UsedPercent,
	}, nil
}

func (c *Collector) getDiskMetrics() (*DiskMetrics, error) {
	// Get root partition stats
	usage, err := disk.Usage("/")
	if err != nil {
		return nil, err
	}

	return &DiskMetrics{
		Total:        usage.Total,
		Used:         usage.Used,
		Free:         usage.Free,
		UsagePercent: usage.UsedPercent,
		MountPoint:   "/",
	}, nil
}

func (c *Collector) getNetworkMetrics() (*NetworkMetrics, error) {
	counters, err := net.IOCounters(false)
	if err != nil {
		return nil, err
	}

	if len(counters) == 0 {
		return &NetworkMetrics{}, nil
	}

	// Aggregate all interfaces
	total := counters[0]

	return &NetworkMetrics{
		BytesRecv:   total.BytesRecv,
		BytesSent:   total.BytesSent,
		PacketsRecv: total.PacketsRecv,
		PacketsSent: total.PacketsSent,
	}, nil
}
