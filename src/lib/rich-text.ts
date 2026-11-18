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
 * Where the inline formula opened at `start` ends, or -1 when the `$` is not
 * the start of a formula. A formula never begins or ends with a space and is
 * never followed by a digit, which keeps "$5 and $10" as plain prices.
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
      if (closesCleanly) return i;
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
