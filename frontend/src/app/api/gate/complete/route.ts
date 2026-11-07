import { NextRequest, NextResponse } from "next/server";
import {
  getOperatorIdentity,
  isValidTaskId,
  validateSameOrigin,
} from "@/lib/server/security";

export const dynamic = "force-dynamic";

const BACKEND_BASE =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Same-Origin & CSRF Defense
    const originCheck = validateSameOrigin(req);
    if (!originCheck.valid && originCheck.errorResponse) {
      return originCheck.errorResponse;
    }

    // 2. Strict Server-Side Secret Verification (Fail-Closed, No Default Fallback)
    const secret = process.env.HUMAN_APPROVAL_SECRET;
    if (!secret || secret.trim() === "") {
      return NextResponse.json(
        {
          error: "Server Security Configuration Error",
          detail: "HUMAN_APPROVAL_SECRET is unconfigured on the Next.js server runtime.",
        },
        { status: 500 }
      );
    }

    // 3. Body & Parameter Validation
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { detail: "Malformed or missing JSON body in complete request." },
        { status: 400 }
      );
    }

    if (!isValidTaskId(body.taskId)) {
      return NextResponse.json(
        { detail: "Invalid or missing 'taskId' format. Must be an alphanumeric identifier." },
        { status: 400 }
      );
    }

    const taskId = body.taskId.trim();

    // 4. Server-Derived Caller Identity (Prevents Client Reviewer Impersonation)
    const operatorIdentity = getOperatorIdentity();

    // 5. Proxy to FastAPI Backend with Server-Side Secret
    const backendResponse = await fetch(`${BACKEND_BASE}/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secret}`,
        "X-Caller-ID": operatorIdentity,
      },
      cache: "no-store",
    });

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
        detail: "Failed to securely proxy completion request to backend.",
      },
      { status: 502 }
    );
  }
}
