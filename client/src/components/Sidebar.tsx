// =============================================================================
// Sidebar Component (Vertical Tab Navigation)
// =============================================================================

import React from 'react';
import { Box, Text } from 'ink';
import { Tab, ALL_TABS } from '../types/types.js';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps): React.ReactElement {
  // Calculate width based on longest tab name: "▶ [N] TabName" + padding
  const maxTabLength = Math.max(...ALL_TABS.map(tab => tab.length));
  const sidebarWidth = maxTabLength + 8; // 2 for "▶ " + 4 for "[N] " + 2 for padding
  
  return (
    <Box 
      flexDirection="column" 
      borderStyle="single" 
      borderColor="gray"
      width={sidebarWidth}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold dimColor>MENU</Text>
      </Box>
      
      {ALL_TABS.map((tab, index) => {
        const isActive = tab === activeTab;
        
        return (
          <Box key={tab}>
            <Text
              bold={isActive}
              color={isActive ? 'cyan' : 'gray'}
              backgroundColor={isActive ? 'gray' : undefined}
              wrap="truncate"
            >
              {isActive ? '▶ ' : '  '}[{index + 1}] {tab}
            </Text>
          </Box>
        );
      })}
      
      <Box marginTop={1}>
        <Text dimColor>↑↓ Navigate</Text>
      </Box>
    </Box>
  );
}
