import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flogo Agent Platform",
  description: "Foundation-first Flogo control console."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

