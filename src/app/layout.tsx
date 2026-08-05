import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kenyon Class Schedule Planner",
  description: "A static Fall 2026 course schedule planner for Kenyon students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
