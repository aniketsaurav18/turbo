// =============================================================================
// Docker Tab Component with Log Streaming Support
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server, DockerContainer, DockerImage, DockerContainerDetails } from '../../types/types.js';
import { getAgentDocker, startContainer, stopContainer } from '../../utils/agent.js';
import { formatBytes } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { Spinner } from '../Spinner.js';

interface DockerTabProps {
  server: Server;
}

type DockerView = 'containers' | 'images' | 'containerDetails';

interface LogEntry {
  id: string;
  line: string;
  timestamp: number;
}

export function DockerTab({ server }: DockerTabProps) {
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [dockerInstalled, setDockerInstalled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<DockerView>('containers');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<DockerContainer | null>(null);
  const [containerDetails, setContainerDetails] = useState<DockerContainerDetails | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logsRef = useRef<LogEntry[]>([]);
  const scrollboxRef = useRef<any>(null);

  const loadDockerData = async () => {
    setLoading(true);
    setError(null);

    try {
      const status = await getAgentDocker(server);
      setContainers(status.containers);
      setImages(status.images);
      setDockerInstalled(status.installed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get Docker info');
    }

    setLoading(false);
  };

  useEffect(() => {
    loadDockerData();
    return () => {
      closeWebSocket();
    };
  }, [server.id]);

  const connectWebSocket = useCallback((containerId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      closeWebSocket();
    }

    const wsUrl = `ws://${server.host}:${server.agentPort}/ws/docker/logs`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
      logger.info('Docker logs WebSocket connected', { containerId, server: server.id });
      
      ws.send(JSON.stringify({ action: 'getDetails', containerId }));
      ws.send(JSON.stringify({ action: 'startLogs', containerId }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'containerDetails':
            setContainerDetails(message.data as DockerContainerDetails);
            break;
          case 'logLine':
            const logLine = message.data as string;
            const newEntry: LogEntry = {
              id: `${Date.now()}-${Math.random()}`,
              line: logLine,
              timestamp: Date.now(),
            };
            logsRef.current = [...logsRef.current, newEntry].slice(-500);
            setLogs(logsRef.current);
            break;
          case 'error':
            logger.error('Docker logs WebSocket error', { error: message.data });
            break;
        }
      } catch (err) {
        logger.error('Failed to parse WebSocket message', { error: err });
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      logger.info('Docker logs WebSocket closed', { containerId });
    };

    ws.onerror = (error) => {
      logger.error('Docker logs WebSocket error', { error });
    };

    wsRef.current = ws;
  }, [server.host, server.agentPort, server.id]);

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
    }
    logsRef.current = [];
    setLogs([]);
  }, []);

  const showContainerDetails = useCallback((container: DockerContainer) => {
    setSelectedContainer(container);
    setView('containerDetails');
    setLogs([]);
    logsRef.current = [];
    connectWebSocket(container.id);
  }, [connectWebSocket]);

  const showContainerList = useCallback(() => {
    closeWebSocket();
    setSelectedContainer(null);
    setContainerDetails(null);
    setView('containers');
    setSelectedIndex(0);
  }, [closeWebSocket]);

  const currentList = view === 'images' ? images : containers;

  useKeyboard((key) => {
    if (loading || actionLoading) return;

    if (view === 'containerDetails') {
      if (key.name === 'escape' || key.name === 'q') {
        showContainerList();
        return;
      }
      
      // Fast scrolling with PageUp/PageDown (10 lines)
      if (key.name === 'pageup') {
        if (scrollboxRef.current?.scrollBy) {
          scrollboxRef.current.scrollBy(-10);
        }
        return;
      }
      if (key.name === 'pagedown') {
        if (scrollboxRef.current?.scrollBy) {
          scrollboxRef.current.scrollBy(10);
        }
        return;
      }
      
      // Fast scrolling with Shift+↑/↓ (5 lines)
      if (key.shift && key.name === 'up') {
        if (scrollboxRef.current?.scrollBy) {
          scrollboxRef.current.scrollBy(-5);
        }
        return;
      }
      if (key.shift && key.name === 'down') {
        if (scrollboxRef.current?.scrollBy) {
          scrollboxRef.current.scrollBy(5);
        }
        return;
      }
    }

    if (key.name === 'up') {
      setSelectedIndex(i => Math.max(0, i - 1));
    }
    if (key.name === 'down') {
      setSelectedIndex(i => Math.min(currentList.length - 1, i + 1));
    }

    if (key.name === 'tab') {
      setView(v => v === 'containers' ? 'images' : 'containers');
      setSelectedIndex(0);
    }

    if (key.name === 'r') {
      loadDockerData();
    }

    if (key.name === 'return' && view === 'containers' && containers[selectedIndex]) {
      showContainerDetails(containers[selectedIndex]!);
    }

    if (key.name === 's' && view === 'containers' && containers[selectedIndex]) {
      const container = containers[selectedIndex]!;
      handleContainerAction(container);
    }
  });

  const handleContainerAction = async (container: DockerContainer) => {
    setActionLoading(container.id);
    const action = container.state === 'running' ? 'stop' : 'start';
    
    try {
      if (container.state === 'running') {
        await stopContainer(server, container.id);
      } else {
        await startContainer(server, container.id);
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

  if (view === 'containerDetails' && selectedContainer) {
    return (
      <box flexDirection="column" padding={1} flexGrow={1}>
        <box marginBottom={1} flexDirection="row">
          <text><span fg="#00ffff">Container: </span></text>
          <text><strong>{selectedContainer.name}</strong></text>
          <text><span fg="#888888">  (Esc or q to return)</span></text>
          {wsConnected && <text><span fg="#00ff00">  ● Live</span></text>}
        </box>

        {containerDetails && (
          <box marginBottom={1} flexDirection="row" flexWrap="wrap">
            <box marginRight={2}>
              <text><span fg="#888888">Image: </span><span fg="#ffffff">{containerDetails.image}</span></text>
            </box>
            <box marginRight={2}>
              <text><span fg="#888888">State: </span>
                <span fg={containerDetails.state === 'running' ? '#00ff00' : '#ff0000'}>
                  {containerDetails.state}
                </span>
              </text>
            </box>
            <box marginRight={2}>
              <text><span fg="#888888">IP: </span><span fg="#ffffff">{containerDetails.ipAddress || 'N/A'}</span></text>
            </box>
            {containerDetails.ports.length > 0 && (
              <box marginRight={2}>
                <text><span fg="#888888">Ports: </span><span fg="#ffffff">{containerDetails.ports.join(', ')}</span></text>
              </box>
            )}
          </box>
        )}

        <scrollbox 
          ref={scrollboxRef}
          flexGrow={1}
          focused
          style={{
            scrollbarOptions: {
              showArrows: true,
              trackOptions: {
                foregroundColor: '#7aa2f7',
                backgroundColor: '#414868',
              },
            },
          }}
        >
          {logs.length === 0 ? (
            <text><span fg="#666666">Waiting for logs...</span></text>
          ) : (
            logs.map((log) => (
              <box key={log.id}>
                <text><span fg="#888888">{log.line}</span></text>
              </box>
            ))
          )}
        </scrollbox>

        <box marginTop={1} flexDirection="row" justifyContent="space-between">
          <text>
            <span fg="#888888">
              ↑↓: Scroll | PgUp/PgDn: Fast | Shift+↑↓: Fast | Esc: Back
            </span>
          </text>
          <text>
            <span fg="#888888">{logs.length} lines</span>
            {wsConnected && <span fg="#00ff00"> [Live]</span>}
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" padding={1}>
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

      <box flexDirection="column" flexGrow={1}>
        {currentList.length === 0 ? (
          <text><span fg="#888888">No {view} found.</span></text>
        ) : view === 'containers' ? (
          <>
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

      <box marginTop={1}>
        <text>
          <span fg="#888888">
            ↑↓: Navigate | Tab: Switch view | Enter: View details/logs | {view === 'containers' ? 's: Start/Stop | ' : ''}r: Refresh
          </span>
        </text>
      </box>
    </box>
  );
}
