import katex from "katex";
import "katex/contrib/mhchem";
import { splitMath } from "@/lib/rich-text";

function typeset(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    errorColor: "#c8203a",
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml",
  });
}

/**
 * Text from the student's materials or written by Claude, with math and
 * chemistry typeset. Line breaks in the text are kept.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const segments = splitMath(text);
  return (
    <span className={`rich whitespace-pre-wrap [overflow-wrap:anywhere] ${className ?? ""}`}>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.value}</span>
        ) : (
          <span
            key={i}
            className={segment.type === "display" ? "block" : undefined}
            // KaTeX output is generated from the formula with `trust: false`, so it carries no scripts or links.
            dangerouslySetInnerHTML={{ __html: typeset(segment.value, segment.type === "display") }}
          />
        ),
      )}
    </span>
  );
}
