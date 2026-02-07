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
  getMetrics,
} from '../utils/connection.js';
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
        await getConnection(server);
        if (!mountedRef.current) return;
        setStatus('connected');
        const info = await getSystemInfo(server);
        if (mountedRef.current) setSystemInfo(info);
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'Connection failed';
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
      await getConnection(server);
      setStatus('connected');
      const info = await getSystemInfo(server);
      setSystemInfo(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      setStatus('error');
    } finally {
      connectingRef.current = false;
    }
  }, [server?.id]);

  const disconnect = useCallback(() => {
    disconnectServer();
    setStatus('disconnected');
    setSystemInfo(null);
  }, []);

  return { status, systemInfo, error, connect, disconnect };
}

// =============================================================================
// useMetrics Hook - Poll metrics using the single connection
// =============================================================================

interface UseMetricsResult {
  cpu: number;
  memory: { used: number; total: number };
  disk: { used: number; total: number };
  loading: boolean;
}

export function useMetrics(server: Server | null, pollInterval: number = 3000): UseMetricsResult {
  const [metrics, setMetrics] = useState<UseMetricsResult>({
    cpu: 0,
    memory: { used: 0, total: 0 },
    disk: { used: 0, total: 0 },
    loading: true,
  });
  
  // Prevent concurrent fetches
  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    if (!server || !isConnected(server.id)) {
      return;
    }

    const fetchMetrics = async () => {
      // Skip if already fetching
      if (fetchingRef.current) {
        logger.debug('useMetrics: Skipping fetch, already in progress');
        return;
      }
      
      fetchingRef.current = true;
      
      try {
        const data = await getMetrics(server);
        if (mountedRef.current) {
          setMetrics({ ...data, loading: false });
        }
      } catch (err) {
        logger.debug('useMetrics: Fetch error', { error: err instanceof Error ? err.message : 'unknown' });
      } finally {
        fetchingRef.current = false;
      }
    };

    // Initial fetch
    fetchMetrics();

    // Poll - but only start next poll after previous completes
    const interval = setInterval(fetchMetrics, pollInterval);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [server?.id, pollInterval]);

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
