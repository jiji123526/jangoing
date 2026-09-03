"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from "react";

const tabFadeInMs = 120;
const tabPaths = ["/", "/inventory", "/analytics", "/shopping", "/search"];

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
  const router = useRouter();
  const previousPathnameRef = useRef(pathname);
  const navigatingRef = useRef(false);
  const cleanupTimerRef = useRef<number | null>(null);

  const isActive = (tabPathname: string) => pathname === tabPathname;

  useEffect(() => {
    for (const path of tabPaths) {
      if (path !== pathname) router.prefetch(path);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;

    const root = document.documentElement;
    root.classList.remove("household-tab-fade-out");
    void root.offsetWidth;
    root.classList.add("household-tab-fade-in");

    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
    }
    cleanupTimerRef.current = window.setTimeout(() => {
      root.classList.remove("household-tab-fade-in");
      navigatingRef.current = false;
      cleanupTimerRef.current = null;
    }, tabFadeInMs);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
      }
      document.documentElement.classList.remove(
        "household-tab-fade-out",
        "household-tab-fade-in",
      );
    };
  }, []);

  function switchTab(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    active: boolean,
  ): void {
    if (active || navigatingRef.current) {
      event.preventDefault();
      return;
    }

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    event.preventDefault();
    navigatingRef.current = true;
    document.documentElement.classList.add("household-tab-fade-out");
    router.push(href);
    cleanupTimerRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove("household-tab-fade-out");
      navigatingRef.current = false;
      cleanupTimerRef.current = null;
    }, 800);
  }

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
        onClick={(event) => switchTab(event, tab.href, active)}
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
          className={`bottom-navigation-tab analytics-tab${
            pathname === "/analytics" ? " is-active" : ""
          }`}
          href="/analytics"
          aria-current={pathname === "/analytics" ? "page" : undefined}
          onClick={(event) =>
            switchTab(event, "/analytics", pathname === "/analytics")
          }
        >
          <TabIcon src="/apple-music-tabbar/annotate.png" />
          <span>Analytics</span>
        </Link>

        {trailingTabs.map(renderTab)}
      </div>
    </nav>
  );
}
