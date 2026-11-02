// import { ReactScan } from "@/components/ReactScan";

import type { Metadata } from "next";
import Script from "next/script";
import { Press_Start_2P, Sedgwick_Ave_Display, VT323 } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PRODUCTION_URL } from "@/lib/auth/config";
import { resolveAuthBaseUrl } from "@/lib/auth/base-url";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CrtScreen } from "@/components/arcade/crt-screen";
import { Toaster } from "@/components/ui/sonner";
import { DbSwitchNotifier } from "@/components/DbSwitchNotifier";
import { CSPostHogProvider } from "@/posthog/client-init";
import PostHogIdentify from "@/posthog/PosthogIdentify";

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
});
const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vt323",
});
const sedgwick = Sedgwick_Ave_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-sedgwick",
});

export const metadata: Metadata = {
  metadataBase: new URL(resolveAuthBaseUrl(PRODUCTION_URL)),
  title: "RDC Stats Tracker",
  description: "Who's the best gamer?",
  openGraph: { siteName: "RDC Stats Tracker", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${pressStart.variable} ${vt323.variable} ${sedgwick.variable} h-screen`}
      lang="en"
      suppressHydrationWarning
    >
      {/* <ReactScan /> */}
      <body className="flex min-h-screen flex-col">
        {process.env.NODE_ENV === "development" ? (
          <Script
            src="https://unpkg.com/react-scan/dist/auto.global.js"
            strategy="lazyOnload"
          />
        ) : null}
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <CSPostHogProvider>
            <PostHogIdentify />
            {/* Comment this out to see ssg */}
            <Navbar />
            <main className="flex-1">{children}</main>
            <Toaster />
            {process.env.NODE_ENV === "development" && <DbSwitchNotifier />}
            <Footer />
            <CrtScreen />
          </CSPostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
