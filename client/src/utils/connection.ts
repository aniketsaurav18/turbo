// =============================================================================
// Connection Manager - Single SSH connection per server
// =============================================================================

import { NodeSSH } from 'node-ssh';
import type { Server, SystemInfo } from '../types/types.js';
import { logger } from './logger.js';
import { addLogEntry, updateLastConnected } from '../db/database.js';

interface ServerConnection {
  ssh: NodeSSH;
  serverId: string;
  connected: boolean;
  systemInfo: SystemInfo | null;
  lastError: string | null;
}

// Single connection per server
let activeConnection: ServerConnection | null = null;

// Mutex for sequential command execution
let commandLock: Promise<void> = Promise.resolve();

/**
 * Get or create the connection for a server
 */
export async function getConnection(server: Server): Promise<NodeSSH> {
  // Return existing connection if it's for the same server and still connected
  if (activeConnection?.serverId === server.id && activeConnection.ssh.isConnected()) {
    logger.debug('ConnectionManager: Reusing existing connection');
    return activeConnection.ssh;
  }

  // Disconnect previous connection if switching servers
  if (activeConnection && activeConnection.serverId !== server.id) {
    logger.info('ConnectionManager: Switching servers, disconnecting previous');
    await disconnectServer();
  }

  // Create new connection
  const ssh = new NodeSSH();
  const agentSocket = process.env.SSH_AUTH_SOCK;

  logger.info('ConnectionManager: Connecting', {
    host: server.host,
    port: server.port,
    username: server.username,
    hasAgent: !!agentSocket,
  });

  // Try agent-only auth first
  if (agentSocket) {
    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        agent: agentSocket,
        readyTimeout: 10000,
      });

      activeConnection = {
        ssh,
        serverId: server.id,
        connected: true,
        systemInfo: null,
        lastError: null,
      };

      updateLastConnected(server.id);
      addLogEntry(server.id, 'info', `Connected to ${server.host} via agent`);
      logger.info('ConnectionManager: Connected via agent');

      return ssh;
    } catch (agentErr) {
      const msg = agentErr instanceof Error ? agentErr.message : 'Unknown error';
      logger.warn('ConnectionManager: Agent auth failed', { error: msg });
    }
  }

  // Fall back to key file
  try {
    await ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      privateKeyPath: server.privateKeyPath,
      readyTimeout: 10000,
    });

    activeConnection = {
      ssh,
      serverId: server.id,
      connected: true,
      systemInfo: null,
      lastError: null,
    };

    updateLastConnected(server.id);
    addLogEntry(server.id, 'info', `Connected to ${server.host}`);
    logger.info('ConnectionManager: Connected via key file');

    return ssh;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    logger.error('ConnectionManager: Connection failed', { error: msg });
    
    activeConnection = {
      ssh,
      serverId: server.id,
      connected: false,
      systemInfo: null,
      lastError: msg,
    };
    
    addLogEntry(server.id, 'error', `Connection failed: ${msg}`);
    throw err;
  }
}

/**
 * Check if connected to a specific server
 */
export function isConnected(serverId?: string): boolean {
  if (!activeConnection) return false;
  if (serverId && activeConnection.serverId !== serverId) return false;
  return activeConnection.ssh.isConnected();
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
    activeConnection.ssh.dispose();
    activeConnection = null;
  }
}

/**
 * Execute a command on the connected server (sequential, one at a time)
 */
export async function execCommand(server: Server, command: string): Promise<{
  stdout: string;
  stderr: string;
  code: number;
  duration: number;
}> {
  // Chain commands sequentially to prevent listener buildup
  const result = await new Promise<{
    stdout: string;
    stderr: string;
    code: number;
    duration: number;
  }>((resolve) => {
    commandLock = commandLock.then(async () => {
      const startTime = Date.now();
      
      try {
        const ssh = await getConnection(server);
        const res = await ssh.execCommand(command, { cwd: '/' });
        
        const duration = Date.now() - startTime;
        
        resolve({
          stdout: res.stdout,
          stderr: res.stderr,
          code: res.code ?? 0,
          duration,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Command failed';
        const duration = Date.now() - startTime;
        
        resolve({
          stdout: '',
          stderr: msg,
          code: -1,
          duration,
        });
      }
    });
  });
  
  return result;
}

/**
 * Get system info (cached on connection)
 */
export async function getSystemInfo(server: Server): Promise<SystemInfo> {
  if (activeConnection?.serverId === server.id && activeConnection.systemInfo) {
    return activeConnection.systemInfo;
  }

  // Run commands sequentially to avoid listener buildup
  const result = await execCommand(server, `
    echo "HOSTNAME:$(hostname)";
    echo "OS:$(cat /etc/os-release 2>/dev/null | grep -E "^PRETTY_NAME" | cut -d= -f2 | tr -d '"')";
    echo "KERNEL:$(uname -r)";
    echo "UPTIME:$(cat /proc/uptime | cut -d" " -f1)";
    echo "ARCH:$(uname -m)"
  `);

  const lines = result.stdout.split('\n');
  let hostname = 'unknown', osInfo = 'Linux', kernel = 'unknown', uptime = '0', arch = 'unknown';

  for (const line of lines) {
    if (line.startsWith('HOSTNAME:')) hostname = line.slice(9).trim();
    if (line.startsWith('OS:')) osInfo = line.slice(3).trim();
    if (line.startsWith('KERNEL:')) kernel = line.slice(7).trim();
    if (line.startsWith('UPTIME:')) uptime = line.slice(7).trim();
    if (line.startsWith('ARCH:')) arch = line.slice(5).trim();
  }

  const info: SystemInfo = {
    hostname: hostname || 'unknown',
    os: osInfo || 'Linux',
    osVersion: osInfo,
    kernel: kernel || 'unknown',
    uptime: parseFloat(uptime) || 0,
    architecture: arch || 'unknown',
  };

  // Cache it
  if (activeConnection?.serverId === server.id) {
    activeConnection.systemInfo = info;
  }
  
  logger.info('ConnectionManager: Fetched system info', { serverId: server.id });
  return info;
}

/**
 * Get basic metrics via SSH - single combined command to reduce connections
 */
export async function getMetrics(server: Server): Promise<{
  cpu: number;
  memory: { used: number; total: number };
  disk: { used: number; total: number };
}> {
  // Use a single combined command to get all metrics at once
  const result = await execCommand(server, `
    echo "CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')";
    echo "MEM:$(free -b | awk '/Mem:/ {print $2, $3}')";
    echo "DISK:$(df -B1 / | awk 'NR==2 {print $2, $3}')"
  `);

  const lines = result.stdout.split('\n');
  let cpu = 0;
  let memTotal = 0, memUsed = 0;
  let diskTotal = 0, diskUsed = 0;

  for (const line of lines) {
    if (line.startsWith('CPU:')) {
      cpu = parseFloat(line.slice(4)) || 0;
    } else if (line.startsWith('MEM:')) {
      const parts = line.slice(4).trim().split(/\s+/).map(Number);
      memTotal = parts[0] || 0;
      memUsed = parts[1] || 0;
    } else if (line.startsWith('DISK:')) {
      const parts = line.slice(5).trim().split(/\s+/).map(Number);
      diskTotal = parts[0] || 0;
      diskUsed = parts[1] || 0;
    }
  }

  return {
    cpu,
    memory: { used: memUsed, total: memTotal },
    disk: { used: diskUsed, total: diskTotal },
  };
}
