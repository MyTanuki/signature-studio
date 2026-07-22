import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./studio-v1.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:5173";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: "Signature Studio — มาตรฐานลายเซ็นองค์กร",
    description:
      "ปรับขนาด ตำแหน่ง พื้นหลัง และคุณภาพลายเซ็นให้เป็นมาตรฐาน โดยประมวลผลทั้งหมดบนอุปกรณ์ของคุณ",
    applicationName: "Signature Studio",
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: "Signature Studio",
      description: "ลายเซ็นทุกไฟล์ มาตรฐานเดียวกัน และเป็นส่วนตัว",
      type: "website",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "Signature Studio" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Signature Studio",
      description: "ลายเซ็นทุกไฟล์ มาตรฐานเดียวกัน และเป็นส่วนตัว",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#172554",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

