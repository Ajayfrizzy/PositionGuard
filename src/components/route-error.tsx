"use client";

export function RouteError({
  error,
  reset,
  label = "Position data",
}: {
  error: Error & { digest?: string };
  reset(): void;
  label?: string;
}) {
  return (
    <div className="page" role="alert">
      <section className="card route-error">
        <h1>{label} could not be loaded.</h1>
        <p>
          The database, RPC, authentication session, or protection service may be temporarily
          unavailable.
        </p>
        <button className="button primary" type="button" onClick={reset}>
          Retry
        </button>
        <details>
          <summary>Technical details</summary>
          <code>{error.message || error.digest || "Unknown route error"}</code>
        </details>
      </section>
    </div>
  );
}
