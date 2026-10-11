// import { ReactScan } from "@/components/ReactScan";

import type { Metadata } from "next";
import Script from "next/script";
import { Barlow_Condensed, Teko } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/ui/sonner";
import { DbSwitchNotifier } from "@/components/DbSwitchNotifier";
import { CSPostHogProvider } from "@/posthog/client-init";
import PostHogIdentify from "@/posthog/PosthogIdentify";

const teko = Teko({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-teko",
});
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "RDC Stats Tracker",
  description: "Who's the best gamer?",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${teko.variable} ${barlow.variable} h-screen`}
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
          </CSPostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
