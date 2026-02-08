// =============================================================================
// Type Definitions for ServerTUI Client
// =============================================================================

/**
 * Server configuration stored in SQLite
 */
export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath: string;
  agentPort: number;
  createdAt: Date;
  lastConnected?: Date;
}

/**
 * Form data for adding/editing a server
 */
export interface ServerFormData {
  name: string;
  host: string;
  port: string;
  username: string;
  password?: string;
  privateKeyPath: string;
  agentPort: string;
}

/**
 * Available tabs in the server dashboard
 */
export enum Tab {
  Overview = 'Overview',
  SSH = 'SSH',
  Performance = 'Performance',
  Docker = 'Docker',
  Commands = 'Commands',
  Updates = 'Updates',
  Logs = 'Logs',
}

/**
 * All tabs in order for navigation
 */
export const ALL_TABS: Tab[] = [
  Tab.Overview,
  Tab.SSH,
  Tab.Performance,
  Tab.Docker,
  Tab.Commands,
  Tab.Updates,
  Tab.Logs,
];

/**
 * System metrics from the agent
 */
export interface Metrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  timestamp: number;
}

export interface CpuMetrics {
  usagePercent: number;
  cores: number;
  model: string;
}

export interface MemoryMetrics {
  total: number;      // bytes
  used: number;       // bytes
  free: number;       // bytes
  usagePercent: number;
}

export interface DiskMetrics {
  total: number;      // bytes
  used: number;       // bytes
  free: number;       // bytes
  usagePercent: number;
  mountPoint: string;
}

export interface NetworkMetrics {
  bytesRecv: number;
  bytesSent: number;
  packetsRecv: number;
  packetsSent: number;
}

/**
 * Docker container information
 */
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'created';
  ports: string[];
  created: string;
}

/**
 * Docker image information
 */
export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;       // bytes
  created: string;
}

/**
 * Docker status from agent
 */
export interface DockerStatus {
  installed: boolean;
  containers: DockerContainer[];
  images: DockerImage[];
}

/**
 * OS update/package information
 */
export interface PackageUpdate {
  name: string;
  currentVersion: string;
  newVersion: string;
  repository?: string;
}

/**
 * System information for Overview tab
 */
export interface SystemInfo {
  hostname: string;
  os: string;
  osVersion: string;
  kernel: string;
  uptime: number;     // seconds
  architecture: string;
}

/**
 * Session log entry stored in SQLite
 */
export interface LogEntry {
  id: string;
  serverId: string;
  timestamp: Date;
  type: LogType;
  content: string;
  metadata?: string;  // JSON string for extra data
}

export type LogType = 'command' | 'ssh' | 'update' | 'docker' | 'error' | 'info';

/**
 * Connection status for a server
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Agent connection state
 */
export interface AgentState {
  status: ConnectionStatus;
  metrics?: Metrics;
  systemInfo?: SystemInfo;
  docker?: DockerStatus;
  updates?: PackageUpdate[];
  error?: string;
}

/**
 * Application view state
 */
export type AppView = 'serverList' | 'dashboard' | 'addServer' | 'editServer';

/**
 * Global application state
 */
export interface AppState {
  view: AppView;
  selectedServer?: Server;
  activeTab: Tab;
  servers: Server[];
}

/**
 * Command execution result
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;   // ms
}

/**
 * WebSocket message types from agent
 */
export type AgentMessageType = 
  | 'metrics'
  | 'systemInfo'
  | 'docker'
  | 'updates'
  | 'commandResult'
  | 'error';

export interface AgentMessage {
  type: AgentMessageType;
  data: unknown;
  timestamp: number;
}
