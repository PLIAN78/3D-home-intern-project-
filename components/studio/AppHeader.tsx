import Link from "next/link";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";

const NAV = [
  { href: "/", label: "Projects" },
  { href: "/communities", label: "Communities" },
];

/** Top bar for the internal index pages. */
export function AppHeader({ active }: { active?: "/" | "/communities" }) {
  return (
    <header className="flex h-14 items-center gap-6 border-b bg-background/80 px-6 backdrop-blur">
      <BrandMark subtitle="Internal" />
      <nav className="flex items-center gap-1 text-sm">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cn("rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted", active === n.href ? "font-medium text-foreground" : "text-muted-foreground")}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
