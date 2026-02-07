// =============================================================================
// Updates Tab Component
// =============================================================================

import { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server, PackageUpdate } from '../../types/types.js';
import { getAgentUpdates, applyUpdate, applyAllUpdates } from '../../utils/agent.js';
import { executeCommand } from '../../utils/ssh.js';
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
  const [distro, setDistro] = useState<'apt' | 'yum' | 'unknown'>('unknown');

  const detectDistro = async (): Promise<'apt' | 'yum' | 'unknown'> => {
    try {
      const aptResult = await executeCommand(server, 'which apt 2>/dev/null');
      if (aptResult.exitCode === 0 && aptResult.stdout.trim()) return 'apt';
      
      const yumResult = await executeCommand(server, 'which yum 2>/dev/null');
      if (yumResult.exitCode === 0 && yumResult.stdout.trim()) return 'yum';
    } catch {
      // Ignore
    }
    return 'unknown';
  };

  const loadUpdates = async () => {
    setLoading(true);
    setError(null);

    try {
      // Try agent first
      const agentUpdates = await getAgentUpdates(server);
      setUpdates(agentUpdates);
    } catch {
      // Fallback to SSH
      try {
        const detectedDistro = await detectDistro();
        setDistro(detectedDistro);

        if (detectedDistro === 'apt') {
          // Refresh package cache
          await executeCommand(server, 'sudo apt update -qq 2>/dev/null');
          
          // List upgradable packages
          const result = await executeCommand(server, 'apt list --upgradable 2>/dev/null | tail -n +2');
          
          if (result.exitCode === 0) {
            const pkgs: PackageUpdate[] = result.stdout
              .split('\n')
              .filter(Boolean)
              .map(line => {
                // Format: package/source version [upgradable from: old_version]
                const match = line.match(/^([^\/]+)\/\S+\s+(\S+).*\[upgradable from: ([^\]]+)\]/);
                if (match) {
                  return {
                    name: match[1]!,
                    newVersion: match[2]!,
                    currentVersion: match[3]!,
                  };
                }
                return null;
              })
              .filter((p): p is PackageUpdate => p !== null);
            
            setUpdates(pkgs);
          }
        } else if (detectedDistro === 'yum') {
          const result = await executeCommand(server, 'yum check-update --quiet 2>/dev/null | grep -v "^$" | head -50');
          
          if (result.exitCode === 0 || result.exitCode === 100) { // 100 means updates available
            const pkgs: PackageUpdate[] = result.stdout
              .split('\n')
              .filter(line => line.trim() && !line.startsWith('Obsoleting'))
              .map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                  return {
                    name: parts[0]!.replace(/\.\w+$/, ''), // Remove arch suffix
                    newVersion: parts[1]!,
                    currentVersion: 'installed',
                  };
                }
                return null;
              })
              .filter((p): p is PackageUpdate => p !== null);
            
            setUpdates(pkgs);
          }
        } else {
          setError('Could not detect package manager (apt/yum)');
        }
      } catch (sshErr) {
        setError(sshErr instanceof Error ? sshErr.message : 'Failed to check updates');
      }
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
      // Try agent first
      try {
        await applyUpdate(server, packageName);
      } catch {
        // Fallback to SSH
        const cmd = distro === 'apt' 
          ? `sudo apt install -y ${packageName}` 
          : `sudo yum update -y ${packageName}`;
        await executeCommand(server, cmd);
      }
      
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
      // Try agent first
      try {
        await applyAllUpdates(server);
      } catch {
        // Fallback to SSH
        const cmd = distro === 'apt' ? 'sudo apt upgrade -y' : 'sudo yum update -y';
        await executeCommand(server, cmd);
      }
      
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
        {distro !== 'unknown' && <text><span fg="#888888"> • {distro}</span></text>}
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
