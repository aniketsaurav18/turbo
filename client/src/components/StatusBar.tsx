// =============================================================================
// Status Bar Component
// =============================================================================

import type { Server, Tab, AppView } from '../types/types.js';

interface StatusBarProps {
  view: AppView;
  server: Server | null;
  activeTab: Tab | null;
}

export function StatusBar({ view, server, activeTab }: StatusBarProps) {
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
    <box 
      border 
      borderStyle="single" 
      borderColor="#888888" 
      paddingLeft={1}
      paddingRight={1}
      justifyContent="space-between"
      width="100%"
      flexDirection='row'
    >
      <box>
        <text><span fg="#888888">{getHelpText()}</span></text>
      </box>
      
      <box>
        {server && (
          <text><span fg="#00ff00">● Connected</span></text>
        )}
        {!server && view === 'serverList' && (
          <text><span fg="#888888">○ No connection</span></text>
        )}
      </box>
    </box>
  );
}
