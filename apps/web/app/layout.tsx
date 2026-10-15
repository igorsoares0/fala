import type { Metadata } from "next";
import { Anton, Archivo_Black, DM_Serif_Display, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted-face",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono-face",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Caption faces (preview + burn-in). All OFL-licensed.
const anton = Anton({ variable: "--font-anton-face", subsets: ["latin"], weight: "400" });
const archivoBlack = Archivo_Black({ variable: "--font-archivo-black-face", subsets: ["latin"], weight: "400" });
const dmSerif = DM_Serif_Display({ variable: "--font-dm-serif-face", subsets: ["latin"], weight: "400" });

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
