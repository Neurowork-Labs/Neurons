import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SessionExpiredHandler } from "@/components/auth/session-expired-handler";
import { AuthSuccessToaster } from "@/components/toast/auth-success-toaster";
import { SonnerToaster } from "@/components/toast/sonner-toaster";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
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
        className={`${plusJakartaSans.variable} antialiased`}
      >
        {children}
        <SonnerToaster />
        <AuthSuccessToaster />
        <SessionExpiredHandler />
      </body>
    </html>
  );
}
