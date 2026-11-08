import { NextRequest, NextResponse } from "next/server";
import {
  getHumanApprovalSecret,
  getOperatorIdentity,
  isValidTaskId,
  resolveBackendApiBase,
  validateSameOrigin,
} from "@/lib/server/security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Same-Origin & CSRF Defense
    const originCheck = validateSameOrigin(req);
    if (!originCheck.valid && originCheck.errorResponse) {
      return originCheck.errorResponse;
    }

    // 2. Strict Server-Side Secret Verification (Fail-Closed against Insecure Placeholders)
    const secret = getHumanApprovalSecret();
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
        { detail: "Malformed or missing JSON body in rejection request." },
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
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    const returnTo = typeof body.return_to === "string" && body.return_to.trim() ? body.return_to.trim() : "FIX_PROPOSED";

    if (!feedback) {
      return NextResponse.json(
        { detail: "Rejection requires mandatory non-empty 'feedback' explaining the reason." },
        { status: 400 }
      );
    }

    // 4. Server-Derived Caller Identity (Prevents Client Reviewer Impersonation)
    const operatorIdentity = getOperatorIdentity();

    // 5. Proxy to FastAPI Backend with Server-Side Secret
    const backendBase = resolveBackendApiBase();
    const workspaceId = req.headers.get("x-workspace-id") || body.workspaceId;
    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${secret}`,
      "X-Caller-ID": operatorIdentity,
    };
    if (workspaceId) {
      proxyHeaders["X-Workspace-ID"] = workspaceId;
    }

    const backendResponse = await fetch(`${backendBase}/tasks/${encodeURIComponent(taskId)}/reject`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({
        reviewer_id: operatorIdentity,
        feedback: feedback,
        return_to: returnTo,
      }),
      cache: "no-store",
    });

    const responseData = await backendResponse.json().catch(() => null);

    if (!backendResponse.ok) {
      const stage = backendResponse.headers.get("x-auth-rejection-stage") || "unknown";
      const tokenLen = backendResponse.headers.get("x-auth-token-len");
      console.warn(
        `[BFF_REJECT] Task ${taskId} rejection rejected by backend: status=${backendResponse.status}, stage=${stage}, tokenLen=${tokenLen}`
      );
      return NextResponse.json(
        responseData || {
          detail: `Backend returned HTTP ${backendResponse.status}`,
          authStage: stage,
        },
        {
          status: backendResponse.status,
          headers: {
            ...(stage ? { "X-Auth-Rejection-Stage": stage } : {}),
            ...(tokenLen ? { "X-Auth-Token-Len": tokenLen } : {}),
          },
        }
      );
    }

    return NextResponse.json(responseData, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "BFF Proxy Error",
        detail: "Failed to securely proxy rejection request to backend.",
      },
      { status: 502 }
    );
  }
}
