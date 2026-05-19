import type { Metadata } from "next";
import {
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Condensed,
  Playfair_Display,
  Source_Sans_3,
  Courier_Prime,
} from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import DemoBanner from "@/components/DemoBanner";
import { getLiveDataStatus } from "@/lib/queries";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

const plexCondensed = IBM_Plex_Sans_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-condensed",
});

const playfair = Playfair_Display({
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-playfair",
});

const sourceSans = Source_Sans_3({
  weight: ["300", "400", "600"],
  subsets: ["latin"],
  variable: "--font-source-sans",
});

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-courier-prime",
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
  const dataStatus = await getLiveDataStatus();
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${plexSans.variable} ${plexMono.variable} ${plexCondensed.variable} ${playfair.variable} ${sourceSans.variable} ${courierPrime.variable} h-full antialiased`}
      >
        <body className="min-h-full">
          <DemoBanner status={dataStatus} />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
