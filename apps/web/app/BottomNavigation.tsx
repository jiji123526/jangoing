"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
    icon: "/apple-music-tabbar/home.svg",
  },
  {
    label: "Inventory",
    href: "/inventory",
    pathname: "/inventory",
    icon: "/apple-music-tabbar/inventory.svg",
  },
] as const;

const trailingTabs = [
  {
    label: "Shopping",
    href: "/shopping",
    pathname: "/shopping",
    icon: "/apple-music-tabbar/shopping.svg",
  },
  {
    label: "Search",
    href: "/search",
    pathname: "/search",
    icon: "/apple-music-tabbar/search.svg",
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
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const previousLocationRef = useRef(locationKey);
  const cleanupTimerRef = useRef<number | null>(null);

  const isActive = (tabPathname: string) => pathname === tabPathname;

  useEffect(() => {
    for (const path of tabPaths) {
      if (path !== pathname) router.prefetch(path);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (previousLocationRef.current === locationKey) return;
    previousLocationRef.current = locationKey;

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
  }, [locationKey]);

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
    const activeDestination =
      active && searchParams.toString().length === 0;

    return (
      <RouteTransitionLink
        className={`bottom-navigation-tab${active ? " is-active" : ""}`}
        href={tab.href}
        active={activeDestination}
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
          active={
            pathname === "/analytics" &&
            searchParams.toString().length === 0
          }
          aria-current={pathname === "/analytics" ? "page" : undefined}
        >
          <TabIcon src="/apple-music-tabbar/annotate.svg" />
          <span>Analytics</span>
        </RouteTransitionLink>

        {trailingTabs.map(renderTab)}
      </div>
    </nav>
  );
}
