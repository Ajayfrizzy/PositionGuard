import { portfolioSchema, type PortfolioPosition } from "../protection/portfolio-types";

const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function portfolioFromSnapshotContext(value: unknown): PortfolioPosition {
  const root = record(value);
  const position = record(root.position);
  return portfolioSchema.parse(position.normalizedProtectionInput ?? root.normalizedProtectionInput ?? root);
}
