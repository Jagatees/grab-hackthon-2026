import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SyncSpot",
  description: "Fair meetup planning with room-based group coordination."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
