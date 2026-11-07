import { NextResponse } from "next/server";
import { resolveBackendHost } from "@/lib/server/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const backendHost = resolveBackendHost();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${backendHost}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json(
        { status: "unhealthy", http_status: res.status },
        { status: 503 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    clearTimeout(timeoutId);
    return NextResponse.json(
      {
        status: "unreachable",
        target: `${backendHost}/health`,
        error: err.name === "AbortError" ? "Health check timed out (3s)" : err.message,
      },
      { status: 503 }
    );
  }
}

