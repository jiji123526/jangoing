"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

const mainTabs = [
  {
    label: "Home",
    href: "/#home",
    hash: "#home",
    icon: "/apple-music-tabbar/home.png",
  },
  {
    label: "Inventory",
    href: "/#inventory",
    hash: "#inventory",
    icon: "/apple-music-tabbar/inventory.png",
  },
] as const;

const trailingTabs = [
  {
    label: "Shopping",
    href: "/#shopping",
    hash: "#shopping",
    icon: "/apple-music-tabbar/shopping.png",
  },
  {
    label: "Search",
    href: "/#search",
    hash: "#search",
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
    const active = isActive(tab.hash);

    return (
      <Link
        className={`bottom-navigation-tab${active ? " is-active" : ""}`}
        href={tab.href}
        key={tab.label}
        aria-current={active ? "page" : undefined}
        onClick={() => setHash(tab.hash)}
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
