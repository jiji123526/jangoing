"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

function HomeIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.35 4.75 9.2a1.4 1.4 0 0 0-.52 1.1v9.2c0 .77.63 1.4 1.4 1.4h4.52a1.4 1.4 0 0 0 1.4-1.4v-4.12h1.9v4.12c0 .77.63 1.4 1.4 1.4h4.52c.77 0 1.4-.63 1.4-1.4v-9.2a1.4 1.4 0 0 0-.52-1.1L12 3.35Z"
        fill="currentColor"
      />
    </svg>
  );
}

function InventoryIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.8" fill="currentColor" />
      <rect x="13" y="4" width="7" height="7" rx="1.8" fill="currentColor" />
      <rect x="4" y="13" width="7" height="7" rx="1.8" fill="currentColor" />
      <rect x="13" y="13" width="7" height="7" rx="1.8" fill="currentColor" />
    </svg>
  );
}

function AnalyticsIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 9.15a2.85 2.85 0 1 0 0 5.7 2.85 2.85 0 0 0 0-5.7Z"
        fill="currentColor"
      />
      <path
        d="M5.96 6.72a1.15 1.15 0 0 1 1.62.15 9.35 9.35 0 0 0 0 10.26 1.15 1.15 0 1 1-1.78 1.46 11.65 11.65 0 0 1 0-13.49 1.15 1.15 0 0 1 .16-.18Z"
        fill="currentColor"
      />
      <path
        d="M18.04 6.72a1.15 1.15 0 0 0-1.62.15 9.35 9.35 0 0 1 0 10.26 1.15 1.15 0 1 0 1.78 1.46 11.65 11.65 0 0 0 0-13.49 1.15 1.15 0 0 0-.16-.18Z"
        fill="currentColor"
      />
      <path
        d="M2.72 10.08a1.15 1.15 0 0 1 1.6.33 12.88 12.88 0 0 0 0 3.18 1.15 1.15 0 1 1-2.26.35 15.2 15.2 0 0 1 0-3.74 1.15 1.15 0 0 1 .66-.12Z"
        fill="currentColor"
      />
      <path
        d="M21.28 10.08a1.15 1.15 0 0 0-1.6.33 12.88 12.88 0 0 1 0 3.18 1.15 1.15 0 1 0 2.26.35 15.2 15.2 0 0 0 0-3.74 1.15 1.15 0 0 0-.66-.12Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShoppingIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9.1 2.9c0-.5.4-.9.9-.9h4c.5 0 .9.4.9.9v1h.7c1.92 0 3.48 1.56 3.48 3.48v10.14c0 1.92-1.56 3.48-3.48 3.48H8.4a3.48 3.48 0 0 1-3.48-3.48V7.38C4.92 5.46 6.48 3.9 8.4 3.9h.7v-1Zm2 .95v.05h1.8v-.05h-1.8Zm-1.75 3.1c-.83 0-1.5.67-1.5 1.5v7.08c0 .83.67 1.5 1.5 1.5h5.3c.83 0 1.5-.67 1.5-1.5V8.45c0-.83-.67-1.5-1.5-1.5h-5.3Z"
        fill="currentColor"
      />
      <path
        d="M13.05 9.55a.85.85 0 0 1 .85.85v3.25a1.95 1.95 0 1 1-.8-1.58v-1.73l-1.95.42a.7.7 0 0 1-.85-.69c0-.33.23-.62.55-.69l2.02-.43a.83.83 0 0 1 .18-.02Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="10.5"
        cy="10.5"
        r="5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="m15.1 15.1 4.2 4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

const capsuleTabs = [
  {
    label: "Home",
    href: "/",
    pathname: "/",
    icon: HomeIcon,
  },
  {
    label: "Inventory",
    href: "/inventory",
    pathname: "/inventory",
    icon: InventoryIcon,
  },
  {
    label: "Analytics",
    href: "/analytics",
    pathname: "/analytics",
    icon: AnalyticsIcon,
  },
  {
    label: "Shopping",
    href: "/shopping",
    pathname: "/shopping",
    icon: ShoppingIcon,
  },
] as const;

const searchTab = {
  label: "Search",
  href: "/search",
  pathname: "/search",
  icon: SearchIcon,
} as const;

function TabIcon({
  icon: Icon,
  className,
}: {
  icon: () => ReactNode;
  className?: string;
}) {
  return <span className={className ?? "bottom-navigation-icon"}>{Icon()}</span>;
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
        <TabIcon icon={tab.icon} />
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
          aria-label={searchTab.label}
          aria-current={pathname === searchTab.pathname ? "page" : undefined}
        >
          <TabIcon
            icon={searchTab.icon}
            className="bottom-navigation-icon bottom-navigation-search-icon"
          />
        </Link>
      </div>
    </nav>
  );
}
