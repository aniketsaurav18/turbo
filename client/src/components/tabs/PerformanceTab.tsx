// =============================================================================
// Performance Tab Component
// =============================================================================

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { Server } from '../../types/types.js';
import { useConnection, useMetrics } from '../../hooks/hooks.js';
import { 
  formatBytes, 
  formatPercent, 
  progressBar, 
  getPercentColor 
} from '../../utils/format.js';

interface PerformanceTabProps {
  server: Server;
}

export function PerformanceTab({ server }: PerformanceTabProps): React.ReactElement {
  const { status, error } = useConnection(server);
  const metrics = useMetrics(server, 60000); // Poll every 60 seconds

  if (status === 'connecting') {
    return (
      <Box padding={1}>
        <Text>
          <Text color="green"><Spinner type="dots" /></Text>
          {' '}Loading performance data...
        </Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ Failed to load metrics: {error}</Text>
      </Box>
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
    <Box flexDirection="column" padding={1}>
      {/* Data Source Indicator */}
      <Box marginBottom={1}>
        <Text dimColor>
          Data source: SSH (polling every 2s)
          {!metrics.loading && ' | Live'}
        </Text>
      </Box>

      {metrics.loading ? (
        <Text>
          <Spinner type="dots" /> Loading metrics...
        </Text>
      ) : (
        <>
          {/* CPU */}
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">CPU Usage</Text>
            <Box marginTop={1}>
              <Box width={40}>
                <Text color={getPercentColor(cpuPercent)}>
                  {progressBar(cpuPercent, 30)} {formatPercent(cpuPercent)}
                </Text>
              </Box>
            </Box>
          </Box>

          {/* Memory */}
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">Memory Usage</Text>
            <Box marginTop={1}>
              <Box width={40}>
                <Text color={getPercentColor(memPercent)}>
                  {progressBar(memPercent, 30)} {formatPercent(memPercent)}
                </Text>
              </Box>
            </Box>
            <Text dimColor>
              {formatBytes(memUsed)} used / {formatBytes(memTotal)} total
              {memTotal > 0 && ` • ${formatBytes(memTotal - memUsed)} free`}
            </Text>
          </Box>

          {/* Disk */}
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">Disk Usage (/)</Text>
            <Box marginTop={1}>
              <Box width={40}>
                <Text color={getPercentColor(diskPercent)}>
                  {progressBar(diskPercent, 30)} {formatPercent(diskPercent)}
                </Text>
              </Box>
            </Box>
            <Text dimColor>
              {formatBytes(diskUsed)} used / {formatBytes(diskTotal)} total
              {diskTotal > 0 && ` • ${formatBytes(diskTotal - diskUsed)} free`}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
