/**
 * GET/POST /api/admin/busybox
 *
 * Admin endpoint for controlling the busybox chaos engine.
 * GET returns the current state, POST merges partial updates.
 *
 * This endpoint is intentionally NOT instrumented with busybox fault
 * injection — it must always be reachable to disable chaos mode.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBusyboxState, setBusyboxState } from "@/app/lib/busybox";
import { tracer, withSpan } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSpan(tracer, 'marketplace.admin.busybox.get', {}, async (span) => {
    const state = getBusyboxState();
    span.setAttribute('marketplace.busybox.enabled', state.enabled);
    span.setAttribute('marketplace.busybox.error_rate', state.errorRate);
    return NextResponse.json(state);
  });
}

export async function POST(request: NextRequest) {
  return withSpan(tracer, 'marketplace.admin.busybox.set', {}, async (span) => {
    try {
      const body = await request.json();
      const updated = setBusyboxState(body);
      span.setAttribute('marketplace.busybox.enabled', updated.enabled);
      span.setAttribute('marketplace.busybox.error_rate', updated.errorRate);
      return NextResponse.json(updated);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  });
}
