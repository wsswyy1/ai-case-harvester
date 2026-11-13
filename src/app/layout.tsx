import type { ReactNode } from "react";

export const metadata = {
  title: "AI Case Harvester",
  description: "Halloween review desk for real AI use cases destined for usecasecn."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0b0708",
          color: "#f3e6d0",
          fontFamily: "Georgia, 'Times New Roman', serif"
        }}
      >
        {children}
      </body>
    </html>
  );
}
