import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("demo UI polish contracts", () => {
  it("keeps product navigation language user-facing and attention conditional", () => {
    const shell = source("src/components/app-shell.tsx");
    expect(shell).toContain("Protected Account");
    expect(shell).toContain("protectionAttention &&");
    expect(shell).not.toContain("Demo Operator");
  });

  it("keeps candidate evidence prioritized but available", () => {
    const protection = source("src/app/protection/page.tsx");
    expect(protection).toContain("actions evaluated");
    expect(protection).toContain("candidate-evidence");
    expect(protection).toContain("remaining candidate");
  });

  it("contains tablet and mobile overflow safeguards", () => {
    const css = source("src/app/globals.css");
    expect(css).toMatch(/@media\s*\(max-width:\s*1180px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*820px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*560px\)/);
    expect(css).toMatch(/table\s*{[^}]*min-width:\s*680px/);
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain(":focus-visible");
  });
});
