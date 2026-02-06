/**
 * OpenSea Marketplace — Centralized Structured Logger
 *
 * Standardized console logging for all backend operations.
 * Every log line follows:
 *   [TIMESTAMP] [LEVEL] [SERVICE] operation | key=value key=value ...
 *
 * Service tags match the OTel tracer names:
 *   api-gateway, data-service, enrichment, price-engine, search-engine, busybox
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ServiceTag =
  | 'api-gateway'
  | 'data-service'
  | 'enrichment'
  | 'price-engine'
  | 'search-engine'
  | 'busybox'
  | 'admin';

function timestamp(): string {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  const parts = Object.entries(meta).map(([k, v]) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return `${k}=${v}`;
    if (typeof v === 'number') return `${k}=${v}`;
    if (typeof v === 'boolean') return `${k}=${v}`;
    return `${k}=${JSON.stringify(v)}`;
  }).filter(Boolean);
  return parts.length > 0 ? ' | ' + parts.join(' ') : '';
}

function pad(s: string, len: number): string {
  return s.padEnd(len);
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info:  'INFO ',
  warn:  'WARN ',
  error: 'ERROR',
};

function formatLine(level: LogLevel, service: ServiceTag, operation: string, meta?: Record<string, unknown>): string {
  return `[${timestamp()}] [${LEVEL_LABELS[level]}] [${pad(service, 14)}] ${operation}${formatMeta(meta)}`;
}

function logDebug(service: ServiceTag, operation: string, meta?: Record<string, unknown>): void {
  console.log(formatLine('debug', service, operation, meta));
}

function logInfo(service: ServiceTag, operation: string, meta?: Record<string, unknown>): void {
  console.log(formatLine('info', service, operation, meta));
}

function logWarn(service: ServiceTag, operation: string, meta?: Record<string, unknown>): void {
  console.warn(formatLine('warn', service, operation, meta));
}

function logError(service: ServiceTag, operation: string, meta?: Record<string, unknown>): void {
  console.error(formatLine('error', service, operation, meta));
}

export const log = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
};
