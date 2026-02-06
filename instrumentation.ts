import { registerOTel } from '@vercel/otel';

/**
 * OpenTelemetry Instrumentation Entry Point
 *
 * Registers the OpenSea marketplace mock application with Vercel's
 * OpenTelemetry integration. This file is automatically detected by
 * Next.js 16 and executed during server startup.
 *
 * Service name 'opensea-marketplace' is used to identify all traces
 * originating from this application in observability backends.
 */
export function register() {
  registerOTel({ serviceName: 'opensea-demo' });
}
