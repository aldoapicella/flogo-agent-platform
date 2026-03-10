import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flogo Agent Platform",
  description: "Operator console for the Flogo agent control plane"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

