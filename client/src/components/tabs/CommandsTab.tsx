// =============================================================================
// Commands Tab Component
// =============================================================================

import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import type { Server, CommandResult } from '../../types/types.js';
import { executeViaAgent } from '../../utils/agent.js';
import { Spinner } from '../Spinner.js';

interface CommandsTabProps {
  server: Server;
}

interface CommandEntry {
  command: string;
  result: CommandResult;
  timestamp: Date;
}

export function CommandsTab({ server }: CommandsTabProps) {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);

  useKeyboard((key) => {
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

    // Clear history
    if (key.ctrl && key.name === 'l') {
      setHistory([]);
    }
  });

  const handleSubmit = async () => {
    if (!command.trim() || isExecuting) return;

    const cmd = command.trim();
    setCommand('');
    setHistoryIndex(-1);
    setCommandHistory(prev => [...prev.slice(-50), cmd]);
    setIsExecuting(true);

    try {
      const result = await executeViaAgent(server, cmd);
      setHistory(prev => [...prev.slice(-30), {
        command: cmd,
        result,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setHistory(prev => [...prev.slice(-30), {
        command: cmd,
        result: {
          stdout: '',
          stderr: err instanceof Error ? err.message : 'Unknown error',
          exitCode: -1,
          duration: 0,
        },
        timestamp: new Date(),
      }]);
    }

    setIsExecuting(false);
  };

  return (
    <box flexDirection="column" height="100%">
      <box marginBottom={1}><text><strong><span fg="#00ffff">Run Commands</span></strong></text></box>
      
      {/* Output History */}
      <box flexDirection="column" flexGrow={1}>
        {history.length === 0 && (
          <text><span fg="#888888">Enter a command below to execute it on the server.</span></text>
        )}
        
        {history.map((entry, i) => (
          <box key={i} flexDirection="column" marginBottom={1}>
            <box flexDirection='row'>
              <text><span fg="#888888">$ </span></text>
              <text><strong>{entry.command}</strong></text>
              <text><span fg="#888888"> ({entry.result.duration}ms, exit: {entry.result.exitCode})</span></text>
            </box>
            {entry.result.stdout && (
              <text>{entry.result.stdout.slice(0, 500)}</text>
            )}
            {entry.result.stderr && (
              <text><span fg="#ff0000">{entry.result.stderr.slice(0, 200)}</span></text>
            )}
          </box>
        ))}
      </box>

      {/* Command Input */}
      <box flexDirection="column" border borderStyle="single" borderColor="#888888" padding={1}>
        <box flexDirection='row'>
          <text><span fg="#00ffff">Command: </span></text>
          {isExecuting ? (
            <box flexDirection='row'>
              <Spinner color="#ffff00" />
              <text> Executing...</text>
            </box>
          ) : (
            <input
              value={command}
              onChange={(v) => setCommand(v)}
              onSubmit={handleSubmit}
              placeholder="ls -la, cat /etc/os-release, ..."
              focused
              width={40}
            />
          )}
        </box>
      </box>

      <box marginTop={1}>
        <text><span fg="#888888">↑↓: Command history | Enter: Execute | Ctrl+L: Clear output</span></text>
      </box>
    </box>
  );
}
