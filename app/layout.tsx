import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/bebas-neue/400.css";
import "./globals.css";

const description = "The Zaza Club inventory, ordering, and stock operations for customers and administrators.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "inventory.thezazaclub.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: { default: "The Zaza Club Inventory", template: "%s · The Zaza Club" },
    description,
    applicationName: "The Zaza Club Inventory",
    openGraph: {
      type: "website",
      title: "The Zaza Club Inventory · Customer + Admin Portals",
      description,
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1662, height: 946, alt: "The Zaza Club inventory customer and admin portals" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "The Zaza Club Inventory · Customer + Admin Portals",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050706",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
