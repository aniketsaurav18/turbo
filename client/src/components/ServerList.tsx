// =============================================================================
// Server List Component
// =============================================================================

import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server } from '../types/types.js';
import { deleteServer } from '../db/database.js';
import { formatRelativeTime } from '../utils/format.js';
import { logger } from '../utils/logger.js';

interface ServerListProps {
  servers: Server[];
  onSelect: (server: Server) => void;
  onAdd: () => void;
  onEdit: (server: Server) => void;
  onRefresh: () => void;
}

export function ServerList({ servers, onSelect, onAdd, onEdit, onRefresh }: ServerListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useKeyboard((key) => {
    // Navigation
    if (key.name === 'up') {
      setSelectedIndex((i: number) => Math.max(0, i - 1));
      setConfirmDelete(null);
    }
    if (key.name === 'down') {
      setSelectedIndex((i: number) => Math.min(servers.length - 1, i + 1));
      setConfirmDelete(null);
    }

    // Select server
    if ((key.name === 'return') && servers.length > 0) {
      if (confirmDelete) {
        // Confirm deletion
        logger.info('Confirmed deletion of server', { id: confirmDelete });
        deleteServer(confirmDelete);
        setConfirmDelete(null);
        onRefresh();
      } else {
        const server = servers[selectedIndex];
        logger.info('User selected server from list', { index: selectedIndex, name: server?.name });
        onSelect(server!);
      }
    }

    // Add new server
    if (key.name === 'a' || key.name === 'n') {
      onAdd();
    }

    // Edit server
    if (key.name === 'e' && servers.length > 0) {
      const server = servers[selectedIndex];
      if (server) {
        onEdit(server);
      }
    }

    // Delete server
    if (key.name === 'd' && servers.length > 0) {
      const server = servers[selectedIndex];
      if (confirmDelete === server?.id) {
        logger.info('Deleting server', { id: server.id, name: server.name });
        deleteServer(server.id);
        setConfirmDelete(null);
        setSelectedIndex((i: number) => Math.max(0, i - 1));
        onRefresh();
      } else {
        logger.info('Requesting delete confirmation', { id: server?.id });
        setConfirmDelete(server?.id ?? null);
      }
    }

    // Cancel delete confirmation
    if (key.name === 'escape') {
      setConfirmDelete(null);
    }

    // Refresh
    if (key.name === 'r') {
      onRefresh();
    }
  });

  if (servers.length === 0) {
    return (
      <box flexDirection="column" padding={1}>
        <text><span fg="#ffff00">No servers configured.</span></text>
        <text><span fg="#888888">Press 'a' to add a new server.</span></text>
      </box>
    );
  }

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}><text><strong>Select a server:</strong></text></box>
      
      <box flexDirection="column">
        {servers.map((server, index) => {
          const isSelected = index === selectedIndex;
          const isDeleting = confirmDelete === server.id;
          
          return (
            <box key={server.id}>
              <text>
                <span fg={isSelected ? '#00ffff' : undefined}>
                  {isSelected ? '❯ ' : '  '}
                </span>
                {isSelected ? (
                  <strong>
                    <span fg={isDeleting ? '#ff0000' : '#00ffff'}>
                      {server.name}
                    </span>
                  </strong>
                ) : (
                  <span fg={isDeleting ? '#ff0000' : undefined}>
                    {server.name}
                  </span>
                )}
                <span fg="#888888"> ({server.username}@{server.host}:{server.port})</span>
                {server.lastConnected && (
                  <span fg="#888888"> • {formatRelativeTime(server.lastConnected)}</span>
                )}
                {isDeleting && (
                  <strong><span fg="#ff0000"> [Press 'd' again to delete, Esc to cancel]</span></strong>
                )}
              </text>
            </box>
          );
        })}
      </box>

      <box marginTop={1}>
        <text>
          <span fg="#888888">
            ↑↓ Navigate • Enter: Connect • a: Add • e: Edit • d: Delete • r: Refresh • q: Quit
          </span>
        </text>
      </box>
    </box>
  );
}
