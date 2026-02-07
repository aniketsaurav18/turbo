// =============================================================================
// Tab Bar Component
// =============================================================================

import React from 'react';
import { Box, Text } from 'ink';
import { Tab, ALL_TABS } from '../types/types.js';

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TAB_ICONS: Record<Tab, string> = {
  [Tab.Overview]: '📊',
  [Tab.SSH]: '🔒',
  [Tab.Performance]: '📈',
  [Tab.Docker]: '🐳',
  [Tab.Commands]: '💻',
  [Tab.Updates]: '📦',
  [Tab.Logs]: '📝',
};

export function TabBar({ activeTab, onTabChange }: TabBarProps): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      {ALL_TABS.map((tab, index) => {
        const isActive = tab === activeTab;
        
        return (
          <Box key={tab} marginRight={2}>
            <Text
              bold={isActive}
              color={isActive ? 'cyan' : 'gray'}
              backgroundColor={isActive ? 'gray' : undefined}
            >
              {' '}{TAB_ICONS[tab]} {tab}{' '}
            </Text>
            <Text dimColor> [{index + 1}]</Text>
          </Box>
        );
      })}
    </Box>
  );
}
