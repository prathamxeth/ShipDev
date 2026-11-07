import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROD_API_URL = "https://shipdev.onrender.com/api/v1";

const BACKEND_BASE =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? PROD_API_URL : "http://localhost:8000/api/v1");
const BACKEND_HOST = BACKEND_BASE.replace(/\/api\/v1\/?$/, "");

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${BACKEND_HOST}/health`, {
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
        target: `${BACKEND_HOST}/health`,
        error: err.name === "AbortError" ? "Health check timed out (3s)" : err.message,
      },
      { status: 503 }
    );
  }
}

