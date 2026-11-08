import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isConfirmedSnlMapping } from "../shared/snlMappingPolicy";

const source = readFileSync(resolve(process.cwd(), "server/snlAutoMapper.ts"), "utf8");
const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
const indexSource = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");

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
    expect(startup).toContain("suggestUnlinkedBoqItemsForReview()");
    expect(startup).not.toContain("autoMapBoqItems(");
    expect(startup).not.toContain("applySnlMappingToRecipes");
  });

  it("runs suggestions-only startup in development, never production", () => {
    expect(indexSource).toContain('if (process.env.NODE_ENV === "development")');
    const developmentStartup = indexSource.slice(indexSource.indexOf('if (process.env.NODE_ENV === "development")'));
    expect(developmentStartup).toContain("autoMapAllUnmappedItems()");
    expect(developmentStartup).not.toContain("autoMapBoqItems(");
    expect(developmentStartup).not.toContain("applySnlMappingToRecipes");
  });

  it("only considers unlinked rows and leaves suggestions pending user review", () => {
    const suggestions = functionSource("export async function suggestUnlinkedBoqItemsForReview");
    expect(suggestions).toContain("isNull(snlBoqMappings.id)");
    expect(suggestions).toContain('mappedBy,');
    expect(suggestions).toContain('mappingStatus: "needs_review"');
    expect(suggestions).toContain("matchMorthRelinkCandidate");
    expect(suggestions).toContain("getMorthRelinkWorkbookItems()");
    expect(suggestions).toContain('eq(snlBoqMappings.mappedBy, "startup-suggestion")');
    expect(suggestions).toContain("db.update(snlBoqMappings)");
    expect(suggestions).toContain("db.delete(snlBoqMappings)");
    expect(suggestions).not.toContain("weightedCosine");
    expect(suggestions).not.toContain("applySnlMappingToRecipes");
    expect(suggestions).not.toContain("clearBoqItemRecipes");
    expect(suggestions).not.toContain("propagateDuplicateMappings");
    expect(isConfirmedSnlMapping({
      snlItemId: 123,
      snlMappingStatus: "needs_review",
      snlMappingIsAuto: true,
    })).toBe(false);
  });

  it("does not display an unconfirmed startup suggestion as the current norm", () => {
    const preview = functionSource("export async function previewBoqProjectNormRelinks");
    expect(preview).toContain("mappingStatus: boqItems.mappingStatus");
    expect(preview).toContain('item.mappingStatus === "mapped" && item.currentNormId');
  });

  it("keeps imported BOQ items unlinked until an explicit review action", () => {
    const marker = "// Keep imported rows unlinked; queue suggestions for an explicit user review.";
    const start = routesSource.indexOf(marker);
    expect(start, "missing post-import suggestion path").toBeGreaterThanOrEqual(0);
    const postImport = routesSource.slice(start, start + 400);
    expect(postImport).toContain("suggestUnlinkedBoqItemsForReview(result.insertedIds)");
    expect(postImport).not.toContain("autoMapBoqItems(result.insertedIds)");
  });
});
