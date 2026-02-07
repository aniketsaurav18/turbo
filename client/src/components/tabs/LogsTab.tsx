// =============================================================================
// Logs Tab Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Server, LogEntry, LogType } from '../../types/types.js';
import { getLogsForServer, clearLogsForServer } from '../../db/database.js';
import { formatDateTime } from '../../utils/format.js';

interface LogsTabProps {
  server: Server;
}

const LOG_TYPE_COLORS: Record<LogType, string> = {
  command: 'cyan',
  ssh: 'blue',
  update: 'green',
  docker: 'magenta',
  error: 'red',
  info: 'gray',
};

const LOG_TYPE_LABELS: Record<LogType, string> = {
  command: 'CMD',
  ssh: 'SSH',
  update: 'UPD',
  docker: 'DCK',
  error: 'ERR',
  info: 'INF',
};

export function LogsTab({ server }: LogsTabProps): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogType | 'all'>('all');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  const loadLogs = () => {
    const allLogs = getLogsForServer(server.id, 200);
    setLogs(allLogs);
  };

  useEffect(() => {
    loadLogs();
    // Refresh every 5 seconds
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, [server.id]);

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.type === filter);

  const visibleLogs = filteredLogs.slice(scrollOffset, scrollOffset + 15);

  useInput((input, key) => {
    // Scroll
    if (key.upArrow) {
      setScrollOffset(o => Math.max(0, o - 1));
    }
    if (key.downArrow) {
      setScrollOffset(o => Math.min(Math.max(0, filteredLogs.length - 15), o + 1));
    }
    if (key.pageUp) {
      setScrollOffset(o => Math.max(0, o - 10));
    }
    if (key.pageDown) {
      setScrollOffset(o => Math.min(Math.max(0, filteredLogs.length - 15), o + 10));
    }

    // Filter by type
    if (input === '1') setFilter('all');
    if (input === '2') setFilter('command');
    if (input === '3') setFilter('ssh');
    if (input === '4') setFilter('update');
    if (input === '5') setFilter('docker');
    if (input === '6') setFilter('error');

    // Clear logs
    if (input === 'c') {
      if (confirmClear) {
        clearLogsForServer(server.id);
        loadLogs();
        setConfirmClear(false);
        setScrollOffset(0);
      } else {
        setConfirmClear(true);
      }
    }
    
    if (key.escape) {
      setConfirmClear(false);
    }

    // Refresh
    if (input === 'r') {
      loadLogs();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header and Filters */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Session History</Text>
        <Text dimColor> ({filteredLogs.length} entries)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Filter: </Text>
        {(['all', 'command', 'ssh', 'update', 'docker', 'error'] as const).map((type, i) => (
          <Text key={type}>
            <Text 
              color={filter === type ? 'cyan' : 'gray'}
              bold={filter === type}
            >
              [{i + 1}] {type === 'all' ? 'All' : LOG_TYPE_LABELS[type]}
            </Text>
            <Text> </Text>
          </Text>
        ))}
      </Box>

      {/* Log Entries */}
      <Box flexDirection="column" flexGrow={1}>
        {filteredLogs.length === 0 ? (
          <Text dimColor>No logs recorded for this server.</Text>
        ) : (
          visibleLogs.map((log, i) => (
            <Box key={log.id}>
              <Box width={16}>
                <Text dimColor>{formatDateTime(log.timestamp)}</Text>
              </Box>
              <Box width={6}>
                <Text color={LOG_TYPE_COLORS[log.type] as any}>
                  [{LOG_TYPE_LABELS[log.type]}]
                </Text>
              </Box>
              <Box>
                <Text>{log.content.slice(0, 60)}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>

      {/* Scroll indicator */}
      {filteredLogs.length > 15 && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + 15, filteredLogs.length)} of {filteredLogs.length}
          </Text>
        </Box>
      )}

      {/* Clear confirmation */}
      {confirmClear && (
        <Box marginTop={1}>
          <Text color="yellow">Press 'c' again to clear all logs, or Esc to cancel</Text>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓: Scroll | 1-6: Filter | r: Refresh | c: Clear
        </Text>
      </Box>
    </Box>
  );
}
