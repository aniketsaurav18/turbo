// =============================================================================
// Logs Tab Component
// =============================================================================

import { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server, LogEntry, LogType } from '../../types/types.js';
import { getLogsForServer, clearLogsForServer } from '../../db/database.js';
import { formatDateTime } from '../../utils/format.js';

interface LogsTabProps {
  server: Server;
}

const LOG_TYPE_COLORS: Record<LogType, string> = {
  command: '#00ffff',
  ssh: '#0088ff',
  update: '#00ff00',
  docker: '#ff00ff',
  error: '#ff0000',
  info: '#888888',
};

const LOG_TYPE_LABELS: Record<LogType, string> = {
  command: 'CMD',
  ssh: 'SSH',
  update: 'UPD',
  docker: 'DCK',
  error: 'ERR',
  info: 'INF',
};

export function LogsTab({ server }: LogsTabProps) {
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

  useKeyboard((key) => {
    // Scroll
    if (key.name === 'up') {
      setScrollOffset(o => Math.max(0, o - 1));
    }
    if (key.name === 'down') {
      setScrollOffset(o => Math.min(Math.max(0, filteredLogs.length - 15), o + 1));
    }
    if (key.name === 'pageup') {
      setScrollOffset(o => Math.max(0, o - 10));
    }
    if (key.name === 'pagedown') {
      setScrollOffset(o => Math.min(Math.max(0, filteredLogs.length - 15), o + 10));
    }

    // Filter by type
    if (key.name === '1') setFilter('all');
    if (key.name === '2') setFilter('command');
    if (key.name === '3') setFilter('ssh');
    if (key.name === '4') setFilter('update');
    if (key.name === '5') setFilter('docker');
    if (key.name === '6') setFilter('error');

    // Clear logs
    if (key.name === 'c') {
      if (confirmClear) {
        clearLogsForServer(server.id);
        loadLogs();
        setConfirmClear(false);
        setScrollOffset(0);
      } else {
        setConfirmClear(true);
      }
    }
    
    if (key.name === 'escape') {
      setConfirmClear(false);
    }

    // Refresh
    if (key.name === 'r') {
      loadLogs();
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      {/* Header and Filters */}
      <box marginBottom={1}>
        <text><strong><span fg="#00ffff">Session History</span></strong></text>
        <text><span fg="#888888"> ({filteredLogs.length} entries)</span></text>
      </box>

      <box marginBottom={1}>
        <text><span fg="#888888">Filter: </span></text>
        {(['all', 'command', 'ssh', 'update', 'docker', 'error'] as const).map((type, i) => (
          <text key={type}>
            {filter === type ? (
              <strong><span fg="#00ffff">[{i + 1}] {type === 'all' ? 'All' : LOG_TYPE_LABELS[type]}</span></strong>
            ) : (
              <span fg="#888888">[{i + 1}] {type === 'all' ? 'All' : LOG_TYPE_LABELS[type]}</span>
            )}
            <span> </span>
          </text>
        ))}
      </box>

      {/* Log Entries */}
      <box flexDirection="column" flexGrow={1}>
        {filteredLogs.length === 0 ? (
          <text><span fg="#888888">No logs recorded for this server.</span></text>
        ) : (
          visibleLogs.map((log) => (
            <box key={log.id} flexDirection="row">
              <box width={16}>
                <text><span fg="#888888">{formatDateTime(log.timestamp)}</span></text>
              </box>
              <box width={6}>
                <text><span fg={LOG_TYPE_COLORS[log.type]}>[{LOG_TYPE_LABELS[log.type]}]</span></text>
              </box>
              <box>
                <text>{log.content.slice(0, 60)}</text>
              </box>
            </box>
          ))
        )}
      </box>

      {/* Scroll indicator */}
      {filteredLogs.length > 15 && (
        <box marginTop={1}>
          <text>
            <span fg="#888888">
              Showing {scrollOffset + 1}-{Math.min(scrollOffset + 15, filteredLogs.length)} of {filteredLogs.length}
            </span>
          </text>
        </box>
      )}

      {/* Clear confirmation */}
      {confirmClear && (
        <box marginTop={1}>
          <text><span fg="#ffff00">Press 'c' again to clear all logs, or Esc to cancel</span></text>
        </box>
      )}

      {/* Help */}
      <box marginTop={1}>
        <text>
          <span fg="#888888">
            ↑↓: Scroll | 1-6: Filter | r: Refresh | c: Clear
          </span>
        </text>
      </box>
    </box>
  );
}
