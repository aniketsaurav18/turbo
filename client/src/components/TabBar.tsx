// =============================================================================
// Tab Bar Component (Horizontal)
// =============================================================================

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

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <box border borderStyle="single" borderColor="#888888" paddingLeft={1} paddingRight={1}>
      {ALL_TABS.map((tab, index) => {
        const isActive = tab === activeTab;
        
        return (
          <box key={tab} marginRight={2}>
            <text>
              {isActive ? (
                <strong>
                  <span fg="#00ffff" bg="#444444">
                    {' '}{TAB_ICONS[tab]} {tab}{' '}
                  </span>
                </strong>
              ) : (
                <span fg="#888888">
                  {' '}{TAB_ICONS[tab]} {tab}{' '}
                </span>
              )}
            </text>
            <text><span fg="#888888"> [{index + 1}]</span></text>
          </box>
        );
      })}
    </box>
  );
}
