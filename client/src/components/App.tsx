// =============================================================================
// Main App Component
// =============================================================================

import { useState, useEffect } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import type { Server, Tab, AppView } from '../types/types.js';
import { ALL_TABS, Tab as TabEnum } from '../types/types.js';
import { getAllServers, initDatabase } from '../db/database.js';
import { disconnectAllSSH } from '../utils/ssh.js';
import { logger } from '../utils/logger.js';
import clipboardy from 'clipboardy';

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

export function App() {
  const renderer = useRenderer();
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
      logger.info('No servers found, switching to add server view');
      setView('addServer');
    }
  };

  // Global keyboard shortcuts
  useKeyboard((key) => {
    // Quit on q (when in server list)
    if (key.name === 'q' && view === 'serverList') {
      logger.info('User quit application via keyboard');
      disconnectAllSSH();
      renderer.destroy();
      return;
    }
    
    // Escape to go back
    if (key.name === 'escape') {
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
    if (view === 'dashboard' && /^[1-7]$/.test(key.name)) {
      const tabIndex = parseInt(key.name, 10) - 1;
      if (tabIndex < ALL_TABS.length) {
        setActiveTab(ALL_TABS[tabIndex]!);
      }
    }

    // Tab navigation with up/down arrow keys (vertical sidebar)
    if (view === 'dashboard') {
      if (key.name === 'up') {
        const currentIndex = ALL_TABS.indexOf(activeTab);
        const newIndex = currentIndex > 0 ? currentIndex - 1 : ALL_TABS.length - 1;
        setActiveTab(ALL_TABS[newIndex]!);
      }
      if (key.name === 'down') {
        const currentIndex = ALL_TABS.indexOf(activeTab);
        const newIndex = (currentIndex + 1) % ALL_TABS.length;
        setActiveTab(ALL_TABS[newIndex]!);
      }
    }
  });

  const handleSelectServer = (server: Server) => {
    logger.info('Selected server', { id: server.id, name: server.name });
    setSelectedServer(server);
    setActiveTab(TabEnum.Overview);
    setView('dashboard');
  };

  const handleAddServer = () => {
    setView('addServer');
  };

  const handleEditServer = (server: Server) => {
    logger.info('Editing server', { id: server.id, name: server.name });
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

  const handleMouseUp = () => {
    logger.debug('handleMouseUp triggered');
    try {
      const selection = renderer.getSelection();
      logger.debug('Selection object', { hasSelection: !!selection });
      
      if (selection) {
        const text = selection.getSelectedText();
        logger.debug('Selected text', { textLength: text?.length ?? 0, textPreview: text?.slice(0, 50) });
        if (text) {
          clipboardy.write(text)
            .then(() => {
              logger.info('Successfully copied text to clipboard', { length: text.length });
            })
            .catch(err => {
              logger.error('Failed to write to clipboard', { error: err instanceof Error ? err.message : String(err) });
            });
        } else {
          logger.debug('No text in selection');
        }
      } else {
        logger.debug('No selection found');
      }
    } catch (error) {
       logger.error('Error handling mouse up for clipboard', { error: error instanceof Error ? error.message : String(error) });
    }
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
        return <text>Unknown tab</text>;
    }
  };

  return (
    <box 
      flexDirection="column" 
      height="100%"
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <box borderStyle="rounded" borderColor="cyan" paddingLeft={1} paddingRight={1} width="100%" flexDirection="row">
        <text>
          <strong><span fg="#00ffff">🖥️  ServerTUI</span></strong>
        </text>
        {selectedServer && (
          <text>
            <span fg="#888888"> • {selectedServer.name} ({selectedServer.host})</span>
          </text>
        )}
      </box>

      {/* Main Content */}
      <box flexDirection="row" flexGrow={1}>
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
            <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
              {renderTabContent()}
            </box>
          </>
        )}
      </box>

      {/* Status Bar */}
      <StatusBar 
        view={view}
        server={selectedServer}
        activeTab={view === 'dashboard' ? activeTab : null}
      />
    </box>
  );
}
