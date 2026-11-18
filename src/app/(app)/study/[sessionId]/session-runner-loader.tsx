"use client";

import dynamic from "next/dynamic";
import type { SessionRunnerProps } from "./session-runner";

// The session screen keeps its place in this tab's storage, which only exists
// in the browser, so it is rendered there rather than on the server.
const SessionRunner = dynamic(() => import("./session-runner").then((m) => m.SessionRunner), {
  ssr: false,
  loading: () => (
    <div aria-busy="true" aria-label="Loading your session">
      <div className="h-8 w-56 rounded-[3px] bg-rule-faint" />
      <div className="mt-8 h-64 max-w-xl rounded-[3px] bg-rule-faint" />
    </div>
  ),
});

export function SessionRunnerLoader(props: SessionRunnerProps) {
  return <SessionRunner {...props} />;
}
