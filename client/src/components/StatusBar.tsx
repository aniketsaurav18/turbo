// =============================================================================
// Status Bar Component
// =============================================================================

import React from 'react';
import { Box, Text } from 'ink';
import type { Server, Tab, AppView } from '../types/types.js';

interface StatusBarProps {
  view: AppView;
  server: Server | null;
  activeTab: Tab | null;
}

export function StatusBar({ view, server, activeTab }: StatusBarProps): React.ReactElement {
  const getHelpText = (): string => {
    switch (view) {
      case 'serverList':
        return '↑↓: Navigate | Enter: Connect | a: Add | e: Edit | d: Delete | q: Quit';
      case 'addServer':
        return '↑↓: Fields | Enter: Next | Esc: Cancel';
      case 'editServer':
        return '↑↓: Fields | Enter: Next | Esc: Cancel';
      case 'dashboard':
        return '↑↓ or 1-7: Switch tabs | Esc: Back to servers';
      default:
        return '';
    }
  };

  return (
    <Box 
      borderStyle="single" 
      borderColor="gray" 
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text dimColor>{getHelpText()}</Text>
      </Box>
      
      <Box>
        {server && (
          <Text color="green">● Connected</Text>
        )}
        {!server && view === 'serverList' && (
          <Text dimColor>○ No connection</Text>
        )}
      </Box>
    </Box>
  );
}
