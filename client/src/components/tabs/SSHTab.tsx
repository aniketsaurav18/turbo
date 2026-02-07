// =============================================================================
// SSH Tab Component
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server } from '../../types/types.js';
import { useConnection } from '../../hooks/hooks.js';
import { executeCommand } from '../../utils/ssh.js';
import { addLogEntry } from '../../db/database.js';
import { Spinner } from '../Spinner.js';
import { logger } from '../../utils/logger.js';

interface SSHTabProps {
  server: Server;
}

interface OutputLine {
  type: 'command' | 'stdout' | 'stderr';
  content: string;
}

export function SSHTab({ server }: SSHTabProps) {
  const { status, error } = useConnection(server);
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentDir, setCurrentDir] = useState('~');

  useKeyboard((key) => {
    if (status !== 'connected') return;

    // Navigate command history
    if (key.name === 'up' && commandHistory.length > 0 && !isExecuting) {
      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIndex);
      setCommand(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
    }
    
    if (key.name === 'down' && !isExecuting) {
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      if (newIndex === -1) {
        setCommand('');
      } else {
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
      }
    }

    // Clear screen
    if (key.ctrl && key.name === 'l') {
      setOutput([]);
    }
  });

  const handleSubmit = async () => {
    if (!command.trim() || isExecuting) return;

    const cmd = command.trim();
    setCommand('');
    setHistoryIndex(-1);
    setCommandHistory(prev => [...prev.slice(-50), cmd]);
    setOutput(prev => [...prev, { type: 'command', content: `${currentDir} $ ${cmd}` }]);

    // Handle clear command locally
    if (cmd === 'clear' || cmd === 'cls') {
      logger.debug('User cleared SSH terminal');
      setOutput([]);
      return;
    }

    setIsExecuting(true);
    logger.info('Executing SSH command', { server: server.id, command: cmd });

    try {
      // Handle cd command specially
      if (cmd.startsWith('cd ')) {
        const targetDir = cmd.slice(3).trim();
        const result = await executeCommand(server, `cd ${targetDir} && pwd`);
        if (result.exitCode === 0) {
          setCurrentDir(result.stdout.trim());
        } else {
          setOutput(prev => [...prev, { type: 'stderr', content: result.stderr || 'Directory not found' }]);
        }
      } else {
        // Execute command in current directory
        const fullCmd = currentDir !== '~' 
          ? `cd ${currentDir} && ${cmd}` 
          : cmd;
        
        const result = await executeCommand(server, fullCmd);
        
        if (result.stdout) {
          // Split into lines and add each
          result.stdout.split('\n').forEach(line => {
            setOutput(prev => [...prev, { type: 'stdout', content: line }]);
          });
        }
        if (result.stderr) {
          result.stderr.split('\n').forEach(line => {
            setOutput(prev => [...prev, { type: 'stderr', content: line }]);
          });
        }
      }

      addLogEntry(server.id, 'ssh', cmd);
    } catch (err) {
      logger.error('SSH command execution failed', { server: server.id, command: cmd, error: err });
      setOutput(prev => [...prev, { 
        type: 'stderr', 
        content: err instanceof Error ? err.message : 'Command failed' 
      }]);
    }

    setIsExecuting(false);
  };

  if (status === 'connecting') {
    return (
      <box padding={1}>
        <Spinner color="#00ff00" />
        <text> Connecting to {server.host}...</text>
      </box>
    );
  }

  if (status === 'error') {
    return (
      <box flexDirection="column" padding={1}>
        <text><span fg="#ff0000">✗ SSH connection failed: {error}</span></text>
        <text><span fg="#888888">Check your SSH key and network connectivity.</span></text>
      </box>
    );
  }

  // Keep last 50 lines visible
  const visibleOutput = output.slice(-50);

  return (
    <box flexDirection="column" height="100%">
      <box marginBottom={1}>
        <text><strong><span fg="#00ffff">SSH Shell</span></strong></text>
        <text><span fg="#888888"> • {server.username}@{server.host}</span></text>
      </box>
      
      {/* Output Area */}
      <box flexDirection="column" flexGrow={1}>
        {visibleOutput.map((line, i) => (
          <text key={i}>
            {line.type === 'command' ? (
              <strong><span fg="#00ffff">{line.content}</span></strong>
            ) : line.type === 'stderr' ? (
              <span fg="#ff0000">{line.content}</span>
            ) : (
              <span>{line.content}</span>
            )}
          </text>
        ))}
      </box>

      {/* Command Input */}
      <box flexDirection="column" border borderStyle="single" borderColor="#888888" padding={1}>
        <box>
          <text><span fg="#00ffff">{currentDir} $ </span></text>
          {isExecuting ? (
            <box>
              <Spinner color="#ffff00" />
              <text><span fg="#888888"> Executing...</span></text>
            </box>
          ) : (
            <input
              value={command}
              onChange={(v) => setCommand(v)}
              onSubmit={handleSubmit}
              placeholder="Enter command..."
              focused
              width={50}
            />
          )}
        </box>
      </box>

      <box marginTop={1}>
        <text>
          <span fg="#888888">↑↓: History | Enter: Execute | Ctrl+L: Clear</span>
        </text>
      </box>
    </box>
  );
}
