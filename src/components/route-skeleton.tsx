type SkeletonKind =
  "dashboard" | "position" | "protection" | "scenario" | "activity" | "notifications" | "settings";

const blocks: Record<SkeletonKind, string[]> = {
  dashboard: [
    "skeleton-wide",
    "skeleton-card",
    "skeleton-card",
    "skeleton-wide",
    "skeleton-metrics",
  ],
  position: [
    "skeleton-metrics",
    "skeleton-wide",
    "skeleton-card",
    "skeleton-card",
    "skeleton-table",
  ],
  protection: ["skeleton-metrics", "skeleton-wide", "skeleton-table", "skeleton-wide"],
  scenario: ["skeleton-wide", "skeleton-form", "skeleton-card"],
  activity: ["skeleton-timeline", "skeleton-timeline", "skeleton-timeline", "skeleton-timeline"],
  notifications: ["skeleton-wide", "skeleton-timeline", "skeleton-timeline", "skeleton-timeline"],
  settings: ["skeleton-options", "skeleton-form", "skeleton-form", "skeleton-wide"],
};

export function RouteSkeleton({ kind }: { kind: SkeletonKind }) {
  return (
    <div className={`page route-skeleton route-skeleton-${kind}`} aria-busy="true" role="status">
      <span className="sr-only">Loading {kind}…</span>
      <header className="skeleton-header" aria-hidden="true">
        <span className="skeleton-line short" />
        <span className="skeleton-line title" />
        <span className="skeleton-line copy" />
      </header>
      <div className="skeleton-layout" aria-hidden="true">
        {blocks[kind].map((className, index) => (
          <div className={`skeleton-block ${className}`} key={`${className}-${index}`}>
            <span className="skeleton-line short" />
            <span className="skeleton-line title" />
            <span className="skeleton-line copy" />
          </div>
        ))}
      </div>
    </div>
  );
}
