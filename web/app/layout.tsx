import type { ReactNode } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.JAVNI_URL || "https://zg-atlas.lakehouse.hr"),
  title: {
    default: "Zagreb Gradski atlas",
    template: "%s — Zagreb Gradski atlas",
  },
  description: "Karta i dosjei četvrti nad otvorenim podacima Grada Zagreba. Svaki sloj nosi oznaku koliko je podatak star.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hr">
      <body className={sans.variable} style={{ fontFamily: "var(--font-sans), var(--font)" }}>
        <a href="#sadrzaj" className="preskoci">
          Preskoči na sadržaj
        </a>
        <header className="zaglavlje">
          <a href="/" className="brend" aria-label="Zagreb Gradski atlas — početna">
            Zagreb Gradski atlas
          </a>
          <Nav />
        </header>
        <main id="sadrzaj" tabIndex={-1}>
          {children}
        </main>
        <footer className="podnozje">
          <span>
            Podaci dolaze s{" "}
            <a href="https://data.zagreb.hr" target="_blank" rel="noreferrer">
              data.zagreb.hr
            </a>
            , Grad Zagreb, Otvorena dozvola. Kôd je slobodan (
            <a href="https://github.com/antonion-lh/ZagrebAtlas" target="_blank" rel="noreferrer">
              MIT
            </a>
            ).
          </span>
          <span>
            <a href="/vodic">Vodič</a> · <a href="/vodic#pristupacnost">Pristupačnost</a> ·{" "}
            <a href="/katalog#api">Preuzimanja</a> · <a href="/vodic#kontakt">Greška? Javite</a>
          </span>
        </footer>
      </body>
    </html>
  );
}
