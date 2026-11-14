"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { completeOAuthCallback } from "@/lib/api";

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();

  const platform = (params?.platform as string) || "telegram";
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        setStatus("error");
        setErrorMessage(errorDescription || `Provider returned authorization error: ${error}`);
        return;
      }

      if (!state) {
        setStatus("error");
        setErrorMessage("Missing OAuth state parameter. Authorization could not be verified.");
        return;
      }

      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
        const redirectUri = `${origin}/auth/callback/${platform}`;

        await completeOAuthCallback(platform, {
          code: code || undefined,
          state: state,
          redirect_uri: redirectUri,
        });

        setStatus("success");
        setTimeout(() => {
          router.push("/?connected=" + platform);
        }, 1200);
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(err.message || "Failed to complete account connection. Please try again.");
      }
    }

    handleCallback();
  }, [platform, searchParams, router]);

  return (
    <div className="bg-white rounded-clay-xl border border-clay-hairline shadow-clay-card max-w-md w-full p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
      {status === "processing" && (
        <div className="space-y-3">
          <RefreshCw className="w-10 h-10 text-clay-primary animate-spin mx-auto" />
          <h2 className="text-base font-bold text-clay-ink">Verifying {platform.toUpperCase()} Authorization...</h2>
          <p className="text-xs text-clay-muted">
            Securely validating cryptographic state, PKCE challenge, and account identity.
          </p>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-3">
          <CheckCircle2 className="w-10 h-10 text-clay-success mx-auto" />
          <h2 className="text-base font-bold text-clay-ink">Account Connected Successfully!</h2>
          <p className="text-xs text-clay-muted">
            Your {platform.toUpperCase()} account has been linked to your active workspace. Redirecting to ShipDev...
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <AlertCircle className="w-10 h-10 text-clay-coral mx-auto" />
          <h2 className="text-base font-bold text-clay-ink">Connection Failed</h2>
          <p className="text-xs text-clay-coral leading-relaxed">{errorMessage}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-2 px-4 py-2 rounded-clay-md bg-clay-primary text-white text-xs font-semibold cursor-pointer shadow-clay-soft"
          >
            Return to ShipDev Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-clay-canvas p-6 font-sans">
      <Suspense
        fallback={
          <div className="bg-white rounded-clay-xl border border-clay-hairline shadow-clay-card max-w-md w-full p-6 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-clay-primary animate-spin mx-auto" />
            <p className="text-xs text-clay-muted">Loading authorization details...</p>
          </div>
        }
      >
        <OAuthCallbackContent />
      </Suspense>
    </div>
  );
}
