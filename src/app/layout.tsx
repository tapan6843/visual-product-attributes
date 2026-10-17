import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visual Product Attributes",
  description: "Extract structured visual attributes from clothing product images"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

