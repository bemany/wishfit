import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Gift-tags fonts, used by the landing page only for now.
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: "800" });
const text = Instrument_Sans({ variable: "--font-text", subsets: ["latin"] });
const label = DM_Mono({ variable: "--font-label", subsets: ["latin"], weight: "500" });

export const metadata: Metadata = {
  title: `${BRAND} – the right gift, in your budget`,
  description: "Drop in a chat, a wishlist link or your own words. The agent searches idealo live and picks one gift in your budget.",
};

// HeroUI switches themes via the `dark` class, so mirror the system setting onto <html> before paint.
// ponytail: system only, no manual toggle. Add next-themes if a switcher is wanted.
const followSystemTheme = `(()=>{const m=matchMedia("(prefers-color-scheme: dark)"),s=()=>{const d=document.documentElement;d.classList.toggle("dark",m.matches);d.dataset.theme=m.matches?"dark":"light"};s();m.addEventListener("change",s)})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${text.variable} ${label.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: followSystemTheme }} />
      </head>
      <body className="bg-background font-sans text-foreground">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-5">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {BRAND}
          </Link>
          {/* Pages read URL data on the client, so they render inside a Suspense boundary. */}
          <Suspense fallback={<p className="mt-8 text-muted">Lädt …</p>}>
            <main className="mt-8">{children}</main>
          </Suspense>
        </div>
      </body>
    </html>
  );
}
