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
 * Validates that an incoming state-changing request originates strictly
 * from the canonical ShipDev application origin.
 *
 * Checks:
 * 1. Origin header presence (rejects missing Origin on state-changing browser calls).
 * 2. Origin matches allowed canonical origins (e.g. http://localhost:3000).
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

  // Configured application origin (defaults to local Next.js ports)
  const configuredAppOrigin = process.env.APP_ORIGIN;
  const allowedOrigins = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(configuredAppOrigin ? [configuredAppOrigin] : []),
  ]);

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

  // 2. Validate Origin against allowed canonical origins
  if (!allowedOrigins.has(origin)) {
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
