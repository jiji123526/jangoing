"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  completeRouteTransition,
  RouteTransitionLink,
} from "./RouteTransitionLink";

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
    completeRouteTransition();
    void root.offsetWidth;
    root.classList.add("household-tab-fade-in");

    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
    }
    cleanupTimerRef.current = window.setTimeout(() => {
      root.classList.remove("household-tab-fade-in");
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

  const renderTab = (
    tab: (typeof mainTabs)[number] | (typeof trailingTabs)[number],
  ) => {
    const active = isActive(tab.pathname);

    return (
      <RouteTransitionLink
        className={`bottom-navigation-tab${active ? " is-active" : ""}`}
        href={tab.href}
        active={active}
        key={tab.label}
        aria-current={active ? "page" : undefined}
      >
        <TabIcon src={tab.icon} />
        <span>{tab.label}</span>
      </RouteTransitionLink>
    );
  };

  return (
    <nav className="bottom-navigation" aria-label="Primary navigation">
      <div className="bottom-navigation-inner">
        {mainTabs.map(renderTab)}

        <RouteTransitionLink
          className={`bottom-navigation-tab analytics-tab${
            pathname === "/analytics" ? " is-active" : ""
          }`}
          href="/analytics"
          active={pathname === "/analytics"}
          aria-current={pathname === "/analytics" ? "page" : undefined}
        >
          <TabIcon src="/apple-music-tabbar/annotate.png" />
          <span>Analytics</span>
        </RouteTransitionLink>

        {trailingTabs.map(renderTab)}
      </div>
    </nav>
  );
}
