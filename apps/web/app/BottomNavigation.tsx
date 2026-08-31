"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

const mainTabs = [
  {
    label: "Home",
    href: "/",
    pathname: "/",
    icon: "/apple-music-tabbar/home.png",
  },
  {
    label: "Inventory",
    href: "/inventory",
    pathname: "/inventory",
    icon: "/apple-music-tabbar/inventory.png",
  },
] as const;

const trailingTabs = [
  {
    label: "Shopping",
    href: "/shopping",
    pathname: "/shopping",
    icon: "/apple-music-tabbar/shopping.png",
  },
  {
    label: "Search",
    href: "/search",
    pathname: "/search",
    icon: "/apple-music-tabbar/search.png",
  },
] as const;

function TabIcon({ src }: { src: string }) {
  const maskStyle: CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
  };

  return <span className="bottom-navigation-icon" style={maskStyle} />;
}

export default function BottomNavigation() {
  const pathname = usePathname();

  const isActive = (tabPathname: string) => pathname === tabPathname;

  const renderTab = (
    tab: (typeof mainTabs)[number] | (typeof trailingTabs)[number],
  ) => {
    const active = isActive(tab.pathname);

    return (
      <Link
        className={`bottom-navigation-tab${active ? " is-active" : ""}`}
        href={tab.href}
        key={tab.label}
        aria-current={active ? "page" : undefined}
      >
        <TabIcon src={tab.icon} />
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
          <TabIcon src="/apple-music-tabbar/annotate.png" />
          <span>Annotate</span>
        </Link>

        {trailingTabs.map(renderTab)}
      </div>
    </nav>
  );
}
