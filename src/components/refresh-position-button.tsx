"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingButton } from "./loading-button";

export function RefreshPositionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/position", { method: "POST" });
      if (!response.ok) throw new Error("PositionGuard could not refresh your Aave V3 position.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Position refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <LoadingButton
        className="button primary"
        pending={busy}
        pendingLabel="Refreshing position…"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh position
      </LoadingButton>
      {error && <p className="form-status error">{error}</p>}
    </div>
  );
}
