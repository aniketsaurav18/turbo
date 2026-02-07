// =============================================================================
// Overview Tab Component
// =============================================================================

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { Server } from '../../types/types.js';
import { useConnection, useMetrics } from '../../hooks/hooks.js';
import { formatUptime, formatBytes, formatPercent, progressBar, getPercentColor } from '../../utils/format.js';

interface OverviewTabProps {
  server: Server;
}

export function OverviewTab({ server }: OverviewTabProps): React.ReactElement {
  const { status, systemInfo, error } = useConnection(server);
  const metrics = useMetrics(server, 60000); // Poll every 60 seconds

  if (status === 'connecting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="green"><Spinner type="dots" /></Text>
          {' '}Connecting to {server.host}...
        </Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Connection failed: {error}</Text>
        <Text dimColor>Check SSH key and network connectivity.</Text>
      </Box>
    );
  }

  const cpuValue = metrics.cpu || 0;
  const memValue = metrics.memory.total > 0 ? (metrics.memory.used / metrics.memory.total * 100) : 0;
  const diskValue = metrics.disk.total > 0 ? (metrics.disk.used / metrics.disk.total * 100) : 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* System Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">System Information</Text>
        <Box marginTop={1}>
          <Box width={20}><Text dimColor>Hostname:</Text></Box>
          <Text>{systemInfo?.hostname ?? 'Loading...'}</Text>
        </Box>
        <Box>
          <Box width={20}><Text dimColor>Operating System:</Text></Box>
          <Text>{systemInfo?.os ?? 'Loading...'}</Text>
        </Box>
        <Box>
          <Box width={20}><Text dimColor>Kernel:</Text></Box>
          <Text>{systemInfo?.kernel ?? 'Loading...'}</Text>
        </Box>
        <Box>
          <Box width={20}><Text dimColor>Architecture:</Text></Box>
          <Text>{systemInfo?.architecture ?? 'Loading...'}</Text>
        </Box>
        <Box>
          <Box width={20}><Text dimColor>Uptime:</Text></Box>
          <Text>{systemInfo ? formatUptime(systemInfo.uptime) : 'Loading...'}</Text>
        </Box>
      </Box>

      {/* Quick Metrics */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">Quick Metrics</Text>
        {metrics.loading ? (
          <Text dimColor>
            <Spinner type="dots" /> Loading metrics...
          </Text>
        ) : (
          <>
            <Box marginTop={1}>
              <Box width={12}><Text dimColor>CPU:</Text></Box>
              <Text color={getPercentColor(cpuValue)}>
                {progressBar(cpuValue)} {formatPercent(cpuValue)}
              </Text>
            </Box>
            <Box>
              <Box width={12}><Text dimColor>Memory:</Text></Box>
              <Text color={getPercentColor(memValue)}>
                {progressBar(memValue)} {formatPercent(memValue)}
              </Text>
              <Text dimColor>
                {' '}({formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)})
              </Text>
            </Box>
            <Box>
              <Box width={12}><Text dimColor>Disk:</Text></Box>
              <Text color={getPercentColor(diskValue)}>
                {progressBar(diskValue)} {formatPercent(diskValue)}
              </Text>
              <Text dimColor>
                {' '}({formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)})
              </Text>
            </Box>
          </>
        )}
      </Box>

      {/* Connection Info */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">Connection</Text>
        <Box marginTop={1}>
          <Box width={12}><Text dimColor>SSH:</Text></Box>
          <Text>{server.username}@{server.host}:{server.port}</Text>
        </Box>
      </Box>
    </Box>
  );
}
