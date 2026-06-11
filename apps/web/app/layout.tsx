import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import DemoBanner from "@/components/DemoBanner";
import GlobalHeader from "@/components/GlobalHeader";
import { getRequestEntitlements } from "@/lib/entitlements";
import { getLiveDataStatus } from "@/lib/queries";
import "./globals.css";

const plexSans = localFont({
  src: [
    { path: "../public/fonts/ibm-plex-sans/400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans/500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans/600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
});

const plexMono = localFont({
  src: [
    { path: "../public/fonts/ibm-plex-mono/400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/ibm-plex-mono/500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/ibm-plex-mono/600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
});

const plexCondensed = localFont({
  src: [
    { path: "../public/fonts/ibm-plex-sans-condensed/500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans-condensed/600.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans-condensed/700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-condensed",
});

const playfair = localFont({
  src: [
    { path: "../public/fonts/playfair-display/400.woff2",        weight: "400", style: "normal" },
    { path: "../public/fonts/playfair-display/700.woff2",        weight: "700", style: "normal" },
    { path: "../public/fonts/playfair-display/900.woff2",        weight: "900", style: "normal" },
    { path: "../public/fonts/playfair-display/400-italic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/playfair-display/700-italic.woff2", weight: "700", style: "italic" },
    { path: "../public/fonts/playfair-display/900-italic.woff2", weight: "900", style: "italic" },
  ],
  variable: "--font-playfair",
});

const sourceSans = localFont({
  src: [
    { path: "../public/fonts/source-sans-3/300.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/source-sans-3/400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/source-sans-3/600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-source-sans",
});

const courierPrime = localFont({
  src: [
    { path: "../public/fonts/courier-prime/400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/courier-prime/700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-courier-prime",
});

// Watchfloor dashboard fonts
const inter = localFont({
  src: [
    { path: "../public/fonts/inter/400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/inter/500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/inter/600.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/inter/700.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/inter/800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-inter",
});

const jetbrainsMono = localFont({
  src: [
    { path: "../public/fonts/jetbrains-mono/400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/jetbrains-mono/500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/jetbrains-mono/600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Sentinel Review — Conflict Intelligence Dashboard",
  description: "Real-time OSINT conflict intelligence for Ukraine and beyond.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [dataStatus, { userId }] = await Promise.all([getLiveDataStatus(), auth()]);
  const entitlements = await getRequestEntitlements();
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${plexSans.variable} ${plexMono.variable} ${plexCondensed.variable} ${playfair.variable} ${sourceSans.variable} ${courierPrime.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        <body className="min-h-full">
          <DemoBanner status={dataStatus} />
          <GlobalHeader isAuthed={!!userId} tier={entitlements.tier} />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
