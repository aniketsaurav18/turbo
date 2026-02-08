// =============================================================================
// Docker Tab Component
// =============================================================================

import { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server, DockerContainer, DockerImage } from '../../types/types.js';
import { getAgentDocker, startContainer, stopContainer } from '../../utils/agent.js';
import { executeCommand } from '../../utils/ssh.js';
import { formatBytes } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { Spinner } from '../Spinner.js';

interface DockerTabProps {
  server: Server;
}

type DockerView = 'containers' | 'images';

export function DockerTab({ server }: DockerTabProps) {
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [dockerInstalled, setDockerInstalled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<DockerView>('containers');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadDockerData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Try agent first
      const status = await getAgentDocker(server);
      setContainers(status.containers);
      setImages(status.images);
      setDockerInstalled(status.installed);
    } catch {
      // Fallback to SSH
      try {
        // Check if docker is installed
        const checkResult = await executeCommand(server, 'which docker 2>/dev/null');
        if (checkResult.exitCode !== 0) {
          setDockerInstalled(false);
          setLoading(false);
          return;
        }

        // Get containers
        const containersResult = await executeCommand(server, 
          'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}"'
        );
        
        if (containersResult.exitCode === 0) {
          const containerList: DockerContainer[] = containersResult.stdout
            .split('\n')
            .filter(Boolean)
            .map(line => {
              const [id, name, image, status, state] = line.split('|');
              return {
                id: id ?? '',
                name: name ?? '',
                image: image ?? '',
                status: status ?? '',
                state: (state ?? 'created') as DockerContainer['state'],
                ports: [],
                created: '',
              };
            });
          setContainers(containerList);
        }

        // Get images
        const imagesResult = await executeCommand(server,
          'docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}"'
        );
        
        if (imagesResult.exitCode === 0) {
          const imageList: DockerImage[] = imagesResult.stdout
            .split('\n')
            .filter(Boolean)
            .map(line => {
              const [id, repo, tag, size] = line.split('|');
              return {
                id: id ?? '',
                repository: repo ?? '',
                tag: tag ?? '',
                size: parseInt(size ?? '0', 10) || 0,
                created: '',
              };
            });
          setImages(imageList);
        }
      } catch (sshErr) {
        setError(sshErr instanceof Error ? sshErr.message : 'Failed to get Docker info');
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadDockerData();
  }, [server.id]);

  const currentList = view === 'containers' ? containers : images;

  useKeyboard((key) => {
    if (loading || actionLoading) return;

    // Navigation
    if (key.name === 'up') {
      setSelectedIndex(i => Math.max(0, i - 1));
    }
    if (key.name === 'down') {
      setSelectedIndex(i => Math.min(currentList.length - 1, i + 1));
    }

    // Switch view
    if (key.name === 'tab' || key.name === 'c') {
      setView(view === 'containers' ? 'images' : 'containers');
      setSelectedIndex(0);
    }

    // Refresh
    if (key.name === 'r') {
      loadDockerData();
    }

    // Start/Stop container
    if ((key.name === 's' || key.name === 'return') && view === 'containers' && containers[selectedIndex]) {
      const container = containers[selectedIndex]!;
      handleContainerAction(container);
    }
  });

  const handleContainerAction = async (container: DockerContainer) => {
    setActionLoading(container.id);
    const action = container.state === 'running' ? 'stop' : 'start';
    
    try {
      if (container.state === 'running') {
        try {
          await stopContainer(server, container.id);
        } catch {
          await executeCommand(server, `docker stop ${container.id}`);
        }
      } else {
        try {
          await startContainer(server, container.id);
        } catch {
          await executeCommand(server, `docker start ${container.id}`);
        }
      }
      await loadDockerData();
      logger.info('Docker container action completed', { server: server.id, container: container.id, action });
    } catch (err) {
      logger.error('Docker action failed', { server: server.id, container: container.id, action, error: err });
      setError(err instanceof Error ? err.message : 'Action failed');
    }
    
    setActionLoading(null);
  };

  if (loading) {
    return (
      <box padding={1}>
        <Spinner color="#00ff00" />
        <text> Loading Docker info...</text>
      </box>
    );
  }

  if (!dockerInstalled) {
    return (
      <box flexDirection="column" padding={1}>
        <text><span fg="#ffff00">⚠ Docker is not installed on this server.</span></text>
        <text><span fg="#888888">Install Docker to manage containers.</span></text>
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
      {/* Header and View Tabs */}
      <box marginBottom={1}>
        <text>
          {view === 'containers' ? (
            <strong><span fg="#00ffff">[Containers]</span></strong>
          ) : (
            <span fg="#888888">[Containers]</span>
          )}
        </text>
        <text> </text>
        <text>
          {view === 'images' ? (
            <strong><span fg="#00ffff">[Images]</span></strong>
          ) : (
            <span fg="#888888">[Images]</span>
          )}
        </text>
        <text><span fg="#888888"> (Tab to switch)</span></text>
      </box>

      {/* Content */}
      <box flexDirection="column" flexGrow={1}>
        {currentList.length === 0 ? (
          <text><span fg="#888888">No {view} found.</span></text>
        ) : view === 'containers' ? (
          <>
            {/* Container Header */}
            <box flexDirection="row">
              <box width={3}><text> </text></box>
              <box width={15}><text><strong><span fg="#888888">NAME</span></strong></text></box>
              <box width={20}><text><strong><span fg="#888888">IMAGE</span></strong></text></box>
              <box width={10}><text><strong><span fg="#888888">STATE</span></strong></text></box>
              <box><text><strong><span fg="#888888">STATUS</span></strong></text></box>
            </box>
            
            {containers.map((container, i) => {
              const isSelected = i === selectedIndex;
              const stateColor = container.state === 'running' ? '#00ff00' : 
                               container.state === 'paused' ? '#ffff00' : '#ff0000';
              
              return (
                <box key={container.id} flexDirection="row">
                  <box width={3}>
                    <text><span fg={isSelected ? '#00ffff' : undefined}>{isSelected ? '❯ ' : '  '}</span></text>
                  </box>
                  <box width={15}>
                    <text>{isSelected ? <strong>{container.name.slice(0, 13)}</strong> : container.name.slice(0, 13)}</text>
                  </box>
                  <box width={20}>
                    <text><span fg="#888888">{container.image.slice(0, 18)}</span></text>
                  </box>
                  <box width={10}>
                    <text><span fg={stateColor}>{container.state}</span></text>
                    {actionLoading === container.id && <Spinner color="#ffff00" />}
                  </box>
                  <box>
                    <text><span fg="#888888">{container.status.slice(0, 20)}</span></text>
                  </box>
                </box>
              );
            })}
          </>
        ) : (
          <>
            {/* Image Header */}
            <box flexDirection="row">
              <box width={3}><text> </text></box>
              <box width={25}><text><strong><span fg="#888888">REPOSITORY</span></strong></text></box>
              <box width={15}><text><strong><span fg="#888888">TAG</span></strong></text></box>
              <box><text><strong><span fg="#888888">SIZE</span></strong></text></box>
            </box>
            
            {images.map((image, i) => {
              const isSelected = i === selectedIndex;
              
              return (
                <box key={image.id} flexDirection="row">
                  <box width={3}>
                    <text><span fg={isSelected ? '#00ffff' : undefined}>{isSelected ? '❯ ' : '  '}</span></text>
                  </box>
                  <box width={25}>
                    <text>{isSelected ? <strong>{image.repository.slice(0, 23)}</strong> : image.repository.slice(0, 23)}</text>
                  </box>
                  <box width={15}>
                    <text><span fg="#888888">{image.tag.slice(0, 13)}</span></text>
                  </box>
                  <box>
                    <text><span fg="#888888">{formatBytes(image.size)}</span></text>
                  </box>
                </box>
              );
            })}
          </>
        )}
      </box>

      {/* Help */}
      <box marginTop={1}>
        <text>
          <span fg="#888888">
            ↑↓: Navigate | Tab: Switch view | {view === 'containers' ? 's: Start/Stop | ' : ''}r: Refresh
          </span>
        </text>
      </box>
    </box>
  );
}
