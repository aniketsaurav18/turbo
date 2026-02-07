// =============================================================================
// Database Schema Definition
// =============================================================================

/**
 * SQL schema for ServerTUI database
 * 
 * This file documents the complete database structure.
 * The actual tables are created in database.ts using these definitions.
 */

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
-- =============================================================================
-- SERVERS TABLE
-- Stores configured server connections
-- =============================================================================
CREATE TABLE IF NOT EXISTS servers (
  id                TEXT PRIMARY KEY,           -- UUID v4
  name              TEXT NOT NULL,              -- Display name (e.g., "Production API")
  host              TEXT NOT NULL,              -- Hostname or IP address
  port              INTEGER NOT NULL DEFAULT 22,-- SSH port
  username          TEXT NOT NULL,              -- SSH username
  private_key_path  TEXT NOT NULL,              -- Path to SSH private key
  agent_port        INTEGER NOT NULL DEFAULT 8443, -- Agent HTTPS port
  created_at        TEXT NOT NULL,              -- ISO 8601 timestamp
  last_connected    TEXT                        -- ISO 8601 timestamp (nullable)
);

-- =============================================================================
-- LOGS TABLE
-- Stores session history and command logs per server
-- =============================================================================
CREATE TABLE IF NOT EXISTS logs (
  id          TEXT PRIMARY KEY,               -- UUID v4
  server_id   TEXT NOT NULL,                  -- Foreign key to servers.id
  timestamp   TEXT NOT NULL,                  -- ISO 8601 timestamp
  type        TEXT NOT NULL,                  -- Log type: 'command'|'ssh'|'update'|'docker'|'error'|'info'
  content     TEXT NOT NULL,                  -- Log message or command
  metadata    TEXT,                           -- Optional JSON metadata
  
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_server_id ON logs(server_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);

-- =============================================================================
-- CONFIG TABLE
-- Key-value store for application settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,               -- Setting key
  value       TEXT NOT NULL                   -- Setting value (JSON or string)
);

-- =============================================================================
-- SCHEMA_VERSION TABLE
-- Tracks database schema version for migrations
-- =============================================================================
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,            -- Schema version number
  applied_at  TEXT NOT NULL                   -- ISO 8601 timestamp
);
`;

/**
 * Schema for servers table columns
 */
export interface ServerSchema {
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
 * Schema for logs table columns
 */
export interface LogSchema {
  id: string;
  server_id: string;
  timestamp: string;
  type: 'command' | 'ssh' | 'update' | 'docker' | 'error' | 'info';
  content: string;
  metadata: string | null;
}

/**
 * Schema for config table columns
 */
export interface ConfigSchema {
  key: string;
  value: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  'metrics.pollInterval': '2000',     // ms
  'ssh.timeout': '10000',             // ms
  'ui.theme': 'dark',
  'logs.maxEntries': '1000',
};
