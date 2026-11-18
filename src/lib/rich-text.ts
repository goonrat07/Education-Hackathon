/**
 * Splits text into plain parts and math parts so formulas can be typeset.
 * Math is written as `$…$` (inline) or `$$…$$` (on its own line); chemical
 * formulas as `\ce{…}`, with or without dollar signs around them.
 */

export type Segment = { type: "text" | "inline" | "display"; value: string };

/** Index just past the brace that closes the one at `open`, or -1 if it never closes. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * True when what sits between two dollar signs reads as prose: it holds a
 * whole word of three or more letters. Commands (`\times`) and braced text
 * (`\text{g}`) are part of a formula and do not count.
 */
function hasProseWord(body: string): boolean {
  let bare = body.replace(/\\[a-zA-Z]+/g, " ");
  for (let previous = ""; previous !== bare; ) {
    previous = bare;
    bare = bare.replace(/\{[^{}]*\}/g, " ");
  }
  return /(^|\s)[A-Za-z]{3,}(?=$|[\s.,;:!?)])/.test(bare);
}

/**
 * Where the inline formula opened at `start` ends, or -1 when the `$` is not
 * the start of a formula but a price.
 *
 * A formula never begins or ends with a space and is never followed by a
 * digit. The first dollar sign after the opening one decides: if it cannot
 * close a formula, the opening one was a price ("$5. Let $x$ be…"). A stretch
 * that starts with a digit and holds a prose word is a price too
 * ("$5 each ($x$ in total)").
 */
function inlineEnd(text: string, start: number): number {
  if (/\s/.test(text[start + 1] ?? " ")) return -1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
    } else if (text[i] === "\n" && text[i + 1] === "\n") {
      return -1;
    } else if (text[i] === "$") {
      const closesCleanly = !/\s/.test(text[i - 1]) && !/\d/.test(text[i + 1] ?? "");
      if (!closesCleanly) return -1;
      const body = text.slice(start + 1, i);
      return /\d/.test(body[0]) && hasProseWord(body) ? -1 : i;
    }
  }
  return -1;
}

export function splitMath(text: string): Segment[] {
  const segments: Segment[] = [];
  let plain = "";
  const push = (type: Segment["type"], value: string) => {
    if (plain) segments.push({ type: "text", value: plain });
    plain = "";
    segments.push({ type, value });
  };

  let i = 0;
  while (i < text.length) {
    if (text.startsWith("\\$", i)) {
      plain += "$";
      i += 2;
    } else if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      if (end === -1) {
        plain += "$$";
        i += 2;
      } else {
        push("display", text.slice(i + 2, end).trim());
        i = end + 2;
      }
    } else if (text[i] === "$") {
      const end = inlineEnd(text, i);
      if (end === -1) {
        plain += "$";
        i += 1;
      } else {
        push("inline", text.slice(i + 1, end));
        i = end + 1;
      }
    } else if (text.startsWith("\\ce{", i)) {
      const end = closingBrace(text, i + 3);
      if (end === -1) {
        plain += text[i];
        i += 1;
      } else {
        push("inline", text.slice(i, end));
        i = end;
      }
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) segments.push({ type: "text", value: plain });
  return segments;
}
