import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { auth } from "../auth";
import { AppAuthGate } from "./AppAuthGate";
import BottomNavigation from "./BottomNavigation";

export const metadata: Metadata = {
  title: "jangoing",
  description: "Text-first kitchen inventory and grocery tracking.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f8f3",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AppAuthGate initialSession={session}>
          {children}
          <BottomNavigation />
        </AppAuthGate>
      </body>
    </html>
  );
}
