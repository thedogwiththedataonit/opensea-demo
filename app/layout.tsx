import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import StatusBar from "./components/StatusBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenSea | NFT Marketplace",
  description: "OpenSea Mock - NFT and Token Marketplace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#121212] text-white`}
      >
        <Sidebar />
        <TopBar />
        <main className="ml-[52px] mt-[56px] mb-[32px] min-h-[calc(100vh-88px)]">
          {children}
        </main>
        <StatusBar />
      </body>
    </html>
  );
}
