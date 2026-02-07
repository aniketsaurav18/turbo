#!/usr/bin/env bun
// =============================================================================
// ServerTUI Client Entry Point
// =============================================================================

import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { disconnectServer } from './utils/connection.js';

// Initialize database
initDatabase();

// Render the app
const { waitUntilExit } = render(<App />);

// Handle cleanup on exit
waitUntilExit().then(() => {
  disconnectServer();
  closeDatabase();
  process.exit(0);
});

// Handle unexpected exits
process.on('SIGINT', () => {
  disconnectServer();
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  disconnectServer();
  closeDatabase();
  process.exit(0);
});
