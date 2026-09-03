"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type MouseEvent,
} from "react";

let routeTransitionPending = false;

export function completeRouteTransition(): void {
  routeTransitionPending = false;
  document.documentElement.classList.remove("household-tab-fade-out");
}

type RouteTransitionLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "onClick"
> & {
  href: string;
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function RouteTransitionLink({
  href,
  active = false,
  onClick,
  scroll,
  ...props
}: RouteTransitionLinkProps) {
  const router = useRouter();
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  return (
    <Link
      {...props}
      href={href}
      scroll={scroll}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (active || routeTransitionPending) {
          event.preventDefault();
          return;
        }
        if (
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
        routeTransitionPending = true;
        document.documentElement.classList.add("household-tab-fade-out");
        router.push(href, { scroll });
        fallbackTimerRef.current = window.setTimeout(() => {
          completeRouteTransition();
          fallbackTimerRef.current = null;
        }, 800);
      }}
    />
  );
}
