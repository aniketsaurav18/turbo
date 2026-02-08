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
import { logger } from './logger.js';

// Active WebSocket connections
const wsConnections = new Map<string, WebSocket>();
const metricsCallbacks = new Map<string, (metrics: Metrics) => void>();

/**
 * Build agent base URL
 */
function getAgentUrl(server: Server, protocol: 'http' | 'ws' = 'http'): string {
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
    logger.debug('Closing existing WebSocket connection', { serverId: server.id });
    existing.close();
  }

  const wsUrl = `${getAgentUrl(server, 'ws')}/ws/metrics`;
  logger.info('Connecting to agent WebSocket', { 
    serverId: server.id, 
    url: wsUrl,
    host: server.host,
    agentPort: server.agentPort 
  });
  
  const ws = new WebSocket(wsUrl);

  wsConnections.set(server.id, ws);
  metricsCallbacks.set(server.id, onMetrics);

  ws.on('open', () => {
    logger.info('Agent WebSocket connected successfully', { serverId: server.id, readyState: ws.readyState });
  });

  ws.on('message', (data: WebSocket.RawData) => {
    try {
      const rawData = data.toString();
      logger.debug('Agent WebSocket raw message', { serverId: server.id, dataLength: rawData.length });
      
      const message = JSON.parse(rawData) as AgentMessage;
      logger.debug('Agent WebSocket message parsed', { serverId: server.id, type: message.type, hasData: !!message.data });
      
      if (message.type === 'metrics') {
        const callback = metricsCallbacks.get(server.id);
        if (callback) {
          logger.debug('Invoking metrics callback', { serverId: server.id });
          callback(message.data as Metrics);
        } else {
          logger.warn('No metrics callback registered', { serverId: server.id });
        }
      }
    } catch (err) {
      logger.error('Failed to parse agent WebSocket message', { serverId: server.id, error: err });
    }
  });

  ws.on('error', (error: Error) => {
    logger.error('Agent WebSocket error', { serverId: server.id, error: error.message, stack: error.stack });
    if (onError) {
      onError(error);
    }
  });

  ws.on('close', (code: number, reason: Buffer) => {
    logger.info('Agent WebSocket closed', { serverId: server.id, code, reason: reason.toString() });
    wsConnections.delete(server.id);
    metricsCallbacks.delete(server.id);
  });

  // Return cleanup function
  return () => {
    logger.debug('Cleanup: closing WebSocket', { serverId: server.id });
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
    logger.info('Disconnecting agent WebSocket', { serverId });
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
  logger.debug('Agent API request', { serverId: server.id, method: options.method || 'GET', url });
  
  try {
    // Use Bun's fetch with TLS verification disabled for self-signed certs
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      // @ts-ignore - Bun supports this option to skip TLS verification
      tls: {
        rejectUnauthorized: false,
      },
    });

    logger.debug('Agent API response', { serverId: server.id, url, status: response.status });

    if (!response.ok) {
      const errorMsg = `Agent request failed: ${response.status} ${response.statusText}`;
      logger.error(errorMsg, { serverId: server.id, url });
      throw new Error(errorMsg);
    }

    const data = await response.json() as T;
    logger.debug('Agent API success', { serverId: server.id, url });
    return data;
  } catch (error) {
    logger.error('Agent API request failed', { 
      serverId: server.id, 
      url, 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}

/**
 * Check if agent is available
 */
export async function checkAgentHealth(server: Server): Promise<boolean> {
  logger.info('Checking agent health', { serverId: server.id, host: server.host, port: server.agentPort });
  try {
    await agentRequest(server, '/health');
    logger.info('Agent is healthy', { serverId: server.id });
    return true;
  } catch (error) {
    logger.warn('Agent health check failed', { serverId: server.id, error: error instanceof Error ? error.message : String(error) });
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
  logger.info('Fetching updates from agent', { serverId: server.id });
  const updates = await agentRequest<PackageUpdate[]>(server, '/api/updates');
  logger.info('Agent returned updates', { serverId: server.id, count: updates.length });
  return updates;
}

/**
 * Apply a package update
 */
export async function applyUpdate(server: Server, packageName: string): Promise<CommandResult> {
  logger.info('Applying update via agent', { serverId: server.id, package: packageName });
  const result = await agentRequest<CommandResult>(server, '/api/updates/apply', {
    method: 'POST',
    body: JSON.stringify({ package: packageName }),
  });
  logger.info('Update applied', { serverId: server.id, package: packageName, exitCode: result.exitCode });
  return result;
}

/**
 * Apply all updates
 */
export async function applyAllUpdates(server: Server): Promise<CommandResult> {
  logger.info('Applying all updates via agent', { serverId: server.id });
  const result = await agentRequest<CommandResult>(server, '/api/updates/apply-all', {
    method: 'POST',
  });
  logger.info('All updates applied', { serverId: server.id, exitCode: result.exitCode });
  return result;
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
