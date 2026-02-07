// =============================================================================
// Edit Server Form Component
// =============================================================================

import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { homedir } from 'os';
import { join } from 'path';
import type { Server } from '../types/types.js';
import { updateServer } from '../db/database.js';
import { logger } from '../utils/logger.js';

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

export function EditServerForm({ server, onSubmit, onCancel }: EditServerFormProps) {
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

  useKeyboard((key) => {
    if (key.name === 'escape') {
      logger.info('User cancelled edit server form', { id: server.id });
      onCancel();
      return;
    }

    if (key.name === 'up') {
      setCurrentField((i: number) => Math.max(0, i - 1));
      setError(null);
    }

    if (key.name === 'down') {
      setCurrentField((i: number) => Math.min(FIELDS.length - 1, i + 1));
      setError(null);
    }

    if (key.name === 'enter' && currentField === FIELDS.length - 1) {
      handleSubmit();
    } else if (key.name === 'enter') {
      setCurrentField((i: number) => Math.min(FIELDS.length - 1, i + 1));
    }

    // Ctrl+S to submit
    if (key.ctrl && key.name === 's') {
      handleSubmit();
    }
  });

  const handleSubmit = () => {
    // Validate required fields
    for (const field of FIELDS) {
      if (field.required && !values[field.key]?.trim()) {
        logger.warn('EditServerForm validation failed', { id: server.id, field: field.key, value: values[field.key] });
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
      logger.info('Updating server', { id: server.id, updates: values });
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
      logger.error('Failed to update server', { id: server.id, error: err });
      setError(err instanceof Error ? err.message : 'Failed to update server');
    }
  };

  const handleChange = (newValue: string) => {
    const fieldKey = FIELDS[currentField]?.key;
    if (fieldKey) {
      setValues((prev: Record<string, string>) => ({ ...prev, [fieldKey]: newValue }));
      setError(null);
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text><strong><span fg="#00ffff">Edit Server: </span></strong></text>
        <text>{server.name}</text>
      </box>
      
      <box flexDirection="column">
        {FIELDS.map((field, index) => {
          const isActive = index === currentField;
          const value = values[field.key] ?? '';
          
          return (
            <box key={field.key} marginBottom={index === FIELDS.length - 1 ? 0 : 1}>
              <box width={16}>
                <text>
                  <span fg={isActive ? '#00ffff' : '#888888'}>
                    {isActive ? '❯ ' : '  '}
                    {field.label}:
                  </span>
                </text>
              </box>
              <box>
                {isActive ? (
                  <input
                    value={value}
                    onChange={(v: string) => handleChange(v)}
                    focused
                    width={30}
                  />
                ) : (
                  <text>
                    <span fg={value ? '#ffffff' : '#888888'}>
                      {value || '(empty)'}
                    </span>
                  </text>
                )}
              </box>
              {!field.required && isActive && (
                <text><span fg="#888888"> (optional)</span></text>
              )}
            </box>
          );
        })}
      </box>

      {error && (
        <box marginTop={1}>
          <text><span fg="#ff0000">✗ {error}</span></text>
        </box>
      )}

      <box marginTop={1}>
        <text>
          <span fg="#888888">
            ↑↓ Navigate fields • Enter: Next/Submit • Esc: Cancel
          </span>
        </text>
      </box>
    </box>
  );
}
