import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoSphere Core",
  description: "Pipeline hub for EcoSphere Energy — MCS-accredited renewable installer.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1B7A6E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
