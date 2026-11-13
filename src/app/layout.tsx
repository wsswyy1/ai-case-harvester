import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Case Harvester",
  description: "Halloween review desk for real AI use cases destined for usecasecn."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="m-0 min-h-screen bg-crypt font-serif text-bone antialiased">{children}</body>
    </html>
  );
}
