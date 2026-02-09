// =============================================================================
// Connection Manager - Agent-based connection per server
// =============================================================================

import type { Server, SystemInfo } from '../types/types.js';
import { logger } from './logger.js';
import { addLogEntry, updateLastConnected } from '../db/database.js';
import { checkAgentHealth, getAgentSystemInfo } from './agent.js';

interface ServerConnection {
  serverId: string;
  connected: boolean;
  systemInfo: SystemInfo | null;
  lastError: string | null;
}

// Single connection per server
let activeConnection: ServerConnection | null = null;

/**
 * Get or create the connection for a server
 */
export async function getConnection(server: Server): Promise<void> {
  // Return if already connected to this server
  if (activeConnection?.serverId === server.id && activeConnection.connected) {
    logger.debug('ConnectionManager: Already connected to server', { serverId: server.id });
    return;
  }

  // Disconnect previous connection if switching servers
  if (activeConnection && activeConnection.serverId !== server.id) {
    logger.info('ConnectionManager: Switching servers, disconnecting previous');
    await disconnectServer();
  }

  logger.info('ConnectionManager: Connecting to agent', {
    host: server.host,
    agentPort: server.agentPort,
  });

  try {
    // Check agent health
    const isHealthy = await checkAgentHealth(server);
    
    if (!isHealthy) {
      throw new Error('Agent health check failed');
    }

    activeConnection = {
      serverId: server.id,
      connected: true,
      systemInfo: null,
      lastError: null,
    };

    updateLastConnected(server.id);
    addLogEntry(server.id, 'info', `Connected to agent at ${server.host}:${server.agentPort}`);
    logger.info('ConnectionManager: Connected to agent');

    // Fetch and cache system info
    const systemInfo = await getAgentSystemInfo(server);
    activeConnection.systemInfo = systemInfo;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    logger.error('ConnectionManager: Connection failed', { error: msg });
    
    activeConnection = {
      serverId: server.id,
      connected: false,
      systemInfo: null,
      lastError: msg,
    };
    
    addLogEntry(server.id, 'error', `Connection failed: ${msg}`);
    throw new Error(msg);
  }
}

/**
 * Check if connected to a specific server
 */
export function isConnected(serverId?: string): boolean {
  if (!activeConnection) return false;
  if (serverId && activeConnection.serverId !== serverId) return false;
  return activeConnection.connected;
}

/**
 * Get the active server ID
 */
export function getActiveServerId(): string | null {
  return activeConnection?.serverId ?? null;
}

/**
 * Get last connection error
 */
export function getLastError(): string | null {
  return activeConnection?.lastError ?? null;
}

/**
 * Disconnect current server
 */
export async function disconnectServer(): Promise<void> {
  if (activeConnection) {
    logger.info('ConnectionManager: Disconnecting', { serverId: activeConnection.serverId });
    activeConnection = null;
  }
}

/**
 * Get system info (cached on connection)
 */
export async function getSystemInfo(server: Server): Promise<SystemInfo> {
  if (activeConnection?.serverId === server.id && activeConnection.systemInfo) {
    return activeConnection.systemInfo;
  }

  // Fetch from agent
  const info = await getAgentSystemInfo(server);

  // Cache it
  if (activeConnection?.serverId === server.id) {
    activeConnection.systemInfo = info;
  }
  
  logger.info('ConnectionManager: Fetched system info', { serverId: server.id });
  return info;
}
