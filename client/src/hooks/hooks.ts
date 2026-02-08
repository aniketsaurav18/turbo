// =============================================================================
// Custom React Hooks
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Server, ConnectionStatus, SystemInfo } from '../types/types.js';
import { 
  getConnection, 
  isConnected, 
  disconnectServer, 
  getSystemInfo, 
} from '../utils/connection.js';
import { connectAgentWS, disconnectAgentWS } from '../utils/agent.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// useConnection Hook - Single connection for everything
// =============================================================================

interface UseConnectionResult {
  status: ConnectionStatus;
  systemInfo: SystemInfo | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useConnection(server: Server | null): UseConnectionResult {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);

  // Auto-connect when server changes
  useEffect(() => {
    mountedRef.current = true;
    
    if (!server) {
      setStatus('disconnected');
      setSystemInfo(null);
      setError(null);
      return;
    }

    // Check if already connected to this server
    if (isConnected(server.id)) {
      setStatus('connected');
      // Fetch system info
      getSystemInfo(server).then(info => {
        if (mountedRef.current) setSystemInfo(info);
      }).catch(() => {});
      return;
    }

    // Auto-connect
    const autoConnect = async () => {
      if (connectingRef.current) return;
      
      connectingRef.current = true;
      setStatus('connecting');
      setError(null);

      try {
        logger.debug('useConnection: Auto-connecting', { server: server.id });
        await getConnection(server);
        if (!mountedRef.current) return;
        setStatus('connected');
        const info = await getSystemInfo(server);
        if (mountedRef.current) setSystemInfo(info);
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'Connection failed';
        logger.error('useConnection: Auto-connect failed', { server: server.id, error: msg });
        setError(msg);
        setStatus('error');
      } finally {
        connectingRef.current = false;
      }
    };

    autoConnect();
    
    return () => {
      mountedRef.current = false;
    };
  }, [server?.id]);

  const connect = useCallback(async () => {
    if (!server || connectingRef.current) return;

    connectingRef.current = true;
    setStatus('connecting');
    setError(null);

    try {
      logger.info('useConnection: Manual connect requested', { server: server.id });
      await getConnection(server);
      setStatus('connected');
      const info = await getSystemInfo(server);
      setSystemInfo(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      logger.error('useConnection: Manual connect failed', { server: server.id, error: msg });
      setError(msg);
      setStatus('error');
    } finally {
      connectingRef.current = false;
    }
  }, [server?.id]);

  const disconnect = useCallback(() => {
    logger.info('useConnection: Disconnecting', { server: server?.id });
    disconnectServer();
    setStatus('disconnected');
    setSystemInfo(null);
  }, [server?.id]);

  return { status, systemInfo, error, connect, disconnect };
}

// =============================================================================
// useMetrics Hook - Stream metrics via agent WebSocket
// =============================================================================

interface UseMetricsResult {
  cpu: number;
  memory: { used: number; total: number };
  disk: { used: number; total: number };
  loading: boolean;
  error: string | null;
}

export function useMetrics(server: Server | null, _pollInterval?: number): UseMetricsResult {
  const [metrics, setMetrics] = useState<UseMetricsResult>({
    cpu: 0,
    memory: { used: 0, total: 0 },
    disk: { used: 0, total: 0 },
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!server) {
      return;
    }

    logger.info('useMetrics: Connecting to agent WebSocket', { serverId: server.id });

    const disconnect = connectAgentWS(
      server,
      (agentMetrics) => {
        logger.debug('useMetrics: Received metrics from agent', { serverId: server.id });
        setMetrics({
          cpu: agentMetrics.cpu?.usagePercent ?? 0,
          memory: {
            used: agentMetrics.memory?.used ?? 0,
            total: agentMetrics.memory?.total ?? 0,
          },
          disk: {
            used: agentMetrics.disk?.used ?? 0,
            total: agentMetrics.disk?.total ?? 0,
          },
          loading: false,
          error: null,
        });
      },
      (error) => {
        logger.error('useMetrics: WebSocket error', { serverId: server.id, error: error.message });
        setMetrics(prev => ({ ...prev, loading: false, error: error.message }));
      }
    );

    return () => {
      disconnect();
    };
  }, [server?.id]);

  return metrics;
}

// =============================================================================
// useInterval Hook - Run callback at intervals
// =============================================================================

export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    
    const tick = () => savedCallback.current();
    const id = setInterval(tick, delay);
    
    return () => clearInterval(id);
  }, [delay]);
}

// Legacy hooks for backwards compatibility
export { useConnection as useAgent, useConnection as useSSH };
