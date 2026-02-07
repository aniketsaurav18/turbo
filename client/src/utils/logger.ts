// =============================================================================
// File Logger for Debugging
// =============================================================================

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_DIR = join(homedir(), '.servertui');
const LOG_FILE = join(LOG_DIR, 'debug.log');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function writeLog(level: LogLevel, message: string, data?: unknown): void {
  const timestamp = formatTimestamp();
  let logLine = `[${timestamp}] [${level}] ${message}`;
  
  if (data !== undefined) {
    try {
      logLine += ` ${JSON.stringify(data)}`;
    } catch {
      logLine += ` [unserializable data]`;
    }
  }
  
  logLine += '\n';
  
  try {
    appendFileSync(LOG_FILE, logLine);
  } catch {
    // Silently fail if we can't write
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => writeLog('DEBUG', message, data),
  info: (message: string, data?: unknown) => writeLog('INFO', message, data),
  warn: (message: string, data?: unknown) => writeLog('WARN', message, data),
  error: (message: string, data?: unknown) => writeLog('ERROR', message, data),
  
  // Get log file path for display
  getLogPath: () => LOG_FILE,
};

// Log startup
logger.info('ServerTUI logger initialized');
