import { NextRequest, NextResponse } from "next/server";
import { resolveBackendApiBase } from "@/lib/server/security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.message) {
      return NextResponse.json(
        { detail: "Missing 'message' in request body." },
        { status: 400 }
      );
    }

    const workspaceId = (body.workspaceId || "ws_personal_default").trim();
    const backendBase = resolveBackendApiBase();
    const targetUrl = `${backendBase}/workspaces/${encodeURIComponent(workspaceId)}/assistant`;

    const backendRes = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Workspace-ID": workspaceId,
      },
      body: JSON.stringify({ message: body.message }),
      cache: "no-store",
    });

    const data = await backendRes.json().catch(() => null);

    if (!backendRes.ok) {
      return NextResponse.json(
        data || {
          detail: `Backend returned HTTP ${backendRes.status}`,
          target: targetUrl,
          backend_base: backendBase,
        },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Assistant Proxy Error",
        detail: err.message || "Failed to communicate with backend assistant endpoint.",
      },
      { status: 502 }
    );
  }
}

