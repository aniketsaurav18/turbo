// =============================================================================
// Updates Tab Component
// =============================================================================

import { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server, PackageUpdate } from '../../types/types.js';
import { getAgentUpdates, applyUpdate, applyAllUpdates } from '../../utils/agent.js';
import { addLogEntry } from '../../db/database.js';
import { logger } from '../../utils/logger.js';
import { Spinner } from '../Spinner.js';

interface UpdatesTabProps {
  server: Server;
}

export function UpdatesTab({ server }: UpdatesTabProps) {
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<PackageUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null); // package name being updated

  const loadUpdates = async () => {
    setLoading(true);
    setError(null);
    logger.info('Loading updates', { serverId: server.id });

    try {
      const agentUpdates = await getAgentUpdates(server);
      logger.info('Got updates from agent', { serverId: server.id, count: agentUpdates.length });
      setUpdates(agentUpdates);
    } catch (err) {
      logger.error('Failed to load updates', { serverId: server.id, error: err });
      setError(err instanceof Error ? err.message : 'Failed to check updates');
    }

    setLoading(false);
  };

  useEffect(() => {
    loadUpdates();
  }, [server.id]);

  useKeyboard((key) => {
    if (loading || updating) return;

    if (key.name === 'up') {
      setSelectedIndex(i => Math.max(0, i - 1));
    }
    if (key.name === 'down') {
      setSelectedIndex(i => Math.min(updates.length - 1, i + 1));
    }
    
    // Update selected package
    if (key.name === 'u' && updates[selectedIndex]) {
      handleUpdate(updates[selectedIndex]!.name);
    }
    
    // Update all
    if (key.name === 'a' && updates.length > 0) {
      handleUpdateAll();
    }

    // Refresh
    if (key.name === 'r') {
      loadUpdates();
    }
  });

  const handleUpdate = async (packageName: string) => {
    setUpdating(packageName);
    
    try {
      await applyUpdate(server, packageName);
      addLogEntry(server.id, 'update', `Updated package: ${packageName}`);
      await loadUpdates();
      logger.info('Package updated successfully', { server: server.id, package: packageName });
    } catch (err) {
      logger.error('Package update failed', { server: server.id, package: packageName, error: err });
      setError(err instanceof Error ? err.message : 'Update failed');
    }
    
    setUpdating(null);
  };

  const handleUpdateAll = async () => {
    setUpdating('all');
    
    try {
      await applyAllUpdates(server);
      addLogEntry(server.id, 'update', 'Applied all available updates');
      await loadUpdates();
      logger.info('All updates applied successfully', { server: server.id });
    } catch (err) {
      logger.error('Failed to apply all updates', { server: server.id, error: err });
      setError(err instanceof Error ? err.message : 'Update all failed');
    }
    
    setUpdating(null);
  };

  if (loading) {
    return (
      <box padding={1}>
        <Spinner color="#00ff00" />
        <text> Checking for updates...</text>
      </box>
    );
  }

  if (error) {
    return (
      <box flexDirection="column" padding={1}>
        <text><span fg="#ff0000">✗ {error}</span></text>
        <text><span fg="#888888">Press 'r' to retry.</span></text>
      </box>
    );
  }

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text><strong><span fg="#00ffff">Available Updates</span></strong></text>
        <text><span fg="#888888"> ({updates.length} packages)</span></text>
      </box>

      {updates.length === 0 ? (
        <box flexDirection="column">
          <text><span fg="#00ff00">✓ System is up to date!</span></text>
          <text><span fg="#888888">Press 'r' to check again.</span></text>
        </box>
      ) : (
        <>
          {/* Header */}
          <box>
            <box width={3}><text><span fg="#888888"> </span></text></box>
            <box width={30}><text><strong><span fg="#888888">PACKAGE</span></strong></text></box>
            <box width={20}><text><strong><span fg="#888888">CURRENT</span></strong></text></box>
            <box><text><strong><span fg="#888888">AVAILABLE</span></strong></text></box>
          </box>

          {/* Package List */}
          {updates.map((pkg, i) => {
            const isSelected = i === selectedIndex;
            const isUpdating = updating === pkg.name;
            
            return (
              <box key={pkg.name}>
                <box width={3}>
                  <text><span fg={isSelected ? '#00ffff' : undefined}>{isSelected ? '❯ ' : '  '}</span></text>
                </box>
                <box width={30}>
                  <text>{isSelected ? <strong>{pkg.name.slice(0, 28)}</strong> : pkg.name.slice(0, 28)}</text>
                </box>
                <box width={20}>
                  <text><span fg="#888888">{pkg.currentVersion.slice(0, 18)}</span></text>
                </box>
                <box>
                  <text><span fg="#00ff00">{pkg.newVersion.slice(0, 20)}</span></text>
                  {isUpdating && (
                    <box marginLeft={1}><Spinner color="#ffff00" /></box>
                  )}
                </box>
              </box>
            );
          })}

          {/* Help */}
          <box marginTop={1}>
            <text>
              <span fg="#888888">
                ↑↓: Navigate | u: Update selected | a: Update all | r: Refresh
              </span>
            </text>
            {updating === 'all' && (
              <box marginLeft={1}>
                <Spinner color="#ffff00" />
                <text> Updating all packages...</text>
              </box>
            )}
          </box>
        </>
      )}
    </box>
  );
}
