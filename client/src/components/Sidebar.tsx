// =============================================================================
// Sidebar Component (Vertical Tab Navigation)
// =============================================================================

import { Tab, ALL_TABS } from '../types/types.js';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  // Calculate width based on longest tab name: "▶ [N] TabName" + padding
  const maxTabLength = Math.max(...ALL_TABS.map(tab => tab.length));
  const sidebarWidth = maxTabLength + 12; // 2 for "▶ " + 4 for "[N] " + 2 for padding + 4 for border/margin safety
  
  return (
    <box 
      flexDirection="column" 
      border
      borderStyle="single" 
      borderColor="#888888"
      width={sidebarWidth}
      paddingLeft={1}
      paddingRight={1}
    >
      <box marginBottom={1}>
        <text><strong><span fg="#888888">MENU</span></strong></text>
      </box>
      
      {ALL_TABS.map((tab, index) => {
        const isActive = tab === activeTab;
        
        return (
          <box key={tab}>
            <text>
              {isActive ? (
                <strong>
                  <span fg="#00ffff" bg="#444444">
                    ▶ [{index + 1}] {tab}
                  </span>
                </strong>
              ) : (
                <span fg="#888888">
                  {"  "}[{index + 1}] {tab}
                </span>
              )}
            </text>
          </box>
        );
      })}
      
      <box marginTop={1}>
        <text><span fg="#888888">↑↓ Navigate</span></text>
      </box>
    </box>
  );
}
