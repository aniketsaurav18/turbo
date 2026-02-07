// =============================================================================
// Docker Tab Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { Server, DockerContainer, DockerImage, DockerStatus } from '../../types/types.js';
import { getAgentDocker, startContainer, stopContainer } from '../../utils/agent.js';
import { executeCommand } from '../../utils/ssh.js';
import { formatBytes, truncate, getContainerStatusColor } from '../../utils/format.js';

interface DockerTabProps {
  server: Server;
}

type DockerView = 'containers' | 'images';

export function DockerTab({ server }: DockerTabProps): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null);
  const [view, setView] = useState<DockerView>('containers');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionInProgress, setActionInProgress] = useState(false);

  const loadDockerStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      // Try agent first
      const status = await getAgentDocker(server);
      setDockerStatus(status);
    } catch {
      // Fallback to SSH
      try {
        const result = await executeCommand(server, 'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}"');
        
        if (result.exitCode !== 0) {
          // Docker might not be installed
          if (result.stderr.includes('not found') || result.stderr.includes('command not found')) {
            setDockerStatus({ installed: false, containers: [], images: [] });
          } else {
            setError(result.stderr || 'Failed to get Docker status');
          }
        } else {
          const containers: DockerContainer[] = result.stdout
            .split('\n')
            .filter(Boolean)
            .map(line => {
              const [id, name, image, status, state] = line.split('|');
              return {
                id: id || '',
                name: name || '',
                image: image || '',
                status: status || '',
                state: (state as DockerContainer['state']) || 'exited',
                ports: [],
                created: '',
              };
            });

          // Get images too
          const imagesResult = await executeCommand(server, 'docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}"');
          const images: DockerImage[] = imagesResult.stdout
            .split('\n')
            .filter(Boolean)
            .map(line => {
              const [id, repo, tag, size] = line.split('|');
              return {
                id: id || '',
                repository: repo || '',
                tag: tag || '',
                size: parseFloat(size || '0') * 1024 * 1024, // Approximate
                created: '',
              };
            });

          setDockerStatus({ installed: true, containers, images });
        }
      } catch (sshErr) {
        setError(sshErr instanceof Error ? sshErr.message : 'Failed to check Docker');
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadDockerStatus();
  }, [server.id]);

  const items = view === 'containers' 
    ? dockerStatus?.containers ?? [] 
    : dockerStatus?.images ?? [];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(items.length - 1, i + 1));
    }
    
    // Toggle view
    if (key.tab || input === 'v') {
      setView(v => v === 'containers' ? 'images' : 'containers');
      setSelectedIndex(0);
    }

    // Refresh
    if (input === 'r') {
      loadDockerStatus();
    }

    // Start/Stop container
    if (input === 's' && view === 'containers' && dockerStatus?.containers[selectedIndex]) {
      handleContainerAction(dockerStatus.containers[selectedIndex]!);
    }
  });

  const handleContainerAction = async (container: DockerContainer) => {
    setActionInProgress(true);
    try {
      if (container.state === 'running') {
        await stopContainer(server, container.id);
      } else {
        await startContainer(server, container.id);
      }
      await loadDockerStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
    setActionInProgress(false);
  };

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Text color="green"><Spinner type="dots" /></Text>
          {' '}Loading Docker status...
        </Text>
      </Box>
    );
  }

  if (!dockerStatus?.installed) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">⚠ Docker is not installed on this server</Text>
        <Text dimColor>Install Docker to manage containers here.</Text>
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
      {/* View Toggle */}
      <Box marginBottom={1}>
        <Text 
          bold={view === 'containers'} 
          color={view === 'containers' ? 'cyan' : 'gray'}
        >
          Containers ({dockerStatus.containers.length})
        </Text>
        <Text> | </Text>
        <Text 
          bold={view === 'images'} 
          color={view === 'images' ? 'cyan' : 'gray'}
        >
          Images ({dockerStatus.images.length})
        </Text>
        <Text dimColor> (Tab or 'v' to switch)</Text>
      </Box>

      {/* Container List */}
      {view === 'containers' && (
        <Box flexDirection="column">
          {dockerStatus.containers.length === 0 ? (
            <Text dimColor>No containers found.</Text>
          ) : (
            <>
              {/* Header */}
              <Box>
                <Box width={3}><Text dimColor> </Text></Box>
                <Box width={20}><Text bold dimColor>NAME</Text></Box>
                <Box width={25}><Text bold dimColor>IMAGE</Text></Box>
                <Box width={10}><Text bold dimColor>STATE</Text></Box>
                <Box><Text bold dimColor>STATUS</Text></Box>
              </Box>
              
              {dockerStatus.containers.map((container, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <Box key={container.id}>
                    <Box width={3}>
                      <Text color={isSelected ? 'cyan' : undefined}>
                        {isSelected ? '❯ ' : '  '}
                      </Text>
                    </Box>
                    <Box width={20}>
                      <Text bold={isSelected}>{truncate(container.name, 18)}</Text>
                    </Box>
                    <Box width={25}>
                      <Text>{truncate(container.image, 23)}</Text>
                    </Box>
                    <Box width={10}>
                      <Text color={getContainerStatusColor(container.state)}>
                        {container.state}
                      </Text>
                    </Box>
                    <Box>
                      <Text dimColor>{container.status}</Text>
                    </Box>
                  </Box>
                );
              })}
            </>
          )}
        </Box>
      )}

      {/* Image List */}
      {view === 'images' && (
        <Box flexDirection="column">
          {dockerStatus.images.length === 0 ? (
            <Text dimColor>No images found.</Text>
          ) : (
            <>
              {/* Header */}
              <Box>
                <Box width={3}><Text dimColor> </Text></Box>
                <Box width={30}><Text bold dimColor>REPOSITORY</Text></Box>
                <Box width={15}><Text bold dimColor>TAG</Text></Box>
                <Box><Text bold dimColor>SIZE</Text></Box>
              </Box>
              
              {dockerStatus.images.map((image, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <Box key={image.id}>
                    <Box width={3}>
                      <Text color={isSelected ? 'cyan' : undefined}>
                        {isSelected ? '❯ ' : '  '}
                      </Text>
                    </Box>
                    <Box width={30}>
                      <Text bold={isSelected}>{truncate(image.repository, 28)}</Text>
                    </Box>
                    <Box width={15}>
                      <Text>{truncate(image.tag, 13)}</Text>
                    </Box>
                    <Box>
                      <Text dimColor>{formatBytes(image.size)}</Text>
                    </Box>
                  </Box>
                );
              })}
            </>
          )}
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓: Navigate | Tab: Switch view | r: Refresh
          {view === 'containers' && ' | s: Start/Stop'}
        </Text>
        {actionInProgress && (
          <Text color="yellow">
            {' '}<Spinner type="dots" /> Processing...
          </Text>
        )}
      </Box>
    </Box>
  );
}
