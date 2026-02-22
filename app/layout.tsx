import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Leavelift — Maximize Your Time Off",
  description:
    "Plan smarter vacations by stacking PTO with weekends and public holidays. Get more days off using less vacation time. Covers all 50 US states, 2025–2035.",
  icons: {
    icon: [{ url: "/icon.png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="bfed5192-bfc5-466e-adeb-99b8ccd057c4"
        />
      </body>
    </html>
  );
}
