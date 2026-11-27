import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wishloop – Schenken, was wirklich gewünscht wird",
  description: "Wunschliste teilen, der Agent findet mit idealo-Daten das beste Geschenk im Budget.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="font-sans">
        <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-5">
          <Link href="/" className="text-lg font-bold text-accent">
            Wishloop
          </Link>
          {/* Pages read URL data on the client, so they render inside a Suspense boundary. */}
          <Suspense fallback={<p className="mt-8 text-stone-500">Lädt …</p>}>
            <main className="mt-6 flex flex-col gap-5">{children}</main>
          </Suspense>
        </div>
      </body>
    </html>
  );
}
