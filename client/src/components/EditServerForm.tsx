// =============================================================================
// Edit Server Form Component
// =============================================================================

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { homedir } from 'os';
import { join } from 'path';
import type { Server } from '../types/types.js';
import { updateServer } from '../db/database.js';

interface EditServerFormProps {
  server: Server;
  onSubmit: () => void;
  onCancel: () => void;
}

interface FormField {
  key: keyof typeof defaultValues;
  label: string;
  required: boolean;
}

const defaultValues = {
  name: '',
  host: '',
  port: '',
  username: '',
  privateKeyPath: '',
  agentPort: '',
};

const FIELDS: FormField[] = [
  { key: 'name', label: 'Server Name', required: true },
  { key: 'host', label: 'Host/IP', required: true },
  { key: 'port', label: 'SSH Port', required: false },
  { key: 'username', label: 'Username', required: true },
  { key: 'privateKeyPath', label: 'Private Key', required: true },
  { key: 'agentPort', label: 'Agent Port', required: false },
];

export function EditServerForm({ server, onSubmit, onCancel }: EditServerFormProps): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({
    name: server.name,
    host: server.host,
    port: String(server.port),
    username: server.username,
    privateKeyPath: server.privateKeyPath,
    agentPort: String(server.agentPort),
  });
  const [currentField, setCurrentField] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setCurrentField((i: number) => Math.max(0, i - 1));
      setError(null);
    }

    if (key.downArrow) {
      setCurrentField((i: number) => Math.min(FIELDS.length - 1, i + 1));
      setError(null);
    }

    if (key.return && currentField === FIELDS.length - 1) {
      handleSubmit();
    } else if (key.return) {
      setCurrentField((i: number) => Math.min(FIELDS.length - 1, i + 1));
    }

    // Ctrl+S to submit
    if (key.ctrl && input === 's') {
      handleSubmit();
    }
  });

  const handleSubmit = () => {
    // Validate required fields
    for (const field of FIELDS) {
      if (field.required && !values[field.key]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }

    // Expand ~ in path
    let keyPath = values.privateKeyPath ?? '';
    if (keyPath.startsWith('~')) {
      keyPath = join(homedir(), keyPath.slice(1));
    }

    try {
      updateServer(server.id, {
        name: values.name!.trim(),
        host: values.host!.trim(),
        port: parseInt(values.port ?? '22', 10) || 22,
        username: values.username!.trim(),
        privateKeyPath: keyPath,
        agentPort: parseInt(values.agentPort ?? '8443', 10) || 8443,
      });
      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update server');
    }
  };

  const handleChange = (fieldKey: string, value: string) => {
    setValues((prev: Record<string, string>) => ({ ...prev, [fieldKey]: value }));
    setError(null);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Edit Server: </Text>
        <Text>{server.name}</Text>
      </Box>
      
      <Box flexDirection="column">
        {FIELDS.map((field, index) => {
          const isActive = index === currentField;
          const value = values[field.key] ?? '';
          
          return (
            <Box key={field.key} marginBottom={index === FIELDS.length - 1 ? 0 : 1}>
              <Box width={16}>
                <Text color={isActive ? 'cyan' : 'gray'}>
                  {isActive ? '❯ ' : '  '}
                  {field.label}:
                </Text>
              </Box>
              <Box>
                {isActive ? (
                  <TextInput
                    value={value}
                    onChange={(v: string) => handleChange(field.key, v)}
                  />
                ) : (
                  <Text color={value ? 'white' : 'gray'}>
                    {value || '(empty)'}
                  </Text>
                )}
              </Box>
              {!field.required && isActive && (
                <Text dimColor> (optional)</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ Navigate fields • Enter: Next/Submit • Esc: Cancel
        </Text>
      </Box>
    </Box>
  );
}
