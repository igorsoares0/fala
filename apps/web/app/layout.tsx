import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Caption faces (preview + burn-in), also the UI's sans. The export renderer loads these
// same files (packages/shared/fonts), so preview and MP4 use identical fonts. All OFL-licensed.
const schibsted = localFont({
  variable: "--font-schibsted-face",
  src: "../../../packages/shared/fonts/SchibstedGrotesk-Variable.woff2",
  weight: "400 900",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono-face",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const anton = localFont({
  variable: "--font-anton-face",
  src: "../../../packages/shared/fonts/Anton-Regular.woff2",
  weight: "400",
});
const archivoBlack = localFont({
  variable: "--font-archivo-black-face",
  src: "../../../packages/shared/fonts/ArchivoBlack-Regular.woff2",
  weight: "400",
});
const dmSerif = localFont({
  variable: "--font-dm-serif-face",
  src: "../../../packages/shared/fonts/DMSerifDisplay-Regular.woff2",
  weight: "400",
});

export const metadata: Metadata = {
  title: { default: "Fala", template: "%s · Fala" },
  description: "Captioned short videos in minutes. Upload, review the text, pick a style, export.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${schibsted.variable} ${plexMono.variable} ${anton.variable} ${archivoBlack.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
