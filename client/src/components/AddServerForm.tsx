// =============================================================================
// Add Server Form Component
// =============================================================================

import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { homedir } from 'os';
import { join } from 'path';
import { addServer } from '../db/database.js';
import { logger } from '../utils/logger.js';

interface AddServerFormProps {
  onSubmit: () => void;
  onCancel: () => void;
}

interface FormField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type?: 'text' | 'password';
}

const FIELDS: FormField[] = [
  { key: 'name', label: 'Server Name', placeholder: 'my-server', required: true },
  { key: 'host', label: 'Host/IP', placeholder: '192.168.1.100', required: true },
  { key: 'port', label: 'SSH Port', placeholder: '22', required: false },
  { key: 'username', label: 'Username', placeholder: 'root', required: true },
  { key: 'password', label: 'Password', placeholder: '(optional)', required: false, type: 'password' },
  { key: 'privateKeyPath', label: 'Private Key', placeholder: '~/.ssh/id_rsa', required: false },
  { key: 'agentPort', label: 'Agent Port', placeholder: '8443', required: false },
];

export function AddServerForm({ onSubmit, onCancel }: AddServerFormProps) {
  const [values, setValues] = useState<Record<string, string>>({
    name: '',
    host: '',
    port: '22',
    username: '',
    password: '',
    privateKeyPath: '',
    agentPort: '8443',
  });
  const [currentField, setCurrentField] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useKeyboard((key) => {
    if (key.name === 'escape') {
      logger.info('User cancelled add server form');
      onCancel();
      return;
    }

    if (key.name === 'up') {
      setCurrentField(i => (i - 1 + FIELDS.length) % FIELDS.length);
      setError(null);
    }

    if (key.name === 'down' || key.name === 'tab') {
      setCurrentField(i => (i + 1) % FIELDS.length);
      setError(null);
    }

    if (key.name === 'return' && currentField === FIELDS.length - 1) {
      handleSubmit();
    } else if (key.name === 'return') {
      setCurrentField(i => Math.min(FIELDS.length - 1, i + 1));
    }

    // Ctrl+S to submit
    if (key.ctrl && key.name === 's') {
      handleSubmit();
    }
  });

  const handleSubmit = () => {
    logger.debug('Validating add server form fields');
    // Validate required fields
    for (const field of FIELDS) {
      if (field.required && !values[field.key]?.trim()) {
        logger.warn(`Validation failed: ${field.label} is required`);
        setError(`${field.label} is required`);
        return;
      }
    }

    // Ensure at least authentication method is provided
    if (!values.password?.trim() && !values.privateKeyPath?.trim()) {
      setError('Either Password or Private Key is required');
      return;
    }

    // Expand ~ in path
    let keyPath = values.privateKeyPath ?? '';
    if (keyPath.startsWith('~')) {
      keyPath = join(homedir(), keyPath.slice(1));
    }

    try {
      logger.info('Attempting to add new server', { name: values.name, host: values.host });
      addServer({
        name: values.name!.trim(),
        host: values.host!.trim(),
        port: parseInt(values.port ?? '22', 10) || 22,
        username: values.username!.trim(),
        password: values.password?.trim() || undefined,
        privateKeyPath: keyPath.trim(),
        agentPort: parseInt(values.agentPort ?? '8443', 10) || 8443,
      });
      onSubmit();
    } catch (err) {
      logger.error('Failed to add server', { error: err });
      setError(err instanceof Error ? err.message : 'Failed to add server');
    }
  };

  const handleChange = (newValue: string) => {
    const fieldKey = FIELDS[currentField]?.key;
    if (fieldKey) {
      setValues(prev => ({ ...prev, [fieldKey]: newValue }));
      setError(null);
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text><strong><span fg="#00ffff">Add New Server</span></strong></text>
      </box>
      
      <box flexDirection="column">
        {FIELDS.map((field, index) => {
          const isActive = index === currentField;
          const value = values[field.key] ?? '';
          
          return (
            <box key={field.key} flexDirection="row" marginBottom={index === FIELDS.length - 1 ? 0 : 1}>
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
                    onChange={(v) => handleChange(v)}
                    placeholder={field.placeholder}
                    focused
                    width={30}

                  />
                ) : (
                  <text>
                    <span fg={value ? '#ffffff' : '#888888'}>
                      {field.type === 'password' && value ? '*'.repeat(value.length) : (value || field.placeholder)}
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
