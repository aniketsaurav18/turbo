// =============================================================================
// Performance Tab Component
// =============================================================================

import type { Server } from '../../types/types.js';
import { useConnection, useMetrics } from '../../hooks/hooks.js';
import { formatPercent, formatBytes, progressBar, getPercentColor } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { Spinner } from '../Spinner.js';

interface PerformanceTabProps {
  server: Server;
}

export function PerformanceTab({ server }: PerformanceTabProps) {
  const { status, error } = useConnection(server);
  const metrics = useMetrics(server, 2000); // Poll every 60 seconds

  if (status === 'connecting') {
    return (
      <box padding={1}>
        <Spinner color="#00ff00" />
        <text> Loading performance data...</text>
      </box>
    );
  }

  if (status === 'error') {
    return (
      <box flexDirection="column" padding={1}>
        <text><span fg="#ff0000">✗ Failed to load metrics: {error}</span></text>
      </box>
    );
  }

  const cpuPercent = metrics.cpu || 0;
  const memTotal = metrics.memory.total || 0;
  const memUsed = metrics.memory.used || 0;
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const diskTotal = metrics.disk.total || 0;
  const diskUsed = metrics.disk.used || 0;
  const diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

  return (
    <box flexDirection="column" padding={1}>
      {/* Data Source Indicator */}
      <box marginBottom={1}>
        <text>
          <span fg="#888888">
            Data source: SSH (polling every 2s)
            {!metrics.loading && ' | Live'}
          </span>
        </text>
      </box>

      {metrics.loading ? (
        <box>
          <Spinner color="#00ff00" />
          <text> Loading metrics...</text>
        </box>
      ) : (
        <>
          {/* CPU */}
          <box flexDirection="column" marginBottom={1}>
            <text><strong><span fg="#00ffff">CPU Usage</span></strong></text>
            <box marginTop={1}>
              <box width={40}>
                <text>
                  <span fg={getPercentColor(cpuPercent)}>
                    {progressBar(cpuPercent, 30)} {formatPercent(cpuPercent)}
                  </span>
                </text>
              </box>
            </box>
          </box>

          {/* Memory */}
          <box flexDirection="column" marginBottom={1}>
            <text><strong><span fg="#00ffff">Memory Usage</span></strong></text>
            <box marginTop={1}>
              <box width={40}>
                <text>
                  <span fg={getPercentColor(memPercent)}>
                    {progressBar(memPercent, 30)} {formatPercent(memPercent)}
                  </span>
                </text>
              </box>
            </box>
            <text>
              <span fg="#888888">
                {formatBytes(memUsed)} used / {formatBytes(memTotal)} total
                {memTotal > 0 && ` • ${formatBytes(memTotal - memUsed)} free`}
              </span>
            </text>
          </box>

          {/* Disk */}
          <box flexDirection="column" marginBottom={1}>
            <text><strong><span fg="#00ffff">Disk Usage (/)</span></strong></text>
            <box marginTop={1}>
              <box width={40}>
                <text>
                  <span fg={getPercentColor(diskPercent)}>
                    {progressBar(diskPercent, 30)} {formatPercent(diskPercent)}
                  </span>
                </text>
              </box>
            </box>
            <text>
              <span fg="#888888">
                {formatBytes(diskUsed)} used / {formatBytes(diskTotal)} total
                {diskTotal > 0 && ` • ${formatBytes(diskTotal - diskUsed)} free`}
              </span>
            </text>
          </box>
        </>
      )}
    </box>
  );
}
