"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type CSSProperties } from "react";

const capsuleTabs = [
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
  {
    label: "Analytics",
    href: "/analytics",
    pathname: "/analytics",
    icon: "/apple-music-tabbar/annotate.png",
  },
  {
    label: "Shopping",
    href: "/shopping",
    pathname: "/shopping",
    icon: "/apple-music-tabbar/shopping.png",
  },
] as const;

const searchTab = {
  label: "Search",
  href: "/search",
  pathname: "/search",
  icon: "/apple-music-tabbar/search.png",
} as const;

function TabIcon({ src }: { src: string }) {
  const maskStyle: CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
  };

  return <span className="bottom-navigation-icon" style={maskStyle} />;
}

export default function BottomNavigation() {
  const pathname = usePathname();
  const activeCapsuleIndex = capsuleTabs.findIndex(
    (tab) => tab.pathname === pathname,
  );
  const lastCapsuleIndex = useRef(
    activeCapsuleIndex >= 0 ? activeCapsuleIndex : 0,
  );
  useEffect(() => {
    if (activeCapsuleIndex >= 0) {
      lastCapsuleIndex.current = activeCapsuleIndex;
    }
  }, [activeCapsuleIndex]);
  const pillIndex = activeCapsuleIndex >= 0
    ? activeCapsuleIndex
    : lastCapsuleIndex.current;

  const renderTab = (tab: (typeof capsuleTabs)[number]) => {
    const active = pathname === tab.pathname;

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
        <div className="bottom-navigation-capsule">
          <span
            className={`bottom-navigation-pill${activeCapsuleIndex < 0 ? " is-hidden" : ""}`}
            style={{
              transform: `translate3d(${pillIndex * 100}%, 0, 0)`,
            }}
            aria-hidden="true"
          />
          {capsuleTabs.map(renderTab)}
        </div>
        <Link
          className={`bottom-navigation-search${pathname === searchTab.pathname ? " is-active" : ""}`}
          href={searchTab.href}
          aria-label="Search"
          aria-current={pathname === searchTab.pathname ? "page" : undefined}
        >
          <TabIcon src={searchTab.icon} />
        </Link>
      </div>
    </nav>
  );
}
