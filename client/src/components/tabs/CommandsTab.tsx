// =============================================================================
// Commands Tab Component
// =============================================================================

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import type { Server, CommandResult } from '../../types/types.js';
import { executeCommand } from '../../utils/ssh.js';

interface CommandsTabProps {
  server: Server;
}

interface CommandEntry {
  command: string;
  result: CommandResult;
  timestamp: Date;
}

export function CommandsTab({ server }: CommandsTabProps): React.ReactElement {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);

  useInput((input, key) => {
    // Navigate command history
    if (key.upArrow && commandHistory.length > 0 && !isExecuting) {
      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIndex);
      setCommand(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
    }
    
    if (key.downArrow && !isExecuting) {
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      if (newIndex === -1) {
        setCommand('');
      } else {
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] ?? '');
      }
    }

    // Clear history
    if (key.ctrl && input === 'l') {
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
      const result = await executeCommand(server, cmd);
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
    <Box flexDirection="column" height="100%">
      <Box marginBottom={1}><Text bold color="cyan">Run Commands</Text></Box>
      
      {/* Output History */}
      <Box flexDirection="column" flexGrow={1}>
        {history.length === 0 && (
          <Text dimColor>Enter a command below to execute it on the server.</Text>
        )}
        
        {history.map((entry, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="gray">$ </Text>
              <Text bold>{entry.command}</Text>
              <Text dimColor> ({entry.result.duration}ms, exit: {entry.result.exitCode})</Text>
            </Box>
            {entry.result.stdout && (
              <Text>{entry.result.stdout.slice(0, 500)}</Text>
            )}
            {entry.result.stderr && (
              <Text color="red">{entry.result.stderr.slice(0, 200)}</Text>
            )}
          </Box>
        ))}
      </Box>

      {/* Command Input */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Box>
          <Text color="cyan">Command: </Text>
          {isExecuting ? (
            <Text>
              <Text color="yellow"><Spinner type="dots" /></Text>
              {' '}Executing...
            </Text>
          ) : (
            <TextInput
              value={command}
              onChange={setCommand}
              onSubmit={handleSubmit}
              placeholder="ls -la, cat /etc/os-release, ..."
            />
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓: Command history | Enter: Execute | Ctrl+L: Clear output</Text>
      </Box>
    </Box>
  );
}
