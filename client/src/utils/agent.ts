// =============================================================================
// Agent WebSocket/HTTP Client
// =============================================================================

import WebSocket from 'ws';
import type {
  Server,
  Metrics,
  SystemInfo,
  DockerStatus,
  PackageUpdate,
  AgentMessage,
  CommandResult,
} from '../types/types.js';

// Active WebSocket connections
const wsConnections = new Map<string, WebSocket>();
const metricsCallbacks = new Map<string, (metrics: Metrics) => void>();

/**
 * Build agent base URL
 */
function getAgentUrl(server: Server, protocol: 'https' | 'wss' = 'https'): string {
  return `${protocol}://${server.host}:${server.agentPort}`;
}

/**
 * Connect to agent WebSocket for streaming metrics
 */
export function connectAgentWS(
  server: Server,
  onMetrics: (metrics: Metrics) => void,
  onError?: (error: Error) => void
): () => void {
  // Close existing connection
  const existing = wsConnections.get(server.id);
  if (existing) {
    existing.close();
  }

  const wsUrl = `${getAgentUrl(server, 'wss')}/ws/metrics`;
  
  const ws = new WebSocket(wsUrl, {
    rejectUnauthorized: false, // Allow self-signed certs (should be configurable)
  });

  wsConnections.set(server.id, ws);
  metricsCallbacks.set(server.id, onMetrics);

  ws.on('open', () => {
    // Connection established
  });

  ws.on('message', (data: WebSocket.RawData) => {
    try {
      const message = JSON.parse(data.toString()) as AgentMessage;
      if (message.type === 'metrics') {
        const callback = metricsCallbacks.get(server.id);
        if (callback) {
          callback(message.data as Metrics);
        }
      }
    } catch {
      // Ignore parse errors
    }
  });

  ws.on('error', (error: Error) => {
    if (onError) {
      onError(error);
    }
  });

  ws.on('close', () => {
    wsConnections.delete(server.id);
    metricsCallbacks.delete(server.id);
  });

  // Return cleanup function
  return () => {
    ws.close();
    wsConnections.delete(server.id);
    metricsCallbacks.delete(server.id);
  };
}

/**
 * Disconnect agent WebSocket
 */
export function disconnectAgentWS(serverId: string): void {
  const ws = wsConnections.get(serverId);
  if (ws) {
    ws.close();
    wsConnections.delete(serverId);
    metricsCallbacks.delete(serverId);
  }
}

/**
 * Make HTTP request to agent API
 */
async function agentRequest<T>(
  server: Server,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getAgentUrl(server)}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Agent request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Check if agent is available
 */
export async function checkAgentHealth(server: Server): Promise<boolean> {
  try {
    await agentRequest(server, '/health');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get system info from agent
 */
export async function getAgentSystemInfo(server: Server): Promise<SystemInfo> {
  return agentRequest<SystemInfo>(server, '/api/system');
}

/**
 * Get current metrics from agent
 */
export async function getAgentMetrics(server: Server): Promise<Metrics> {
  return agentRequest<Metrics>(server, '/api/metrics');
}

/**
 * Get Docker status from agent
 */
export async function getAgentDocker(server: Server): Promise<DockerStatus> {
  return agentRequest<DockerStatus>(server, '/api/docker');
}

/**
 * Start a Docker container
 */
export async function startContainer(server: Server, containerId: string): Promise<void> {
  await agentRequest(server, `/api/docker/containers/${containerId}/start`, {
    method: 'POST',
  });
}

/**
 * Stop a Docker container
 */
export async function stopContainer(server: Server, containerId: string): Promise<void> {
  await agentRequest(server, `/api/docker/containers/${containerId}/stop`, {
    method: 'POST',
  });
}

/**
 * Get available OS updates from agent
 */
export async function getAgentUpdates(server: Server): Promise<PackageUpdate[]> {
  return agentRequest<PackageUpdate[]>(server, '/api/updates');
}

/**
 * Apply a package update
 */
export async function applyUpdate(server: Server, packageName: string): Promise<CommandResult> {
  return agentRequest<CommandResult>(server, '/api/updates/apply', {
    method: 'POST',
    body: JSON.stringify({ package: packageName }),
  });
}

/**
 * Apply all updates
 */
export async function applyAllUpdates(server: Server): Promise<CommandResult> {
  return agentRequest<CommandResult>(server, '/api/updates/apply-all', {
    method: 'POST',
  });
}

/**
 * Execute command via agent
 */
export async function executeViaAgent(server: Server, command: string): Promise<CommandResult> {
  return agentRequest<CommandResult>(server, '/api/exec', {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
}
