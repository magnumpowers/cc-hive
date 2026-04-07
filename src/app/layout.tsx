import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hive — Visual dashboard for Claude Code",
  description: "Visual dashboard for all your Claude Code projects",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
