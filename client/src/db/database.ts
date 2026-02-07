// =============================================================================
// SQLite Database Layer (Bun)
// =============================================================================

import { Database } from 'bun:sqlite';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { Server, LogEntry, LogType } from '../types/types.js';
import { logger } from '../utils/logger.js';

// Database path in user's home directory
const DB_DIR = join(homedir(), '.servertui');
const DB_PATH = join(DB_DIR, 'servertui.db');

let db: Database | null = null;

/**
 * Initialize the database connection and create tables
 */
export function initDatabase(): Database {
  if (db) return db;

  // Ensure directory exists
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
    logger.info('Created database directory', { path: DB_DIR });
  }

  db = new Database(DB_PATH);
  
  // Enable WAL mode for better concurrency
  db.exec('PRAGMA journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      private_key_path TEXT NOT NULL,
      agent_port INTEGER NOT NULL DEFAULT 8443,
      created_at TEXT NOT NULL,
      last_connected TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_server_id ON logs(server_id);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
  `);
  logger.info('Database initialized', { path: DB_PATH });

  return db;
}

/**
 * Get database instance
 */
export function getDatabase(): Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

// =============================================================================
// Server CRUD Operations
// =============================================================================

interface ServerRow {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  private_key_path: string;
  agent_port: number;
  created_at: string;
  last_connected: string | null;
}

/**
 * Get all servers
 */
export function getAllServers(): Server[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, name, host, port, username, private_key_path, agent_port, 
           created_at, last_connected
    FROM servers
    ORDER BY name ASC
  `);
  const rows = stmt.all() as ServerRow[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    privateKeyPath: row.private_key_path,
    agentPort: row.agent_port,
    createdAt: new Date(row.created_at),
    lastConnected: row.last_connected ? new Date(row.last_connected) : undefined,
  }));
}

/**
 * Get server by ID
 */
export function getServerById(id: string): Server | undefined {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, name, host, port, username, private_key_path, agent_port,
           created_at, last_connected
    FROM servers WHERE id = ?
  `);
  const row = stmt.get(id) as ServerRow | null;

  if (!row) return undefined;

  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    privateKeyPath: row.private_key_path,
    agentPort: row.agent_port,
    createdAt: new Date(row.created_at),
    lastConnected: row.last_connected ? new Date(row.last_connected) : undefined,
  };
}

/**
 * Add a new server
 */
export function addServer(server: Omit<Server, 'id' | 'createdAt' | 'lastConnected'>): Server {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO servers (id, name, host, port, username, private_key_path, agent_port, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, server.name, server.host, server.port, server.username, server.privateKeyPath, server.agentPort, createdAt);
  logger.info('Added new server', { id, name: server.name, host: server.host });

  return {
    id,
    ...server,
    createdAt: new Date(createdAt),
  };
}

/**
 * Update a server
 */
export function updateServer(id: string, updates: Partial<Omit<Server, 'id' | 'createdAt'>>): void {
  const db = getDatabase();
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.host !== undefined) {
    fields.push('host = ?');
    values.push(updates.host);
  }
  if (updates.port !== undefined) {
    fields.push('port = ?');
    values.push(updates.port);
  }
  if (updates.username !== undefined) {
    fields.push('username = ?');
    values.push(updates.username);
  }
  if (updates.privateKeyPath !== undefined) {
    fields.push('private_key_path = ?');
    values.push(updates.privateKeyPath);
  }
  if (updates.agentPort !== undefined) {
    fields.push('agent_port = ?');
    values.push(updates.agentPort);
  }
  if (updates.lastConnected !== undefined) {
    fields.push('last_connected = ?');
    values.push(updates.lastConnected.toISOString());
  }

  if (fields.length > 0) {
    values.push(id);
    const stmt = db.prepare(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    if (result.changes > 0) {
      logger.info('Updated server', { id, fields: fields.map(f => f.split(' ')[0]) });
    } else {
      logger.warn('Attempted to update non-existent server or no changes made', { id, updates });
    }
  } else {
    logger.warn('Update server called with no fields to update', { id, updates });
  }
}

/**
 * Delete a server
 */
export function deleteServer(id: string): void {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  if (result.changes > 0) {
    logger.info('Deleted server', { id });
  } else {
    logger.warn('Attempted to delete non-existent server', { id });
  }
}

/**
 * Update last connected timestamp
 */
export function updateLastConnected(id: string): void {
  const db = getDatabase();
  db.prepare('UPDATE servers SET last_connected = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

// =============================================================================
// Log Operations
// =============================================================================

interface LogRow {
  id: string;
  server_id: string;
  timestamp: string;
  type: LogType;
  content: string;
  metadata: string | null;
}

/**
 * Add a log entry
 */
export function addLogEntry(
  serverId: string,
  type: LogType,
  content: string,
  metadata?: Record<string, unknown>
): LogEntry {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date();

  const stmt = db.prepare(`
    INSERT INTO logs (id, server_id, timestamp, type, content, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, serverId, timestamp.toISOString(), type, content, metadata ? JSON.stringify(metadata) : null);

  return { id, serverId, timestamp, type, content, metadata: metadata ? JSON.stringify(metadata) : undefined };
}

/**
 * Get logs for a server
 */
export function getLogsForServer(serverId: string, limit = 100): LogEntry[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, server_id, timestamp, type, content, metadata
    FROM logs
    WHERE server_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  const rows = stmt.all(serverId, limit) as LogRow[];

  return rows.map(row => ({
    id: row.id,
    serverId: row.server_id,
    timestamp: new Date(row.timestamp),
    type: row.type,
    content: row.content,
    metadata: row.metadata ?? undefined,
  }));
}

/**
 * Clear logs for a server
 */
export function clearLogsForServer(serverId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM logs WHERE server_id = ?').run(serverId);
}

// =============================================================================
// Config Operations
// =============================================================================

/**
 * Get config value
 */
export function getConfig(key: string): string | undefined {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | null;
  return row?.value;
}

/**
 * Set config value
 */
export function setConfig(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
