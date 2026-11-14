import { NextRequest, NextResponse } from "next/server";
import {
  getHumanApprovalSecret,
  getOperatorIdentity,
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
    if (!body || !body.platform) {
      return NextResponse.json(
        { detail: "Malformed request. Missing 'platform' parameter." },
        { status: 400 }
      );
    }

    const platform = String(body.platform).toLowerCase().trim();
    if (platform !== "telegram" && platform !== "teams") {
      return NextResponse.json(
        { detail: `Unsupported platform '${platform}'. Must be 'telegram' or 'teams'.` },
        { status: 400 }
      );
    }

    // 4. Server-Derived Caller Identity
    const operatorIdentity = getOperatorIdentity();

    // 5. Proxy to FastAPI Backend with Server-Side Secret
    const backendBase = resolveBackendApiBase();
    const workspaceId = req.headers.get("x-workspace-id") || body.workspaceId || "ws_personal_default";
    const proxyHeaders: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${secret}`,
      "X-Caller-ID": operatorIdentity,
      "X-Workspace-ID": workspaceId,
    };

    const backendResponse = await fetch(
      `${backendBase}/connected-accounts/${encodeURIComponent(platform)}/authorize-operator`,
      {
        method: "POST",
        headers: proxyHeaders,
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
        detail: "Failed to securely proxy authorize-operator request to backend.",
      },
      { status: 502 }
    );
  }
}
