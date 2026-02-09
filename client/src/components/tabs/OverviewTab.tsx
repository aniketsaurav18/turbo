// =============================================================================
// Overview Tab Component
// =============================================================================

import type { Server } from '../../types/types.js';
import { useConnection, useMetrics } from '../../hooks/hooks.js';
import { formatUptime, formatBytes, formatPercent, progressBar, getPercentColor } from '../../utils/format.js';
import { getAgentSystemInfo, checkAgentHealth } from '../../utils/agent.js';
import { logger } from '../../utils/logger.js';
import { Spinner } from '../Spinner.js';

interface OverviewTabProps {
  server: Server;
}

export function OverviewTab({ server }: OverviewTabProps) {
  const { status, systemInfo, error } = useConnection(server);
  const metrics = useMetrics(server, 60000); // Poll every 60 seconds

  if (status === 'connecting') {
    return (
      <box flexDirection="column" padding={1}>
        <box>
          <Spinner color="#00ff00" />
          <text> Connecting to {server.host}...</text>
        </box>
      </box>
    );
  }

  if (status === 'error') {
    return (
      <box flexDirection="column" padding={1}>
        <text><span fg="#ff0000">✗ Connection failed: {error}</span></text>
        <text><span fg="#888888">Check agent status and network connectivity.</span></text>
      </box>
    );
  }

  const cpuValue = metrics.cpu || 0;
  const memValue = metrics.memory.total > 0 ? (metrics.memory.used / metrics.memory.total * 100) : 0;
  const diskValue = metrics.disk.total > 0 ? (metrics.disk.used / metrics.disk.total * 100) : 0;

  return (
    <box flexDirection="column" padding={1}>
      {/* System Info */}
      <box flexDirection="column" marginBottom={1}>
        <text><strong><span fg="#00ffff">System Information</span></strong></text>
        <box marginTop={1} flexDirection="row">
          <box width={20}><text><span fg="#888888">Hostname:</span></text></box>
          <text>{systemInfo?.hostname ?? 'Loading...'}</text>
        </box>
        <box flexDirection="row">
          <box width={20}><text><span fg="#888888">Operating System:</span></text></box>
          <text>{systemInfo?.os ?? 'Loading...'}</text>
        </box>
        <box flexDirection="row">
          <box width={20}><text><span fg="#888888">Kernel:</span></text></box>
          <text>{systemInfo?.kernel ?? 'Loading...'}</text>
        </box>
        <box flexDirection="row">
          <box width={20}><text><span fg="#888888">Architecture:</span></text></box>
          <text>{systemInfo?.architecture ?? 'Loading...'}</text>
        </box>
        <box flexDirection="row">
          <box width={20}><text><span fg="#888888">Uptime:</span></text></box>
          <text>{systemInfo ? formatUptime(systemInfo.uptime) : 'Loading...'}</text>
        </box>
      </box>

      {/* Quick Metrics */}
      <box flexDirection="column" marginTop={1}>
        <text><strong><span fg="#00ffff">Quick Metrics</span></strong></text>
        {metrics.loading ? (
          <box>
            <Spinner color="#00ff00" />
            <text><span fg="#888888"> Loading metrics...</span></text>
          </box>
        ) : (
          <>
            <box marginTop={1} flexDirection="row">
              <box width={12}><text><span fg="#888888">CPU:</span></text></box>
              <text>
                <span fg={getPercentColor(cpuValue)}>
                  {progressBar(cpuValue)} {formatPercent(cpuValue)}
                </span>
              </text>
            </box>
            <box flexDirection="row">
              <box width={12}><text><span fg="#888888">Memory:</span></text></box>
              <text>
                <span fg={getPercentColor(memValue)}>
                  {progressBar(memValue)} {formatPercent(memValue)}
                </span>
              </text>
              <text>
                <span fg="#888888">
                  {' '}({formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)})
                </span>
              </text>
            </box>
            <box flexDirection="row">
              <box width={12}><text><span fg="#888888">Disk:</span></text></box>
              <text>
                <span fg={getPercentColor(diskValue)}>
                  {progressBar(diskValue)} {formatPercent(diskValue)}
                </span>
              </text>
              <text>
                <span fg="#888888">
                  {' '}({formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)})
                </span>
              </text>
            </box>
          </>
        )}
      </box>

      {/* Connection Info */}
      <box flexDirection="column" marginTop={1}>
        <text><strong><span fg="#00ffff">Connection</span></strong></text>
        <box marginTop={1} flexDirection="row">
          <box width={12}><text><span fg="#888888">Agent:</span></text></box>
          <text>{server.host}:{server.agentPort}</text>
        </box>
      </box>
    </box>
  );
}
