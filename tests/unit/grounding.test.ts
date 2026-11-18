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

  const TABLE = "Element | Molar mass (g/mol)\nH | 1.008\nC | 12.01\nN | 14.01\nO | 16.00\nNa | 22.99\nCl | 35.45";

  it("accepts one whole row of a table even though a row is short", () => {
    expect(quoteInPassage("Na | 22.99", TABLE)).toBe(true);
    expect(quoteInPassage("H | 1.008", TABLE)).toBe(true);
    expect(quoteInPassage("na  22.99", TABLE)).toBe(true);
  });

  it("rejects part of a short row", () => {
    expect(quoteInPassage("22.99", TABLE)).toBe(false);
    expect(quoteInPassage("Na | 22", TABLE)).toBe(false);
  });

  it("rejects a short row that is not in the table", () => {
    expect(quoteInPassage("Na | 22.98", TABLE)).toBe(false);
    expect(quoteInPassage("K | 39.10", TABLE)).toBe(false);
  });

  it("rejects a whole line that is only a word or a number", () => {
    expect(quoteInPassage("or", "Use the first value\nor\nthe second value")).toBe(false);
    expect(quoteInPassage("2.", "1.\n2.\n3.")).toBe(false);
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

  it("rejects a different whole number however close it is", () => {
    expect(answersAgree("1914", "1918")).toBe("no");
    expect(answersAgree("1945", "1939")).toBe("no");
    expect(answersAgree("1066", "1071")).toBe("no");
    expect(answersAgree("206 bones", "207 bones")).toBe("no");
    expect(answersAgree("365 days", "366 days")).toBe("no");
    expect(answersAgree("1,000,001", "1,000,002")).toBe("no");
  });

  it("never accepts a round number just because the other one is near it", () => {
    expect(answersAgree("1,000 m", "1,005 m")).toBe("unsure");
    expect(answersAgree("1940", "1941")).toBe("unsure");
    expect(answersAgree("24,300 J", "24,309 J")).toBe("unsure");
  });

  it("rejects a round number that is nowhere near", () => {
    expect(answersAgree("1900", "1941")).toBe("no");
    expect(answersAgree("2000 g", "2600 g")).toBe("no");
  });

  it("leaves decimals that differ in their last digit to a judge", () => {
    expect(answersAgree("63.1 g", "63.2 g")).toBe("unsure");
    expect(answersAgree("0.504 mol", "0.505 mol")).toBe("unsure");
  });

  it("rejects decimals that are clearly different", () => {
    expect(answersAgree("0.50 mol", "0.52 mol")).toBe("no");
    expect(answersAgree("63.1 g", "64.9 g")).toBe("no");
  });

  it("accepts a value written to fewer digits than the other", () => {
    expect(answersAgree("63 g", "63.2 g")).toBe("yes");
    expect(answersAgree("0.33", "1/3")).toBe("yes");
    expect(answersAgree("$2.41 \\times 10^{24}$ molecules", "$2.409 \\times 10^{24}$ molecules")).toBe("yes");
    expect(answersAgree("75%", "$75.0\\%$")).toBe("yes");
  });

  it("rejects a whole number the other value does not round to", () => {
    expect(answersAgree("63 g", "63.6 g")).toBe("no");
  });

  it("does not treat unit symbols that differ only in capital letters as the same", () => {
    expect(answersAgree("0.5 M", "0.5 m")).toBe("unsure");
    expect(answersAgree("2 mg", "2 Mg")).toBe("unsure");
  });

  it("accepts the same unit symbol and unit names in any capitalization", () => {
    expect(answersAgree("0.5 M", "0.50 M")).toBe("yes");
    expect(answersAgree("2 Moles", "2 mol")).toBe("yes");
    expect(answersAgree("18 GRAMS", "18 g")).toBe("yes");
    expect(answersAgree("250 mL", "250 milliliters")).toBe("yes");
  });

  it("accepts a unit symbol typed in the wrong case when it can mean only one thing", () => {
    expect(answersAgree("2 MOL", "2 mol")).toBe("yes");
    expect(answersAgree("300 j", "300 J")).toBe("yes");
    expect(answersAgree("5 ml", "5 mL")).toBe("yes");
  });

  it("ignores a full stop typed after the answer", () => {
    expect(answersAgree("12.", "12")).toBe("yes");
    expect(answersAgree("0.5 mol.", "0.5 mol")).toBe("yes");
  });

  it("does not accept the right number for a different variable", () => {
    expect(answersAgree("x = 4", "y = 4")).toBe("unsure");
    expect(answersAgree("x = 4", "X = 4")).toBe("yes");
  });

  it("does not read a comma between two digits as a thousands separator", () => {
    expect(answersAgree("1,5", "15")).toBe("unsure");
    expect(answersAgree("1,5", "1.5")).toBe("unsure");
    expect(answersAgree("12,50", "1250")).toBe("unsure");
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
