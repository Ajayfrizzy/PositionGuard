export function formatNumber(value: string | number | null | undefined, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
}

export function formatCompactUsd(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "$—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(number);
}

export function shortAddress(value: string | null | undefined, head = 6, tail = 4) {
  if (!value) return "Not configured";
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

export function transactionExplorerUrl(baseUrl: string, hash: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("INVALID_TRANSACTION_HASH");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(normalizedBase)) throw new Error("INVALID_EXPLORER_URL");
  return `${normalizedBase}/tx/${hash}`;
}

export function timeAgo(input: Date | string) {
  const milliseconds = Date.now() - new Date(input).getTime();
  if (!Number.isFinite(milliseconds)) return "Unknown";
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
