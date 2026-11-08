import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/snlAutoMapper.ts"), "utf8");

function functionSource(signature: string) {
  const start = source.indexOf(signature);
  expect(start, `missing ${signature}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\n}\n", start);
  expect(next, `unterminated ${signature}`).toBeGreaterThan(start);
  return source.slice(start, next + 3);
}

describe("NORM-01 startup suggestions", () => {
  it("routes startup through the suggestions-only path", () => {
    const startup = functionSource("export async function autoMapAllUnmappedItems");
    expect(startup).toContain("suggestUnlinkedBoqItemsAtStartup()");
    expect(startup).not.toContain("autoMapBoqItems(");
    expect(startup).not.toContain("applySnlMappingToRecipes");
  });

  it("only considers unlinked rows and leaves suggestions pending user review", () => {
    const suggestions = functionSource("export async function suggestUnlinkedBoqItemsAtStartup");
    expect(suggestions).toContain("isNull(snlBoqMappings.id)");
    expect(suggestions).toContain('mappedBy,');
    expect(suggestions).toContain('mappingStatus: "needs_review"');
    expect(suggestions).not.toContain("applySnlMappingToRecipes");
    expect(suggestions).not.toContain("clearBoqItemRecipes");
    expect(suggestions).not.toContain("propagateDuplicateMappings");
  });
});
