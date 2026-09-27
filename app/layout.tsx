import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TKU EduPsy · 研究貓",
  description: "淡江大學教育心理與諮商研究所研究生的 AI Research OS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@420;560;650&family=Fraunces:opsz,wght@9..144,460;9..144,560&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
