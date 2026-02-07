// =============================================================================
// Updates Tab Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { Server, PackageUpdate } from '../../types/types.js';
import { getAgentUpdates, applyUpdate, applyAllUpdates } from '../../utils/agent.js';
import { executeCommand } from '../../utils/ssh.js';
import { addLogEntry } from '../../db/database.js';

interface UpdatesTabProps {
  server: Server;
}

export function UpdatesTab({ server }: UpdatesTabProps): React.ReactElement {
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

  useInput((input, key) => {
    if (loading || updating) return;

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(updates.length - 1, i + 1));
    }
    
    // Update selected package
    if (input === 'u' && updates[selectedIndex]) {
      handleUpdate(updates[selectedIndex]!.name);
    }
    
    // Update all
    if (input === 'a' && updates.length > 0) {
      handleUpdateAll();
    }

    // Refresh
    if (input === 'r') {
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
    } catch (err) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update all failed');
    }
    
    setUpdating(null);
  };

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Text color="green"><Spinner type="dots" /></Text>
          {' '}Checking for updates...
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ {error}</Text>
        <Text dimColor>Press 'r' to retry.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Available Updates</Text>
        <Text dimColor> ({updates.length} packages)</Text>
        {distro !== 'unknown' && <Text dimColor> • {distro}</Text>}
      </Box>

      {updates.length === 0 ? (
        <Box flexDirection="column">
          <Text color="green">✓ System is up to date!</Text>
          <Text dimColor>Press 'r' to check again.</Text>
        </Box>
      ) : (
        <>
          {/* Header */}
          <Box>
            <Box width={3}><Text dimColor> </Text></Box>
            <Box width={30}><Text bold dimColor>PACKAGE</Text></Box>
            <Box width={20}><Text bold dimColor>CURRENT</Text></Box>
            <Box><Text bold dimColor>AVAILABLE</Text></Box>
          </Box>

          {/* Package List */}
          {updates.map((pkg, i) => {
            const isSelected = i === selectedIndex;
            const isUpdating = updating === pkg.name;
            
            return (
              <Box key={pkg.name}>
                <Box width={3}>
                  <Text color={isSelected ? 'cyan' : undefined}>
                    {isSelected ? '❯ ' : '  '}
                  </Text>
                </Box>
                <Box width={30}>
                  <Text bold={isSelected}>{pkg.name.slice(0, 28)}</Text>
                </Box>
                <Box width={20}>
                  <Text dimColor>{pkg.currentVersion.slice(0, 18)}</Text>
                </Box>
                <Box>
                  <Text color="green">{pkg.newVersion.slice(0, 20)}</Text>
                  {isUpdating && (
                    <Text color="yellow"> <Spinner type="dots" /></Text>
                  )}
                </Box>
              </Box>
            );
          })}

          {/* Help */}
          <Box marginTop={1}>
            <Text dimColor>
              ↑↓: Navigate | u: Update selected | a: Update all | r: Refresh
            </Text>
            {updating === 'all' && (
              <Text color="yellow">
                {' '}<Spinner type="dots" /> Updating all packages...
              </Text>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
