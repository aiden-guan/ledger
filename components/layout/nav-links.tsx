"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/", label: "overview" },
  { href: "/activity", label: "activity" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 font-mono text-[12px]">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" || pathname.startsWith("/findings") : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cn("px-1.5 py-1 transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <span className={cn(!active && "invisible")}>[</span>
            {l.label}
            <span className={cn(!active && "invisible")}>]</span>
          </Link>
        );
      })}
    </nav>
  );
}
