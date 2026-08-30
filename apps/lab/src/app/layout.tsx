import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steven Training Lab",
  description: "Personal running dashboard — synced Garmin data + coach prompt",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
