import type { SVGProps } from "react";
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name:
    | "grid"
    | "position"
    | "shield"
    | "activity"
    | "settings"
    | "arrow"
    | "external"
    | "check"
    | "clock"
    | "database"
    | "wallet";
}) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    position: (
      <>
        <path d="M4 19V9m0 10h16M7 15l4-5 3 2 5-7" />
        <circle cx="19" cy="5" r="1.5" />
      </>
    ),
    shield: <path d="M12 2.5 20 6v5.5c0 4.7-3.1 8.5-8 10.3-4.9-1.8-8-5.6-8-10.3V6l8-3.5Z" />,
    activity: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    external: (
      <>
        <path d="M14 3h7v7M10 14 21 3" />
        <path d="M18 13v7H4V6h7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 6h16v13H3z" />
        <path d="M3 8V5h13M14 12h7v4h-7z" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
