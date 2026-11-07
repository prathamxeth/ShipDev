import { NextRequest, NextResponse } from "next/server";
import { isValidTaskId } from "@/lib/server/security";

export const dynamic = "force-dynamic";

const BACKEND_BASE =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/**
 * Same-Origin SSE Proxy for Task Lifecycle Events
 *
 * Browsers connect to this same-origin route (/api/tasks/{taskId}/events).
 * Native browser EventSource cannot supply custom Authorization headers without leaking
 * secrets in URL query parameters. This proxy forwards the SSE stream from FastAPI
 * while preserving server-side credentials and strictly validating task identifiers.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const { taskId } = params;

  // 1. Strict task ID format validation
  if (!isValidTaskId(taskId)) {
    return NextResponse.json(
      { detail: "Invalid task ID format. Must be an alphanumeric identifier." },
      { status: 400 }
    );
  }

  // 2. Extract query parameters & headers
  const { searchParams } = new URL(req.url);
  const replayAll = searchParams.get("replay_all") === "true";
  const queryLastEventId = searchParams.get("last_event_id");
  const headerLastEventId = req.headers.get("last-event-id");
  const lastEventId = headerLastEventId || queryLastEventId;

  // 3. Construct backend SSE target URL
  const backendUrl = new URL(`${BACKEND_BASE}/tasks/${encodeURIComponent(taskId)}/events`);
  if (replayAll) {
    backendUrl.searchParams.set("replay_all", "true");
  }
  if (lastEventId) {
    backendUrl.searchParams.set("last_event_id", lastEventId);
  }

  const forwardHeaders: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };
  if (lastEventId) {
    forwardHeaders["Last-Event-ID"] = lastEventId;
  }

  try {
    const backendRes = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: forwardHeaders,
      cache: "no-store",
      signal: req.signal,
    });

    if (!backendRes.ok) {
      const errText = await backendRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Backend SSE stream failed",
          detail: errText || `Backend returned HTTP ${backendRes.status}`,
        },
        { status: backendRes.status }
      );
    }

    if (!backendRes.body) {
      return NextResponse.json(
        { error: "SSE Stream Error", detail: "Empty stream body from backend" },
        { status: 502 }
      );
    }

    // 4. Return the streaming response directly to the browser client
    return new Response(backendRes.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "SSE Gateway Error",
        detail: `Failed to connect to backend SSE endpoint: ${err.message || err}`,
      },
      { status: 502 }
    );
  }
}

