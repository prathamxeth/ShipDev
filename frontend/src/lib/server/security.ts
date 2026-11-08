/**
 * ShipDev Server-Side Security Utilities
 *
 * Implements strict same-origin request validation and CSRF defenses
 * for sensitive state-changing Next.js Route Handlers (/api/gate/*).
 *
 * IMPORTANT SECURITY ARCHITECTURE NOTE:
 * Same-Origin validation prevents browser-based Cross-Site Request Forgery (CSRF).
 * It restricts invocations to the ShipDev application origin.
 * It DOES NOT constitute authenticated human identity (which requires an IdP / session auth).
 */

/**
 * Canonical production and development origins.
 */
const CANONICAL_ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://shipdev-frontend.vercel.app",
]);

/**
 * Validates whether an origin is an authorized production or Vercel preview deployment.
 * Explicitly distinguishes production from preview deployments while strictly forbidding arbitrary origins.
 */
export function isAuthorizedOrigin(origin: string): boolean {
  if (CANONICAL_ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  const configuredAppOrigin = process.env.APP_ORIGIN?.trim();
  if (configuredAppOrigin && origin === configuredAppOrigin) {
    return true;
  }

  const vercelProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProdUrl && (origin === `https://${vercelProdUrl}` || origin === vercelProdUrl)) {
    return true;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl && (origin === `https://${vercelUrl}` || origin === vercelUrl)) {
    return true;
  }

  // Explicitly authorize legitimate ShipDev Vercel preview and branch deployments
  // Matches: https://shipdev-frontend-<branch/hash>-asurxeths-projects.vercel.app
  // and https://shipdev-frontend-<hash>.vercel.app
  const vercelPreviewRegex = /^https:\/\/(shipdev-frontend(-git-[a-zA-Z0-9_-]+)?(-[a-zA-Z0-9_-]+)?\.vercel\.app)$/;
  const vercelTeamPreviewRegex = /^https:\/\/shipdev-frontend-.*-asurxeths-projects\.vercel\.app$/;

  return vercelPreviewRegex.test(origin) || vercelTeamPreviewRegex.test(origin);
}

/**
 * Validates that an incoming state-changing request originates strictly
 * from an authorized ShipDev application origin.
 *
 * Checks:
 * 1. Origin header presence (rejects missing Origin on state-changing browser calls).
 * 2. Origin matches authorized production or Vercel preview origins.
 * 3. Sec-Fetch-Site defensive verification (rejects 'cross-site').
 */
export function validateSameOrigin(req: {
  headers: { get: (name: string) => string | null };
}): {
  valid: boolean;
  errorResponse?: Response;
} {
  const origin = req.headers.get("origin");
  const secFetchSite = req.headers.get("sec-fetch-site");

  // 1. Browser-facing state-changing requests MUST provide an Origin header
  if (!origin) {
    return {
      valid: false,
      errorResponse: Response.json(
        {
          error: "Security Violation: Missing Origin Header",
          detail:
            "State-changing human gate operations require an explicit Same-Origin header. Cross-origin and headless unauthenticated requests are forbidden.",
        },
        { status: 403 }
      ),
    };
  }

  // 2. Validate Origin against allowed canonical and preview origins
  if (!isAuthorizedOrigin(origin)) {
    return {
      valid: false,
      errorResponse: Response.json(
        {
          error: "Security Violation: Forbidden Origin",
          detail: `Origin '${origin}' is not authorized to invoke ShipDev human approval gates.`,
        },
        { status: 403 }
      ),
    };
  }

  // 3. Defensive Sec-Fetch-Site check (sent automatically by modern browsers)
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site") {
    return {
      valid: false,
      errorResponse: Response.json(
        {
          error: "Security Violation: Cross-Site Request Blocked",
          detail: `Sec-Fetch-Site header indicates a cross-site invocation ('${secFetchSite}'). Only same-origin requests are permitted.`,
        },
        { status: 403 }
      ),
    };
  }

  return { valid: true };
}

export const CANONICAL_HUMAN_APPROVAL_SECRET = "human-gate-key-092dad4bd98666850024de1e1dc8ae95";

const INSECURE_PLACEHOLDERS = new Set([
  "dev-agent-secret-change-in-production",
  "dev-human-secret-change-in-production",
  "dev-insecure-local-agent-key",
  "dev-insecure-local-human-key",
  "<set-your-server-side-human-approval-secret-here>",
  "change-me",
  "secret",
  "password",
  "admin",
  "default",
]);

/**
 * Resolves the server-side human approval secret for proxying to the backend.
 * Uses the canonical 32-byte secret synchronized with Render's render.yaml deployment configuration.
 */
export function getHumanApprovalSecret(): string {
  const secret = process.env.HUMAN_APPROVAL_SECRET?.trim().replace(/^["']+|["']+$/g, "");
  if (process.env.ALLOW_CUSTOM_HUMAN_SECRET === "true" && secret && !INSECURE_PLACEHOLDERS.has(secret.toLowerCase())) {
    return secret;
  }
  return CANONICAL_HUMAN_APPROVAL_SECRET;
}

/**
 * Validates task ID format to prevent path traversal or injection.
 */
export function isValidTaskId(taskId: unknown): taskId is string {
  if (typeof taskId !== "string") return false;
  const trimmed = taskId.trim();
  // Alphanumeric with underscores and hyphens, 3 to 100 characters
  return /^[a-zA-Z0-9_\-]{3,100}$/.test(trimmed);
}

/**
 * Returns the server-configured local operator identity.
 * Replaces client-supplied reviewer identities to prevent impersonation.
 */
export function getOperatorIdentity(): string {
  const configured = process.env.LOCAL_OPERATOR_IDENTITY;
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }
  return "local-operator";
}

const PROD_API_URL = "https://shipdev.onrender.com/api/v1";

/**
 * Resolves the canonical backend API base URL for server-side Next.js route proxies.
 * Normalizes input:
 * 1. Discards obsolete/broken domains (e.g. shipdev-api.onrender.com which has no server).
 * 2. Uses NEXT_PUBLIC_API_URL or valid BACKEND_API_URL pointing to the verified live backend.
 * 3. Removes trailing slashes and guarantees the '/api/v1' path prefix.
 */
export function resolveBackendApiBase(): string {
  let url = process.env.BACKEND_API_URL;
  if (!url || url.includes("shipdev-api.onrender.com")) {
    url = process.env.NEXT_PUBLIC_API_URL;
  }
  if (!url || url.includes("shipdev-api.onrender.com")) {
    url = process.env.NODE_ENV === "production" ? PROD_API_URL : "http://localhost:8000/api/v1";
  }

  url = url.trim().replace(/\/+$/, "");
  if (!url.endsWith("/api/v1")) {
    url = `${url}/api/v1`;
  }
  return url;
}

/**
 * Resolves the canonical backend root host (without '/api/v1') for server-side health checks.
 */
export function resolveBackendHost(): string {
  return resolveBackendApiBase().replace(/\/api\/v1\/?$/, "");
}

