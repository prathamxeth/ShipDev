import { NextRequest, NextResponse } from "next/server";
import { isValidTaskId } from "@/lib/server/security";

export const dynamic = "force-dynamic";

const BACKEND_BASE =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const taskId = params.taskId;
    if (!isValidTaskId(taskId)) {
      return NextResponse.json(
        { detail: "Invalid taskId format." },
        { status: 400 }
      );
    }

    const backendResponse = await fetch(
      `${BACKEND_BASE}/tasks/${encodeURIComponent(taskId)}/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const responseData = await backendResponse.json().catch(() => null);

    if (!backendResponse.ok) {
      return NextResponse.json(
        responseData || { detail: `Backend returned HTTP ${backendResponse.status}` },
        { status: backendResponse.status }
      );
    }

    return NextResponse.json(responseData, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "BFF Proxy Error",
        detail: err.message || "Failed to proxy execution request to backend.",
      },
      { status: 502 }
    );
  }
}
