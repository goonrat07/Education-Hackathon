import { describe, expect, it } from "vitest";
import { splitMath } from "@/lib/rich-text";

describe("splitMath", () => {
  it("leaves plain text alone", () => {
    expect(splitMath("A mole is a counting unit.")).toEqual([{ type: "text", value: "A mole is a counting unit." }]);
  });

  it("finds inline math between single dollar signs", () => {
    expect(splitMath("Solve $x^2 = 9$ for x.")).toEqual([
      { type: "text", value: "Solve " },
      { type: "inline", value: "x^2 = 9" },
      { type: "text", value: " for x." },
    ]);
  });

  it("finds display math between double dollar signs", () => {
    expect(splitMath("So: $$n = \\frac{m}{M}$$ done")).toEqual([
      { type: "text", value: "So: " },
      { type: "display", value: "n = \\frac{m}{M}" },
      { type: "text", value: " done" },
    ]);
  });

  it("handles several formulas in one sentence", () => {
    const parts = splitMath("$\\ce{H2O}$ and $\\ce{CO2}$");
    expect(parts.map((p) => p.type)).toEqual(["inline", "text", "inline"]);
    expect(parts[0].value).toBe("\\ce{H2O}");
    expect(parts[2].value).toBe("\\ce{CO2}");
  });

  it("treats a chemical formula written without dollar signs as math", () => {
    expect(splitMath("Water is \\ce{H2O}.")).toEqual([
      { type: "text", value: "Water is " },
      { type: "inline", value: "\\ce{H2O}" },
      { type: "text", value: "." },
    ]);
  });

  it("keeps nested braces of a bare chemical formula together", () => {
    const parts = splitMath("\\ce{^{14}_{6}C} decays");
    expect(parts[0]).toEqual({ type: "inline", value: "\\ce{^{14}_{6}C}" });
  });

  it("does not mistake prices for math", () => {
    expect(splitMath("It costs $5 and then $10 more.")).toEqual([
      { type: "text", value: "It costs $5 and then $10 more." },
    ]);
  });

  it("treats an escaped dollar sign as a dollar sign", () => {
    expect(splitMath("Pay \\$3 for $n$ items")).toEqual([
      { type: "text", value: "Pay $3 for " },
      { type: "inline", value: "n" },
      { type: "text", value: " items" },
    ]);
  });

  it("leaves an unclosed dollar sign as text", () => {
    expect(splitMath("The answer is $x + 1")).toEqual([{ type: "text", value: "The answer is $x + 1" }]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitMath("")).toEqual([]);
  });
});
