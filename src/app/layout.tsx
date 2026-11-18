import type { Metadata, Viewport } from "next";
import "@fontsource-variable/besley";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { TimezoneCookie } from "@/components/timezone-cookie";

export const metadata: Metadata = {
  title: { default: "Study Coach", template: "%s · Study Coach" },
  description: "Upload your notes and handouts and get a day-by-day study plan for your next test.",
};

export const viewport: Viewport = {
  themeColor: "#fafbfd",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <TimezoneCookie />
        {children}
      </body>
    </html>
  );
}
