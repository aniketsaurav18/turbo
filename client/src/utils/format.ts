// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format uptime in seconds to human readable string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  
  return parts.join(' ');
}

/**
 * Format percentage with fixed decimal places
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Create an ASCII progress bar
 */
export function progressBar(percent: number, width = 20): string {
  // Handle edge cases: NaN, Infinity, negative values
  if (!Number.isFinite(percent) || percent < 0) {
    percent = 0;
  } else if (percent > 100) {
    percent = 100;
  }
  
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Format a date to relative time (e.g., "5 min ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hr ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

/**
 * Format date to ISO-like short format
 */
export function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Pad string to fixed width
 */
export function padEnd(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

/**
 * Get color based on percentage (green -> yellow -> red)
 */
export function getPercentColor(percent: number): 'green' | 'yellow' | 'red' {
  if (percent < 60) return 'green';
  if (percent < 85) return 'yellow';
  return 'red';
}

/**
 * Get status color for Docker container
 */
export function getContainerStatusColor(state: string): 'green' | 'yellow' | 'red' | 'gray' {
  switch (state) {
    case 'running': return 'green';
    case 'paused': return 'yellow';
    case 'exited': return 'red';
    default: return 'gray';
  }
}
