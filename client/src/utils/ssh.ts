// =============================================================================
// SSH Client Utilities
// =============================================================================

import { NodeSSH, SSHExecCommandResponse } from 'node-ssh';
import type { Server, CommandResult } from '../types/types.js';
import { addLogEntry, updateLastConnected } from '../db/database.js';
import { logger } from './logger.js';

// Active SSH connections per server
const connections = new Map<string, NodeSSH>();

/**
 * Connect to a server via SSH
 */
export async function connectSSH(server: Server): Promise<NodeSSH> {
  // Return existing connection if available
  const existing = connections.get(server.id);
  if (existing?.isConnected()) {
    logger.debug('Reusing existing SSH connection', { serverId: server.id });
    return existing;
  }

  const ssh = new NodeSSH();
  const agentSocket = process.env.SSH_AUTH_SOCK;
  
  logger.info('Attempting SSH connection', { 
    host: server.host, 
    port: server.port, 
    username: server.username,
    keyPath: server.privateKeyPath,
    hasAgent: !!agentSocket,
    agentSocket,
  });
  
  // Try agent-only auth first if SSH agent is available
  if (agentSocket) {
    try {
      logger.debug('Trying SSH agent authentication');
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        agent: agentSocket,
        readyTimeout: 10000,
      });

      connections.set(server.id, ssh);
      updateLastConnected(server.id);
      
      logger.info('SSH connected via agent', { host: server.host });
      addLogEntry(server.id, 'info', `SSH connected to ${server.host} via agent`);
      
      return ssh;
    } catch (agentError) {
      const agentMsg = agentError instanceof Error ? agentError.message : 'Unknown error';
      logger.warn('SSH agent auth failed, trying key file', { error: agentMsg });
    }
  }
  
  // Fall back to private key file
  try {
    logger.debug('Trying private key file authentication');
    await ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      privateKeyPath: server.privateKeyPath,
      readyTimeout: 10000,
    });

    connections.set(server.id, ssh);
    updateLastConnected(server.id);
    
    logger.info('SSH connected via key file', { host: server.host });
    addLogEntry(server.id, 'info', `SSH connected to ${server.host}`);
    
    return ssh;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error('SSH connection failed', { host: server.host, error: message, stack });
    addLogEntry(server.id, 'error', `SSH connection failed: ${message}`);
    throw error;
  }
}

/**
 * Disconnect SSH from a server
 */
export function disconnectSSH(serverId: string): void {
  const ssh = connections.get(serverId);
  if (ssh) {
    ssh.dispose();
    connections.delete(serverId);
  }
}

/**
 * Disconnect all SSH connections
 */
export function disconnectAllSSH(): void {
  for (const [id, ssh] of connections.entries()) {
    ssh.dispose();
    connections.delete(id);
  }
}

/**
 * Check if connected to a server
 */
export function isSSHConnected(serverId: string): boolean {
  const ssh = connections.get(serverId);
  return ssh?.isConnected() ?? false;
}

/**
 * Execute a command on a server
 */
export async function executeCommand(
  server: Server,
  command: string
): Promise<CommandResult> {
  const startTime = Date.now();
  
  try {
    const ssh = await connectSSH(server);
    
    const result: SSHExecCommandResponse = await ssh.execCommand(command, {
      cwd: '/',
      execOptions: { pty: false },
    });

    const duration = Date.now() - startTime;
    const commandResult: CommandResult = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code ?? 0,
      duration,
    };

    // Log the command
    addLogEntry(server.id, 'command', command, {
      exitCode: commandResult.exitCode,
      duration,
    });

    return commandResult;
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    addLogEntry(server.id, 'error', `Command failed: ${command}`, { error: message });
    
    return {
      stdout: '',
      stderr: message,
      exitCode: -1,
      duration,
    };
  }
}

/**
 * Get system info via SSH
 */
export async function getSystemInfo(server: Server): Promise<{
  hostname: string;
  os: string;
  osVersion: string;
  kernel: string;
  uptime: number;
  architecture: string;
}> {
  const [hostnameResult, osResult, kernelResult, uptimeResult, archResult] = await Promise.all([
    executeCommand(server, 'hostname'),
    executeCommand(server, 'cat /etc/os-release 2>/dev/null | grep -E "^(PRETTY_NAME|NAME|VERSION)" | head -1'),
    executeCommand(server, 'uname -r'),
    executeCommand(server, 'cat /proc/uptime | cut -d" " -f1'),
    executeCommand(server, 'uname -m'),
  ]);

  const osLine = osResult.stdout.trim();
  const osMatch = osLine.match(/(?:PRETTY_NAME|NAME)="?([^"]+)"?/);
  
  return {
    hostname: hostnameResult.stdout.trim() || 'unknown',
    os: osMatch?.[1] || 'Linux',
    osVersion: osLine,
    kernel: kernelResult.stdout.trim() || 'unknown',
    uptime: parseFloat(uptimeResult.stdout.trim()) || 0,
    architecture: archResult.stdout.trim() || 'unknown',
  };
}

/**
 * Get basic system metrics via SSH (fallback when agent not available)
 */
export async function getBasicMetrics(server: Server): Promise<{
  cpu: number;
  memory: { used: number; total: number };
  disk: { used: number; total: number };
}> {
  const [cpuResult, memResult, diskResult] = await Promise.all([
    executeCommand(server, "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
    executeCommand(server, "free -b | awk '/Mem:/ {print $2, $3}'"),
    executeCommand(server, "df -B1 / | awk 'NR==2 {print $2, $3}'"),
  ]);

  const cpuUsage = parseFloat(cpuResult.stdout.trim()) || 0;
  const [memTotal, memUsed] = memResult.stdout.trim().split(/\s+/).map(Number);
  const [diskTotal, diskUsed] = diskResult.stdout.trim().split(/\s+/).map(Number);

  return {
    cpu: cpuUsage,
    memory: { used: memUsed || 0, total: memTotal || 0 },
    disk: { used: diskUsed || 0, total: diskTotal || 0 },
  };
}
