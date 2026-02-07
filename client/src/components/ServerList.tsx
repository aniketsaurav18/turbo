// =============================================================================
// Server List Component
// =============================================================================

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Server } from '../types/types.js';
import { deleteServer } from '../db/database.js';
import { formatRelativeTime } from '../utils/format.js';

interface ServerListProps {
  servers: Server[];
  onSelect: (server: Server) => void;
  onAdd: () => void;
  onEdit: (server: Server) => void;
  onRefresh: () => void;
}

export function ServerList({ servers, onSelect, onAdd, onEdit, onRefresh }: ServerListProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useInput((input, key) => {
    // Navigation
    if (key.upArrow) {
      setSelectedIndex((i: number) => Math.max(0, i - 1));
      setConfirmDelete(null);
    }
    if (key.downArrow) {
      setSelectedIndex((i: number) => Math.min(servers.length - 1, i + 1));
      setConfirmDelete(null);
    }

    // Select server
    if (key.return && servers.length > 0) {
      if (confirmDelete) {
        // Confirm deletion
        deleteServer(confirmDelete);
        setConfirmDelete(null);
        onRefresh();
      } else {
        onSelect(servers[selectedIndex]!);
      }
    }

    // Add new server
    if (input === 'a' || input === 'n') {
      onAdd();
    }

    // Edit server
    if (input === 'e' && servers.length > 0) {
      const server = servers[selectedIndex];
      if (server) {
        onEdit(server);
      }
    }

    // Delete server
    if (input === 'd' && servers.length > 0) {
      const server = servers[selectedIndex];
      if (confirmDelete === server?.id) {
        deleteServer(server.id);
        setConfirmDelete(null);
        setSelectedIndex((i: number) => Math.max(0, i - 1));
        onRefresh();
      } else {
        setConfirmDelete(server?.id ?? null);
      }
    }

    // Cancel delete confirmation
    if (key.escape) {
      setConfirmDelete(null);
    }

    // Refresh
    if (input === 'r') {
      onRefresh();
    }
  });

  if (servers.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No servers configured.</Text>
        <Text dimColor>Press 'a' to add a new server.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold>Select a server:</Text></Box>
      
      <Box flexDirection="column">
        {servers.map((server, index) => {
          const isSelected = index === selectedIndex;
          const isDeleting = confirmDelete === server.id;
          
          return (
            <Box key={server.id}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '❯ ' : '  '}
              </Text>
              <Text 
                bold={isSelected}
                color={isDeleting ? 'red' : isSelected ? 'cyan' : undefined}
              >
                {server.name}
              </Text>
              <Text dimColor> ({server.username}@{server.host}:{server.port})</Text>
              {server.lastConnected && (
                <Text dimColor> • {formatRelativeTime(server.lastConnected)}</Text>
              )}
              {isDeleting && (
                <Text color="red" bold> [Press 'd' again to delete, Esc to cancel]</Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ Navigate • Enter: Connect • a: Add • e: Edit • d: Delete • r: Refresh • q: Quit
        </Text>
      </Box>
    </Box>
  );
}
