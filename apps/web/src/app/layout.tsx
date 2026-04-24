import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionExpiredHandler } from "@/components/auth/session-expired-handler";
import { AuthSuccessToaster } from "@/components/toast/auth-success-toaster";
import { SonnerToaster } from "@/components/toast/sonner-toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Neurons",
  description: "An agent marketplace from where anyone from anywhere in the world can integrate agents in web applications or websites.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} antialiased`}
      >
        {children}
        <SonnerToaster />
        <AuthSuccessToaster />
        <SessionExpiredHandler />
      </body>
    </html>
  );
}
