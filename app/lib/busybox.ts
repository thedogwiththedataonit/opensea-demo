/**
 * OpenSea Marketplace — Busybox Chaos Engine
 *
 * Server-side chaos state manager for fault injection. When enabled, the busybox
 * probabilistically injects errors into API routes and subfunctions to simulate
 * production failure scenarios.
 *
 * The state is module-scoped (in-memory, per-process). It is controlled via the
 * /api/admin/busybox endpoint and automatically disabled when the admin page unloads.
 *
 * Each fault type maps to a specific MarketplaceError subclass:
 *  - http500  → InternalError
 *  - http502  → BadGatewayError (mimics Vercel ROUTER_EXTERNAL_TARGET_ERROR)
 *  - http503  → ServiceUnavailableError
 *  - http429  → RateLimitError
 *  - http422  → UnprocessableError
 *  - subfunctionCrash → InternalError (thrown inside getSparklineData/getOHLCData)
 *  - timeout  → TimeoutError (injected into simulateLatency)
 */

import {
  InternalError,
  BadGatewayError,
  ServiceUnavailableError,
  RateLimitError,
  UnprocessableError,
  TimeoutError,
} from './errors';
import { log } from './logger';

// ---------------------------------------------------------------------------
// State Types
// ---------------------------------------------------------------------------

export interface BusyboxFaults {
  /** Random 500 Internal Server Errors on any route */
  http500: boolean;
  /** Bad Gateway (502) — simulates upstream/external target failures (Vercel ROUTER_EXTERNAL_TARGET_ERROR) */
  http502: boolean;
  /** Service Unavailable (503) — simulates downstream outages */
  http503: boolean;
  /** Rate Limiting (429) — simulates throttling */
  http429: boolean;
  /** Unprocessable Entity (422) — simulates business logic failures */
  http422: boolean;
  /** Subfunction crashes — getSparklineData/getOHLCData throw */
  subfunctionCrash: boolean;
  /** Timeout — simulateLatency becomes 3-8 seconds */
  timeout: boolean;
}

export interface BusyboxState {
  /** Master switch — all fault injection is disabled when false */
  enabled: boolean;
  /** Probability (0.0 - 1.0) that an enabled fault fires on any given check */
  errorRate: number;
  /** Individual fault type toggles */
  enabledFaults: BusyboxFaults;
}

// ---------------------------------------------------------------------------
// Module-Scoped State
// ---------------------------------------------------------------------------

const state: BusyboxState = {
  enabled: false,
  errorRate: 0.3,
  enabledFaults: {
    http500: true,
    http502: true,
    http503: true,
    http429: true,
    http422: true,
    subfunctionCrash: true,
    timeout: true,
  },
};

// ---------------------------------------------------------------------------
// State Accessors
// ---------------------------------------------------------------------------

/** Returns a snapshot of the current busybox state. */
export function getBusyboxState(): BusyboxState {
  return {
    enabled: state.enabled,
    errorRate: state.errorRate,
    enabledFaults: { ...state.enabledFaults },
  };
}

/** Merges partial updates into the busybox state. */
export function setBusyboxState(partial: Partial<BusyboxState>): BusyboxState {
  if (partial.enabled !== undefined) state.enabled = partial.enabled;
  if (partial.errorRate !== undefined) state.errorRate = Math.max(0, Math.min(1, partial.errorRate));
  if (partial.enabledFaults) {
    Object.assign(state.enabledFaults, partial.enabledFaults);
  }
  const updated = getBusyboxState();
  log.info('busybox', 'state_updated', {
    enabled: updated.enabled, errorRate: `${Math.round(updated.errorRate * 100)}%`,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Fault Injection
// ---------------------------------------------------------------------------

export type FaultType = keyof BusyboxFaults;

/**
 * Returns true if a fault of the given type should fire right now.
 * Checks: master enabled, specific fault enabled, random roll vs errorRate.
 */
export function shouldInjectFault(faultType: FaultType): boolean {
  if (!state.enabled) return false;
  if (!state.enabledFaults[faultType]) return false;
  return Math.random() < state.errorRate;
}

/**
 * Checks whether a fault should be injected and throws the appropriate
 * MarketplaceError if so. Call this at strategic points in routes and subfunctions.
 *
 * @param faultType - Which fault category to check
 * @param context   - Additional context to include in the error for debugging
 * @throws MarketplaceError subclass if the fault fires
 */
export function maybeFault(
  faultType: FaultType,
  context?: Record<string, unknown>
): void {
  if (!shouldInjectFault(faultType)) return;

  log.warn('busybox', 'fault_injected', {
    type: faultType, route: context?.route as string, rate: `${Math.round(state.errorRate * 100)}%`,
    token: context?.token as string, slug: context?.slug as string,
  });

  const faultContext = {
    ...context,
    busybox: true,
    faultType,
    errorRate: state.errorRate,
  };

  switch (faultType) {
    case 'http500':
      throw new InternalError(
        'BUSYBOX_INTERNAL_ERROR',
        'Simulated internal server error (busybox chaos injection)',
        faultContext
      );

    case 'http502':
      throw new BadGatewayError(
        'BUSYBOX_BAD_GATEWAY',
        'Simulated bad gateway — upstream service returned invalid response (busybox chaos injection, mimics Vercel ROUTER_EXTERNAL_TARGET_ERROR)',
        faultContext
      );

    case 'http503':
      throw new ServiceUnavailableError(
        'BUSYBOX_SERVICE_UNAVAILABLE',
        'Simulated service unavailable (busybox chaos injection)',
        faultContext
      );

    case 'http429':
      throw new RateLimitError(
        'BUSYBOX_RATE_LIMITED',
        'Simulated rate limit exceeded (busybox chaos injection)',
        faultContext
      );

    case 'http422':
      throw new UnprocessableError(
        'BUSYBOX_UNPROCESSABLE',
        'Simulated unprocessable entity (busybox chaos injection)',
        faultContext
      );

    case 'subfunctionCrash':
      throw new InternalError(
        'BUSYBOX_SUBFUNCTION_CRASH',
        'Simulated subfunction crash (busybox chaos injection)',
        faultContext
      );

    case 'timeout':
      throw new TimeoutError(
        'BUSYBOX_TIMEOUT',
        'Simulated request timeout (busybox chaos injection)',
        faultContext
      );
  }
}
