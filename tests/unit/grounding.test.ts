import { describe, expect, it } from "vitest";
import { answersAgree, quoteInPassage, samePrompt } from "@/lib/grounding";

const PASSAGE =
  "Avogadro's number is 6.022 × 10^23 particles per mole.\nThe molar mass of water, $\\ce{H2O}$, is 18.02 g/mol — “roughly 18”.";

describe("quoteInPassage", () => {
  it("finds a quote copied word for word", () => {
    expect(quoteInPassage("Avogadro's number is 6.022 × 10^23 particles per mole", PASSAGE)).toBe(true);
  });

  it("ignores differences in case, spacing and line breaks", () => {
    expect(quoteInPassage("particles per mole.   the molar mass of WATER", PASSAGE)).toBe(true);
  });

  it("ignores curly quotes, dashes and other punctuation differences", () => {
    expect(quoteInPassage('18.02 g/mol - "roughly 18"', PASSAGE)).toBe(true);
    expect(quoteInPassage("Avogadro’s number", PASSAGE)).toBe(true);
  });

  it("rejects a quote whose number was changed", () => {
    expect(quoteInPassage("Avogadro's number is 6.023 × 10^23 particles per mole", PASSAGE)).toBe(false);
  });

  it("rejects words that are not in the passage", () => {
    expect(quoteInPassage("The molar mass of carbon dioxide is 44.01 g/mol", PASSAGE)).toBe(false);
  });

  it("rejects a quote stitched together from separate parts of the passage", () => {
    expect(quoteInPassage("Avogadro's number is 18.02 g/mol", PASSAGE)).toBe(false);
  });

  it("rejects a quote too short to prove anything", () => {
    expect(quoteInPassage("is", PASSAGE)).toBe(false);
    expect(quoteInPassage("mole", PASSAGE)).toBe(false);
    expect(quoteInPassage("", PASSAGE)).toBe(false);
  });
});

describe("answersAgree", () => {
  it("accepts the same number written differently", () => {
    expect(answersAgree("0.50 mol", "0.5 mol")).toBe("yes");
    expect(answersAgree("1,250 g", "1250 g")).toBe("yes");
    expect(answersAgree("3.0 × 10^8 m/s", "3e8 m/s")).toBe("yes");
    expect(answersAgree("$6.022 \\times 10^{23}$", "6.022 x 10^23")).toBe("yes");
  });

  it("accepts a fraction and its decimal", () => {
    expect(answersAgree("1/2", "0.5")).toBe("yes");
  });

  it("accepts unit names written out or abbreviated", () => {
    expect(answersAgree("2 moles", "2 mol")).toBe("yes");
    expect(answersAgree("50%", "50 percent")).toBe("yes");
    expect(answersAgree("18 grams", "18 g")).toBe("yes");
  });

  it("accepts a number with or without its variable", () => {
    expect(answersAgree("x = 4", "4")).toBe("yes");
  });

  it("accepts answers that round to the same value", () => {
    expect(answersAgree("18.02 g/mol", "18.0 g/mol")).toBe("yes");
  });

  it("rejects different numbers", () => {
    expect(answersAgree("12 g", "21 g")).toBe("no");
    expect(answersAgree("0.5", "5")).toBe("no");
    expect(answersAgree("3.0 × 10^8 m/s", "3.0 × 10^6 m/s")).toBe("no");
  });

  it("does not decide when the units differ", () => {
    expect(answersAgree("12 g", "12 mL")).toBe("unsure");
    expect(answersAgree("12 g", "12")).toBe("unsure");
  });

  it("accepts the same words apart from case, articles and punctuation", () => {
    expect(answersAgree("the mitochondria", "Mitochondria")).toBe("yes");
    expect(answersAgree("Limiting reactant.", "limiting reactant")).toBe("yes");
  });

  it("does not decide between two differently worded sentences", () => {
    expect(answersAgree("It runs out first and limits the product.", "The reactant used up first.")).toBe(
      "unsure",
    );
  });

  it("does not decide between a number and a sentence", () => {
    expect(answersAgree("4", "The answer is four because two plus two is four")).toBe("unsure");
  });

  it("does not agree when either answer is empty", () => {
    expect(answersAgree("", "4")).toBe("no");
    expect(answersAgree("  ", "")).toBe("no");
  });
});

describe("samePrompt", () => {
  it("treats prompts that differ only in case and punctuation as the same", () => {
    expect(samePrompt("What is a mole?", "what is a mole")).toBe(true);
  });

  it("treats different prompts as different", () => {
    expect(samePrompt("What is a mole?", "What is molar mass?")).toBe(false);
  });
});
