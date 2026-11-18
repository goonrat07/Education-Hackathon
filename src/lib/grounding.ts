/**
 * Checks that keep generated material tied to the student's own files.
 * Pure text functions: no AI, no I/O.
 */

/**
 * Letters and digits only, lower case: what is left when formatting is
 * ignored. A decimal point between two digits is kept, because moving it
 * changes the number: "22.99" and "2.299" must not look the same.
 */
function skeleton(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(\d)\.(?=\d)/g, "$1\u0001")
    .replace(/[^\p{L}\p{N}\u0001]+/gu, "")
    .replace(/\u0001/g, ".");
}

/** A supporting quote must be at least this long once formatting is stripped. */
const MIN_QUOTE_LENGTH = 8;

/** A quote that is one whole line of the passage, such as a table row, may be this short. */
const MIN_WHOLE_LINE_LENGTH = 4;

/**
 * True when `quote` appears in `passage` word for word, ignoring case,
 * spacing, line breaks and punctuation. Too-short quotes prove nothing and
 * fail, unless the quote is exactly one whole line of the passage: a table
 * row like "Na | 22.99" is short but is still a real, complete excerpt.
 */
export function quoteInPassage(quote: string, passage: string): boolean {
  const needle = skeleton(quote);
  if (needle.length >= MIN_QUOTE_LENGTH) return skeleton(passage).includes(needle);
  if (needle.length < MIN_WHOLE_LINE_LENGTH) return false;
  return passage.split(/\r?\n/).some((line) => skeleton(line) === needle);
}

/** True when two prompts are the same question apart from formatting. */
export function samePrompt(a: string, b: string): boolean {
  return skeleton(a) === skeleton(b);
}

// ───────────────────────── answer comparison ─────────────────────────

/** Removes LaTeX wrappers so `$6.022 \times 10^{23}$` reads as `6.022 × 10^23`. Capital letters are kept. */
function plain(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\\ce\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\%/g, "%")
    .replace(/[$\\{}]/g, "")
    .replace(/−/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Unit names and their symbols, looked up without regard to capitals. Only
 * spellings that can mean one thing are listed: "m" and "M", or "mg" and
 * "Mg", are different units and are never folded together.
 */
const UNIT_ALIASES: Record<string, string> = {
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milligram: "mg",
  milligrams: "mg",
  mol: "mol",
  mole: "mol",
  moles: "mol",
  mols: "mol",
  j: "J",
  kj: "kJ",
  kg: "kg",
  cm: "cm",
  km: "km",
  l: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  ml: "mL",
  milliliter: "mL",
  milliliters: "mL",
  millilitre: "mL",
  millilitres: "mL",
  percent: "%",
  "per cent": "%",
  second: "s",
  seconds: "s",
  sec: "s",
  secs: "s",
  minute: "min",
  minutes: "min",
  mins: "min",
  hour: "h",
  hours: "h",
  hr: "h",
  hrs: "h",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  centimeter: "cm",
  centimeters: "cm",
  kilometer: "km",
  kilometers: "km",
  joule: "J",
  joules: "J",
  newton: "N",
  newtons: "N",
  degree: "°",
  degrees: "°",
  atom: "atoms",
  atoms: "atoms",
  molecule: "molecules",
  molecules: "molecules",
  particle: "particles",
  particles: "particles",
};

function normalizeUnit(unit: string): string {
  const cleaned = unit
    .replace(/[.]+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .trim();
  const named = (part: string) => UNIT_ALIASES[part.trim().toLowerCase()] ?? part.trim();
  if (cleaned.toLowerCase() in UNIT_ALIASES) return UNIT_ALIASES[cleaned.toLowerCase()];
  return cleaned.split("/").map(named).join("/").replace(/\s+/g, " ");
}

interface Quantity {
  value: number;
  /** Size of the last written digit (0 for an exact fraction). */
  precision: number;
  /**
   * Size of the last digit that is not a trailing zero of a whole number:
   * 24,300 may be 24,309 rounded to the hundreds, so its rounding is 100.
   */
  rounding: number;
  /** Written with a decimal point. */
  decimal: boolean;
  unit: string;
  /** The letter before "=", when the answer was written like "x = 4". */
  variable: string | null;
}

// Commas count only as thousands separators ("1,250"); "1,5" is not a number.
const NUMBER = String.raw`([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))`;
const POWER = String.raw`(?:\s*(?:x|×|·|\*|times)\s*10\s*\^?\s*([+-]?\d+)|e([+-]?\d+))?`;
const VARIABLE = String.raw`(?:([a-z])\s*=\s*)?`;
const QUANTITY = new RegExp(String.raw`^${VARIABLE}${NUMBER}${POWER}\s*(.*)$`, "i");
const FRACTION = /^(?:([a-z])\s*=\s*)?([+-]?\d+)\s*\/\s*(\d+)\s*(.*)$/i;
/** What may follow a number and still count as a unit rather than a sentence. */
const UNIT_SHAPE = /^[a-zµ°%/^\-·\d ]{0,16}$/i;

function unitOf(rest: string): string | null {
  // A full stop typed after the answer is the end of a sentence, not part of the unit.
  const unit = rest.replace(/[.\s]+$/, "").trim();
  if (!UNIT_SHAPE.test(unit) || unit.split(" ").length > 2) return null;
  return normalizeUnit(unit);
}

/** Reads "3.0 × 10^8 m/s" as a number with a unit; null when the text is anything else. */
function parseQuantity(text: string): Quantity | null {
  const fraction = FRACTION.exec(text);
  if (fraction && Number(fraction[3]) !== 0) {
    const unit = unitOf(fraction[4]);
    if (unit === null) return null;
    return {
      value: Number(fraction[2]) / Number(fraction[3]),
      precision: 0,
      rounding: 0,
      decimal: false,
      unit,
      variable: fraction[1]?.toLowerCase() ?? null,
    };
  }
  const match = QUANTITY.exec(text);
  if (!match) return null;
  const mantissa = match[2].replace(/,/g, "");
  const exponent = Number(match[3] ?? match[4] ?? 0);
  const unit = unitOf(match[5]);
  if (unit === null) return null;
  const value = Number(mantissa) * 10 ** exponent;
  if (!Number.isFinite(value)) return null;
  const decimal = mantissa.includes(".");
  const decimals = decimal ? mantissa.length - mantissa.indexOf(".") - 1 : 0;
  const trailingZeros = decimal || value === 0 ? 0 : mantissa.length - mantissa.replace(/0+$/, "").length;
  return {
    value,
    precision: 10 ** (exponent - decimals),
    rounding: 10 ** (exponent - decimals + trailingZeros),
    decimal,
    unit,
    variable: match[1]?.toLowerCase() ?? null,
  };
}

/** Two numbers within this share of each other may be one value rounded two ways. */
const ROUNDING_DOUBT = 0.005;

function compareQuantities(a: Quantity, b: Quantity): "yes" | "no" | "unsure" {
  if (a.unit !== b.unit) return "unsure";
  if (a.variable && b.variable && a.variable !== b.variable) return "unsure";
  const diff = Math.abs(a.value - b.value);
  const scale = Math.max(Math.abs(a.value), Math.abs(b.value));
  if (scale === 0) return "yes";
  const relative = diff / scale;
  const slack = Number.EPSILON * scale * 4;

  // The same value at the precision it was written to (18.0 for 18.02, 0.33
  // for 1/3). Whole numbers have a precision of 1, so they must be equal.
  if (diff <= Math.max(a.precision, b.precision) / 2 + slack) return relative <= 0.02 ? "yes" : "unsure";

  // Not the same as written, but possibly one value rounded two ways: a round
  // number next to an exact one (24,300 and 24,309), or decimals a hair apart
  // (63.1 and 63.2). That is for a judge to decide, never a "yes" from here.
  if (diff <= Math.max(a.rounding, b.rounding) / 2 + slack && relative <= 0.02) return "unsure";
  if ((a.decimal || b.decimal) && relative <= ROUNDING_DOUBT) return "unsure";
  return "no";
}

function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%°/^+\-. ]+/gu, " ")
    .replace(/(^|\s)(?:the|a|an)\s+/g, "$1")
    .replace(/[.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether two independently written answers agree.
 *  - `yes`: the same number (allowing fewer written digits and unit spellings) or the same words.
 *  - `no`: two clean numbers in the same unit that differ, or an empty answer.
 *  - `unsure`: anything this cannot settle by reading; a judge decides.
 */
export function answersAgree(a: string, b: string): "yes" | "no" | "unsure" {
  const left = plain(a);
  const right = plain(b);
  if (!left || !right) return "no";

  const qa = parseQuantity(left);
  const qb = parseQuantity(right);
  if (qa && qb) return compareQuantities(qa, qb);
  if (qa || qb) return "unsure";

  return words(left) === words(right) ? "yes" : "unsure";
}
