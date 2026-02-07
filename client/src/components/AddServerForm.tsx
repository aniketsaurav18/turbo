// =============================================================================
// Add Server Form Component
// =============================================================================

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { homedir } from 'os';
import { join } from 'path';
import { addServer } from '../db/database.js';

interface AddServerFormProps {
  onSubmit: () => void;
  onCancel: () => void;
}

interface FormField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

const FIELDS: FormField[] = [
  { key: 'name', label: 'Server Name', placeholder: 'my-server', required: true },
  { key: 'host', label: 'Host/IP', placeholder: '192.168.1.100', required: true },
  { key: 'port', label: 'SSH Port', placeholder: '22', required: false },
  { key: 'username', label: 'Username', placeholder: 'root', required: true },
  { key: 'privateKeyPath', label: 'Private Key', placeholder: '~/.ssh/id_rsa', required: true },
  { key: 'agentPort', label: 'Agent Port', placeholder: '8443', required: false },
];

export function AddServerForm({ onSubmit, onCancel }: AddServerFormProps): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({
    name: '',
    host: '',
    port: '22',
    username: '',
    privateKeyPath: join(homedir(), '.ssh', 'id_rsa'),
    agentPort: '8443',
  });
  const [currentField, setCurrentField] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setCurrentField(i => Math.max(0, i - 1));
      setError(null);
    }

    if (key.downArrow) {
      setCurrentField(i => Math.min(FIELDS.length - 1, i + 1));
      setError(null);
    }

    if (key.return && currentField === FIELDS.length - 1) {
      handleSubmit();
    } else if (key.return) {
      setCurrentField(i => Math.min(FIELDS.length - 1, i + 1));
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
      addServer({
        name: values.name!.trim(),
        host: values.host!.trim(),
        port: parseInt(values.port ?? '22', 10) || 22,
        username: values.username!.trim(),
        privateKeyPath: keyPath,
        agentPort: parseInt(values.agentPort ?? '8443', 10) || 8443,
      });
      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add server');
    }
  };

  const handleChange = (fieldKey: string, value: string) => {
    setValues(prev => ({ ...prev, [fieldKey]: value }));
    setError(null);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold color="cyan">Add New Server</Text></Box>
      
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
                    onChange={(v) => handleChange(field.key, v)}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <Text color={value ? 'white' : 'gray'}>
                    {value || field.placeholder}
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
