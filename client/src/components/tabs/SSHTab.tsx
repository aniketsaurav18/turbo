// =============================================================================
// SSH Tab Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import type { Server } from '../../types/types.js';
import { useConnection } from '../../hooks/hooks.js';
import { execCommand } from '../../utils/connection.js';

interface SSHTabProps {
  server: Server;
}

interface HistoryEntry {
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
}

const MAX_HISTORY = 50;
const MAX_OUTPUT_LINES = 20;

export function SSHTab({ server }: SSHTabProps): React.ReactElement {
  const { status, error, connect } = useConnection(server);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [cwd, setCwd] = useState('~');

  // Auto-connect on mount
  useEffect(() => {
    if (status === 'disconnected') {
      connect();
    }
  }, []);

  useInput((input, key) => {
    if (key.upArrow && commandHistory.length > 0) {
      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIndex);
      setCommand(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
    }
    
    if (key.downArrow) {
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      if (newIndex === -1) {
        setCommand('');
      } else {
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
      }
    }

    // Clear screen with Ctrl+L
    if (key.ctrl && input === 'l') {
      setHistory([]);
    }
  });

  const handleSubmit = async () => {
    if (!command.trim() || isExecuting) return;

    const cmd = command.trim();
    setCommand('');
    setHistoryIndex(-1);
    
    // Add to command history
    setCommandHistory(prev => [...prev.slice(-MAX_HISTORY), cmd]);

    // Handle cd specially for UX
    if (cmd.startsWith('cd ')) {
      const dir = cmd.slice(3).trim() || '~';
      setCwd(dir);
    }

    setIsExecuting(true);

    try {
      const result = await execCommand(server, cmd);
      
      // Truncate output if too long
      let output = result.stdout || result.stderr;
      const lines = output.split('\n');
      if (lines.length > MAX_OUTPUT_LINES) {
        output = lines.slice(0, MAX_OUTPUT_LINES).join('\n') + `\n... (${lines.length - MAX_OUTPUT_LINES} more lines)`;
      }

      setHistory(prev => [...prev.slice(-MAX_HISTORY), {
        command: cmd,
        output,
        exitCode: result.code,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setHistory(prev => [...prev.slice(-MAX_HISTORY), {
        command: cmd,
        output: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        exitCode: -1,
        timestamp: new Date(),
      }]);
    }

    setIsExecuting(false);
  };

  if (status === 'connecting') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Text color="green"><Spinner type="dots" /></Text>
          {' '}Establishing SSH connection...
        </Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ SSH Connection Failed</Text>
        <Text dimColor>{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Check that your SSH key ({server.privateKeyPath}) is valid and has access to {server.host}.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Output History */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {history.length === 0 && (
          <Text dimColor>SSH shell ready. Type commands below.</Text>
        )}
        {history.map((entry, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text>
              <Text color="cyan">{server.username}@{server.host}</Text>
              <Text>:</Text>
              <Text color="blue">{cwd}</Text>
              <Text color="gray">$ </Text>
              <Text>{entry.command}</Text>
            </Text>
            {entry.output && (
              <Text color={entry.exitCode !== 0 ? 'red' : undefined}>
                {entry.output}
              </Text>
            )}
          </Box>
        ))}
      </Box>

      {/* Command Input */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="cyan">{server.username}@{server.host}</Text>
        <Text>:</Text>
        <Text color="blue">{cwd}</Text>
        <Text color="gray">$ </Text>
        {isExecuting ? (
          <Text>
            <Text color="yellow"><Spinner type="dots" /></Text>
            {' '}Running...
          </Text>
        ) : (
          <TextInput
            value={command}
            onChange={setCommand}
            onSubmit={handleSubmit}
            placeholder="Enter command..."
          />
        )}
      </Box>

      <Box>
        <Text dimColor>↑↓: History | Enter: Execute | Ctrl+L: Clear</Text>
      </Box>
    </Box>
  );
}
