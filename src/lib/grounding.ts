/**
 * Checks that keep generated material tied to the student's own files.
 * Pure text functions: no AI, no I/O.
 */

/** Letters and digits only, lower case: what is left when formatting is ignored. */
function skeleton(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
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

/** Removes LaTeX wrappers so `$6.022 \times 10^{23}$` reads as `6.022 × 10^23`. */
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
    .trim()
    .toLowerCase();
}

const UNIT_ALIASES: Record<string, string> = {
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milligram: "mg",
  milligrams: "mg",
  mole: "mol",
  moles: "mol",
  mols: "mol",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
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
  joule: "j",
  joules: "j",
  newton: "n",
  newtons: "n",
  degree: "°",
  degrees: "°",
  atom: "atoms",
  molecule: "molecules",
  particle: "particles",
};

function normalizeUnit(unit: string): string {
  const cleaned = unit
    .replace(/[.]+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .trim();
  if (cleaned in UNIT_ALIASES) return UNIT_ALIASES[cleaned];
  return cleaned
    .split("/")
    .map((part) => UNIT_ALIASES[part.trim()] ?? part.trim())
    .join("/")
    .replace(/\s+/g, " ");
}

interface Quantity {
  value: number;
  /** Size of the last written digit (0 for an exact fraction). */
  precision: number;
  unit: string;
}

const NUMBER = String.raw`([+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+))`;
const POWER = String.raw`(?:\s*(?:x|×|·|\*|times)\s*10\s*\^?\s*([+-]?\d+)|e([+-]?\d+))?`;
const QUANTITY = new RegExp(String.raw`^(?:[a-z]\s*=\s*)?${NUMBER}${POWER}\s*(.*)$`);
const FRACTION = /^(?:[a-z]\s*=\s*)?([+-]?\d+)\s*\/\s*(\d+)\s*(.*)$/;
/** What may follow a number and still count as a unit rather than a sentence. */
const UNIT_SHAPE = /^[a-zµ°%/^\-·\d ]{0,16}$/;

/** Reads "3.0 × 10^8 m/s" as a number with a unit; null when the text is anything else. */
function parseQuantity(text: string): Quantity | null {
  const fraction = FRACTION.exec(text);
  if (fraction && Number(fraction[2]) !== 0) {
    const unit = fraction[3].trim();
    if (!UNIT_SHAPE.test(unit) || unit.split(" ").length > 2) return null;
    return { value: Number(fraction[1]) / Number(fraction[2]), precision: 0, unit: normalizeUnit(unit) };
  }
  const match = QUANTITY.exec(text);
  if (!match) return null;
  const mantissa = match[1].replace(/,/g, "");
  const exponent = Number(match[2] ?? match[3] ?? 0);
  const unit = match[4].trim();
  if (!UNIT_SHAPE.test(unit) || unit.split(" ").length > 2) return null;
  const value = Number(mantissa) * 10 ** exponent;
  if (!Number.isFinite(value)) return null;
  const decimals = mantissa.includes(".") ? mantissa.length - mantissa.indexOf(".") - 1 : 0;
  return { value, precision: 10 ** (exponent - decimals), unit: normalizeUnit(unit) };
}

function compareQuantities(a: Quantity, b: Quantity): "yes" | "no" | "unsure" {
  if (a.unit !== b.unit) return "unsure";
  const diff = Math.abs(a.value - b.value);
  const scale = Math.max(Math.abs(a.value), Math.abs(b.value));
  if (scale === 0) return "yes";
  const relative = diff / scale;
  if (relative <= 0.005) return "yes";
  // The same value written to fewer digits (18.0 for 18.02, 0.33 for 1/3).
  const coarser = Math.max(a.precision, b.precision);
  const roundsTogether = diff <= coarser / 2 + Number.EPSILON * scale;
  if (roundsTogether) return relative <= 0.02 ? "yes" : "unsure";
  return "no";
}

function words(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}%°/^+\-. ]+/gu, " ")
    .replace(/(^|\s)(?:the|a|an)\s+/g, "$1")
    .replace(/[.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether two independently written answers agree.
 *  - `yes`: the same number (allowing rounding and unit spellings) or the same words.
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
