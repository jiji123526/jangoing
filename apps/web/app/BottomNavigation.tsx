"use client";

import {
  House,
  PackageSearch,
  Search,
  ShoppingBasket,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const mainTabs = [
  { label: "Home", href: "/#home", hash: "#home", icon: House },
  {
    label: "Inventory",
    href: "/#inventory",
    hash: "#inventory",
    icon: PackageSearch,
  },
] as const;

const trailingTabs = [
  {
    label: "Shopping",
    href: "/#shopping",
    hash: "#shopping",
    icon: ShoppingBasket,
  },
  { label: "Search", href: "/#search", hash: "#search", icon: Search },
] as const;

export default function BottomNavigation() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const isActive = (tabHash: string) =>
    pathname === "/" &&
    (hash === tabHash || (!hash && tabHash === "#home"));

  const renderTab = (
    tab: (typeof mainTabs)[number] | (typeof trailingTabs)[number],
  ) => {
    const Icon = tab.icon;
    const active = isActive(tab.hash);

    return (
      <Link
        className={`bottom-navigation-tab${active ? " is-active" : ""}`}
        href={tab.href}
        key={tab.label}
        aria-current={active ? "page" : undefined}
        onClick={() => setHash(tab.hash)}
      >
        <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
        <span>{tab.label}</span>
      </Link>
    );
  };

  return (
    <nav className="bottom-navigation" aria-label="Primary navigation">
      <div className="bottom-navigation-inner">
        {mainTabs.map(renderTab)}

        <Link
          className={`bottom-navigation-tab annotation-tab${
            pathname === "/annotate" ? " is-active" : ""
          }`}
          href="/annotate"
          aria-current={pathname === "/annotate" ? "page" : undefined}
        >
          <span className="annotation-tab-icon">
            <Tags size={23} strokeWidth={2.2} />
          </span>
          <span>Annotate</span>
        </Link>

        {trailingTabs.map(renderTab)}
      </div>
    </nav>
  );
}
