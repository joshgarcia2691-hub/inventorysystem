import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const description = "Products, purchasing, sales, stock control, suppliers, and reporting in one dependable workspace.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "stockwise.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: { default: "StockWise Inventory", template: "%s · StockWise" },
    description,
    applicationName: "StockWise",
    openGraph: {
      type: "website",
      title: "StockWise · Your stock, under control.",
      description,
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1747, height: 909, alt: "StockWise inventory operations" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "StockWise · Your stock, under control.",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10231b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
