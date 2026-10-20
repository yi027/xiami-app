"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "事件" },
  { href: "/stats", label: "統計" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/events");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-[#f7f2ea]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="seal">謎</span>
            <span className="min-w-0">
              <span className="block font-serif text-lg leading-none">瞎謎</span>
              <span className="mt-1 block truncate text-xs text-muted">{user.email}</span>
            </span>
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="主要">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm",
                  isActive(pathname, link.href) ? "bg-white font-medium shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/events/new">
                <Plus className="h-4 w-4" />
                新事件
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                登出
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-24 md:px-6 md:pb-12">{children}</main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[#fffdf8]/95 backdrop-blur md:hidden"
        aria-label="手機"
      >
        <div className="mx-auto grid max-w-5xl grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "py-3 text-center text-sm",
                isActive(pathname, link.href) ? "font-semibold text-seal" : "text-muted",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
