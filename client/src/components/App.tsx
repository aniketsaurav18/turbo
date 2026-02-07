// =============================================================================
// Main App Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { Server, Tab, AppView } from '../types/types.js';
import { ALL_TABS, Tab as TabEnum } from '../types/types.js';
import { getAllServers, initDatabase } from '../db/database.js';
import { disconnectAllSSH } from '../utils/ssh.js';

// Components
import { ServerList } from './ServerList.js';
import { AddServerForm } from './AddServerForm.js';
import { EditServerForm } from './EditServerForm.js';
import { Sidebar } from './Sidebar.js';
import { StatusBar } from './StatusBar.js';

// Tabs
import { OverviewTab } from './tabs/OverviewTab.js';
import { SSHTab } from './tabs/SSHTab.js';
import { PerformanceTab } from './tabs/PerformanceTab.js';
import { DockerTab } from './tabs/DockerTab.js';
import { CommandsTab } from './tabs/CommandsTab.js';
import { UpdatesTab } from './tabs/UpdatesTab.js';
import { LogsTab } from './tabs/LogsTab.js';

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [view, setView] = useState<AppView>('serverList');
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(TabEnum.Overview);

  // Initialize database and load servers
  useEffect(() => {
    initDatabase();
    refreshServers();
  }, []);

  const refreshServers = () => {
    const loadedServers = getAllServers();
    setServers(loadedServers);
    
    // Auto-show add form if no servers
    if (loadedServers.length === 0 && view === 'serverList') {
      setView('addServer');
    }
  };

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Quit on Ctrl+C or q (when not in input mode)
    if (input === 'q' && view === 'serverList') {
      disconnectAllSSH();
      exit();
    }
    
    // Escape to go back
    if (key.escape) {
      if (view === 'dashboard') {
        setView('serverList');
        setSelectedServer(null);
        setActiveTab(TabEnum.Overview);
      } else if (view === 'addServer' || view === 'editServer') {
        setView('serverList');
        setEditingServer(null);
      }
    }

    // Tab navigation with numbers 1-7
    if (view === 'dashboard' && /^[1-7]$/.test(input)) {
      const tabIndex = parseInt(input, 10) - 1;
      if (tabIndex < ALL_TABS.length) {
        setActiveTab(ALL_TABS[tabIndex]!);
      }
    }

    // Tab navigation with up/down arrow keys (vertical sidebar)
    if (view === 'dashboard') {
      if (key.upArrow) {
        const currentIndex = ALL_TABS.indexOf(activeTab);
        const newIndex = currentIndex > 0 ? currentIndex - 1 : ALL_TABS.length - 1;
        setActiveTab(ALL_TABS[newIndex]!);
      }
      if (key.downArrow) {
        const currentIndex = ALL_TABS.indexOf(activeTab);
        const newIndex = (currentIndex + 1) % ALL_TABS.length;
        setActiveTab(ALL_TABS[newIndex]!);
      }
    }
  });

  const handleSelectServer = (server: Server) => {
    setSelectedServer(server);
    setActiveTab(TabEnum.Overview);
    setView('dashboard');
  };

  const handleAddServer = () => {
    setView('addServer');
  };

  const handleEditServer = (server: Server) => {
    setEditingServer(server);
    setView('editServer');
  };

  const handleServerAdded = () => {
    refreshServers();
    setView('serverList');
  };

  const handleServerEdited = () => {
    refreshServers();
    setEditingServer(null);
    setView('serverList');
  };

  const handleCancelAdd = () => {
    setView(servers.length > 0 ? 'serverList' : 'addServer');
  };

  const handleCancelEdit = () => {
    setEditingServer(null);
    setView('serverList');
  };

  // Render current tab content
  const renderTabContent = () => {
    if (!selectedServer) return null;

    switch (activeTab) {
      case TabEnum.Overview:
        return <OverviewTab server={selectedServer} />;
      case TabEnum.SSH:
        return <SSHTab server={selectedServer} />;
      case TabEnum.Performance:
        return <PerformanceTab server={selectedServer} />;
      case TabEnum.Docker:
        return <DockerTab server={selectedServer} />;
      case TabEnum.Commands:
        return <CommandsTab server={selectedServer} />;
      case TabEnum.Updates:
        return <UpdatesTab server={selectedServer} />;
      case TabEnum.Logs:
        return <LogsTab server={selectedServer} />;
      default:
        return <Text>Unknown tab</Text>;
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          🖥️  ServerTUI
        </Text>
        {selectedServer && (
          <Text color="gray"> • {selectedServer.name} ({selectedServer.host})</Text>
        )}
      </Box>

      {/* Main Content */}
      <Box flexDirection="row" flexGrow={1}>
        {view === 'serverList' && (
          <ServerList
            servers={servers}
            onSelect={handleSelectServer}
            onAdd={handleAddServer}
            onEdit={handleEditServer}
            onRefresh={refreshServers}
          />
        )}

        {view === 'addServer' && (
          <AddServerForm
            onSubmit={handleServerAdded}
            onCancel={handleCancelAdd}
          />
        )}

        {view === 'editServer' && editingServer && (
          <EditServerForm
            server={editingServer}
            onSubmit={handleServerEdited}
            onCancel={handleCancelEdit}
          />
        )}

        {view === 'dashboard' && selectedServer && (
          <>
            {/* Vertical Sidebar */}
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
            
            {/* Tab Content */}
            <Box flexDirection="column" flexGrow={1} paddingX={1}>
              {renderTabContent()}
            </Box>
          </>
        )}
      </Box>

      {/* Status Bar */}
      <StatusBar 
        view={view}
        server={selectedServer}
        activeTab={view === 'dashboard' ? activeTab : null}
      />
    </Box>
  );
}
