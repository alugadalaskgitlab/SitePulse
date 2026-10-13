import { describe, it, expect } from "vitest";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

describe("GST register production bundle", () => {
  it("generates the real PDF with external dependencies in minified CommonJS", async () => {
    // Match the production server's package boundary, rather than Vitest's
    // module interop: both PDF packages are external in script/build.ts.
    const result = await build({
      stdin: {
        resolveDir: process.cwd(),
        sourcefile: "production-pdf-entry.ts",
        contents: `
          import { buildGstRegisterPdf } from "./server/gstRegisterPdf";
          process.stdout.write(buildGstRegisterPdf({
            title: "Production PDF regression",
            company: "SYNTHETIC COMPANY",
            metadata: ["Bills in range: 1"],
            categories: [["MATERIAL", 1, "100.00", "18.00"]],
            details: [["SYNTHETIC-BILL", "2026-10-13", "SYNTHETIC VENDOR", "material", "100.00", "18.00", "118.00"]],
            tds: [["SYNTHETIC-BILL", "2026-10-13", "SYNTHETIC VENDOR", "paid", "0", "0.00"]]
          }));
        `,
      },
      platform: "node",
      bundle: true,
      format: "cjs",
      minify: true,
      external: ["jspdf", "jspdf-autotable"],
      define: { "process.env.NODE_ENV": '"production"' },
      write: false,
    });
    const pdf = execFileSync(process.execPath, ["-e", result.outputFiles[0].text], {
      cwd: process.cwd(),
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdf.toString("latin1");
    for (const value of ["SYNTHETIC-BILL", "SYNTHETIC VENDOR", "100.00", "18.00", "118.00",
      "GST by Category", "Bill Detail", "TDS", "Page 1 of"]) {
      expect(text).toContain(value);
    }
  });
});
