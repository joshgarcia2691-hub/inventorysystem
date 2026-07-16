import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "./globals.css";

const description = "RK Empires intelligent inventory operations for administrators and customers.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "inventory.rkempires.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: { default: "RK Empires Inventory", template: "%s · RK Empires" },
    description,
    applicationName: "RK Empires Inventory",
    openGraph: {
      type: "website",
      title: "RK Empires Inventory · Automate. Innovate. Elevate.",
      description,
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1662, height: 946, alt: "RK Empires intelligent inventory operations" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "RK Empires Inventory · Automate. Innovate. Elevate.",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
