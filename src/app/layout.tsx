import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Coach",
  description: "Turn your notes into a study plan for your next test.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
