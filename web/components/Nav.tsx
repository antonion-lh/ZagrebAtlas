"use client";

import { usePathname } from "next/navigation";

const STAVKE = [
  { href: "/", naziv: "Karta" },
  { href: "/cetvrti", naziv: "Četvrti" },
  { href: "/ustanove", naziv: "Ustanove" },
  { href: "/energija", naziv: "Energija" },
  { href: "/katalog", naziv: "Katalog" },
  { href: "/vodic", naziv: "Vodič" },
];

export function Nav() {
  const path = usePathname() || "/";
  return (
    <nav aria-label="Glavna navigacija" className="glavna-nav">
      {STAVKE.map((s) => {
        const aktivan = s.href === "/" ? path === "/" : path === s.href || path.startsWith(`${s.href}/`);
        return (
          <a key={s.href} href={s.href} aria-current={aktivan ? "page" : undefined}>
            {s.naziv}
          </a>
        );
      })}
    </nav>
  );
}
