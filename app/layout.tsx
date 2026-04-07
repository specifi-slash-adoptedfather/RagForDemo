import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "\u7535\u5546\u5ba2\u670d RAG MVP",
  description: "E-commerce customer service knowledge base chat MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
