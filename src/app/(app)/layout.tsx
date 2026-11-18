import Link from "next/link";
import { SourceProvider } from "@/components/source-panel";

/**
 * Signed-in pages are not fetched ahead of a click. Every one of them reads
 * the session, so each prefetch is a fresh server render with a database
 * lookup, repeated for every link in view; most are never used, and one the
 * browser abandons halfway leaves its database work hanging on the server.
 */
export const prefetch = "force-disabled";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-4 ruled-bottom">
        <Link href="/" className="font-display text-lg font-semibold no-underline">
          Study Coach
        </Link>
        <nav aria-label="Account">
          <Link href="/settings" className="link link-quiet text-sm">
            Settings
          </Link>
        </nav>
      </header>
      <main className="flex-1 py-7 sm:py-9">
        <SourceProvider>{children}</SourceProvider>
      </main>
    </div>
  );
}
