#!/usr/bin/env bun
// =============================================================================
// ServerTUI Client Entry Point
// =============================================================================

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from './components/App.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { disconnectServer } from './utils/connection.js';

// Initialize database
initDatabase();

// Create renderer with cleanup on destroy
const renderer = await createCliRenderer({
  exitOnCtrlC: false, // Handle Ctrl+C ourselves for proper cleanup
  onDestroy: () => {
    disconnectServer();
    closeDatabase();
  },
});

// Render the app
createRoot(renderer).render(<App />);
