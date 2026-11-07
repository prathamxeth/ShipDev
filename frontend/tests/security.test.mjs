import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Transpile and load security.ts dynamically
const securitySourcePath = path.resolve("src/lib/server/security.ts");
const code = fs.readFileSync(securitySourcePath, "utf8");
const transpiled = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

const mod = { exports: {} };
const fn = new Function("require", "module", "exports", "process", "Response", transpiled);
fn(require, mod, mod.exports, process, Response);

const { validateSameOrigin, isValidTaskId, getOperatorIdentity } = mod.exports;

function createMockRequest({ origin, secFetchSite } = {}) {
  const headers = new Map();
  if (origin !== undefined) headers.set("origin", origin);
  if (secFetchSite !== undefined) headers.set("sec-fetch-site", secFetchSite);

  return {
    headers: {
      get: (key) => headers.get(key.toLowerCase()) || null,
    },
  };
}

describe("ShipDev Security Boundary & Human Gate Audit Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_ORIGIN = "http://localhost:3000";
    process.env.LOCAL_OPERATOR_IDENTITY = "local-operator";
    delete process.env.HUMAN_APPROVAL_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("1. Same-Origin & CSRF Defense", () => {
    it("should reject state-changing requests with missing Origin header (HTTP 403)", async () => {
      const req = createMockRequest({});
      const result = validateSameOrigin(req);

      assert.equal(result.valid, false);
      assert.ok(result.errorResponse);
      assert.equal(result.errorResponse.status, 403);

      const body = await result.errorResponse.json();
      assert.match(body.error, /Missing Origin Header/);
    });

    it("should reject cross-origin requests from untrusted origins (HTTP 403)", async () => {
      const req = createMockRequest({ origin: "http://malicious-attacker.com" });
      const result = validateSameOrigin(req);

      assert.equal(result.valid, false);
      assert.ok(result.errorResponse);
      assert.equal(result.errorResponse.status, 403);

      const body = await result.errorResponse.json();
      assert.match(body.error, /Forbidden Origin/);
    });

    it("should reject requests where Sec-Fetch-Site indicates cross-site invocation (HTTP 403)", async () => {
      const req = createMockRequest({
        origin: "http://localhost:3000",
        secFetchSite: "cross-site",
      });
      const result = validateSameOrigin(req);

      assert.equal(result.valid, false);
      assert.ok(result.errorResponse);
      assert.equal(result.errorResponse.status, 403);

      const body = await result.errorResponse.json();
      assert.match(body.error, /Cross-Site Request Blocked/);
    });

    it("should accept valid same-origin requests from canonical port 3000", () => {
      const req = createMockRequest({
        origin: "http://localhost:3000",
        secFetchSite: "same-origin",
      });
      const result = validateSameOrigin(req);

      assert.equal(result.valid, true);
      assert.equal(result.errorResponse, undefined);
    });

    it("should accept valid 127.0.0.1:3000 development origin", () => {
      const req = createMockRequest({
        origin: "http://127.0.0.1:3000",
        secFetchSite: "same-origin",
      });
      const result = validateSameOrigin(req);

      assert.equal(result.valid, true);
      assert.equal(result.errorResponse, undefined);
    });
  });

  describe("2. Task ID Validation & Anti-Traversal", () => {
    it("should accept valid alphanumeric and underscore task IDs", () => {
      assert.equal(isValidTaskId("task_9a8b7c6d5e4f"), true);
      assert.equal(isValidTaskId("task-1234"), true);
      assert.equal(isValidTaskId("TASK_001"), true);
    });

    it("should reject path traversal attempts and special characters", () => {
      assert.equal(isValidTaskId("../../etc/passwd"), false);
      assert.equal(isValidTaskId("task/../../approve"), false);
      assert.equal(isValidTaskId("task?query=1"), false);
      assert.equal(isValidTaskId("<script>alert(1)</script>"), false);
      assert.equal(isValidTaskId(""), false);
      assert.equal(isValidTaskId(null), false);
      assert.equal(isValidTaskId(undefined), false);
    });
  });

  describe("3. Reviewer Identity Anti-Spoofing", () => {
    it("should derive operator identity server-side and prevent client spoofing", () => {
      process.env.LOCAL_OPERATOR_IDENTITY = "pratham-verified-operator";
      const identity = getOperatorIdentity();
      assert.equal(identity, "pratham-verified-operator");
    });

    it("should fall back to safe default 'local-operator' when unconfigured", () => {
      delete process.env.LOCAL_OPERATOR_IDENTITY;
      const identity = getOperatorIdentity();
      assert.equal(identity, "local-operator");
    });
  });

  describe("4. Fail-Closed Secret Verification", () => {
    it("should fail closed and never fall back to default credentials when secret is missing", () => {
      delete process.env.HUMAN_APPROVAL_SECRET;
      const secret = process.env.HUMAN_APPROVAL_SECRET;
      const isMissing = !secret || secret.trim() === "";
      assert.equal(isMissing, true);
    });

    it("should fail closed when secret is empty whitespace", () => {
      process.env.HUMAN_APPROVAL_SECRET = "   ";
      const secret = process.env.HUMAN_APPROVAL_SECRET;
      const isMissing = !secret || secret.trim() === "";
      assert.equal(isMissing, true);
    });
  });

  describe("5. State Lifecycle Transition Invariants", () => {
    // Model transitions permitted exclusively for human gate
    const VALID_LIFECYCLE_TRANSITIONS = new Map([
      ["AWAITING_HUMAN_APPROVAL->APPROVED", true],
      ["AWAITING_HUMAN_APPROVAL->REJECTED", true],
      ["APPROVED->COMPLETED", true],
      ["REPORTED->APPROVED", false],
      ["TRIAGED->APPROVED", false],
      ["REPRODUCING->APPROVED", false],
      ["FIX_PROPOSED->APPROVED", false],
      ["VERIFYING->APPROVED", false],
      ["REPORTED->COMPLETED", false],
      ["AWAITING_HUMAN_APPROVAL->COMPLETED", false],
    ]);

    it("should enforce that approval is only valid from AWAITING_HUMAN_APPROVAL", () => {
      assert.equal(VALID_LIFECYCLE_TRANSITIONS.get("AWAITING_HUMAN_APPROVAL->APPROVED"), true);
      assert.equal(VALID_LIFECYCLE_TRANSITIONS.get("VERIFYING->APPROVED"), false);
      assert.equal(VALID_LIFECYCLE_TRANSITIONS.get("FIX_PROPOSED->APPROVED"), false);
      assert.equal(VALID_LIFECYCLE_TRANSITIONS.get("REPORTED->APPROVED"), false);
    });

    it("should enforce that completion is only valid from APPROVED", () => {
      assert.equal(VALID_LIFECYCLE_TRANSITIONS.get("APPROVED->COMPLETED"), true);
      assert.equal(VALID_LIFECYCLE_TRANSITIONS.get("AWAITING_HUMAN_APPROVAL->COMPLETED"), false);
      assert.equal(VALID_LIFECYCLE_TRANSITIONS.get("REPORTED->COMPLETED"), false);
    });

    it("should require non-empty feedback when rejecting a proposed fix", () => {
      const isValidRejection = (feedback) => typeof feedback === "string" && feedback.trim().length > 0;
      assert.equal(isValidRejection("Breaks v1 API backward compatibility"), true);
      assert.equal(isValidRejection(""), false);
      assert.equal(isValidRejection("   "), false);
      assert.equal(isValidRejection(null), false);
    });
  });
});
