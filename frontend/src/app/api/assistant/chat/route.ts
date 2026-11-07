import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROD_API_URL = "https://shipdev.onrender.com/api/v1";

const BACKEND_BASE =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? PROD_API_URL : "http://localhost:8000/api/v1");

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

    const backendRes = await fetch(
      `${BACKEND_BASE}/workspaces/${encodeURIComponent(workspaceId)}/assistant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Workspace-ID": workspaceId,
        },
        body: JSON.stringify({ message: body.message }),
        cache: "no-store",
      }
    );

    const data = await backendRes.json().catch(() => null);

    if (!backendRes.ok) {
      return NextResponse.json(
        data || { detail: `Backend returned HTTP ${backendRes.status}` },
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

