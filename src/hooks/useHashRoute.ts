/**
 * TV-0017: the current in-app route, read from `location.hash` and updated on
 * `hashchange` (so the browser's back/forward buttons and pasted links both
 * work) - Docs/ADR/0004-vehicle-overview-page.md.
 */
import { useEffect, useState } from "react";
import { parseHashRoute, type AppRoute } from "../lib/route.ts";

function currentRoute(): AppRoute {
  return parseHashRoute(window.location.hash);
}

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(currentRoute);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(currentRoute());
    };
    window.addEventListener("hashchange", onHashChange);
    // The hash can change between the render that created the state above and
    // this effect (a link followed during hydration); re-read once.
    onHashChange();
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return route;
}

/** Navigates back to the map by clearing the fragment - assigning the hash is
 * what fires the `hashchange` the route state listens to. It adds a history
 * entry (so the browser's back button returns to the overview), and a trailing
 * `#` remains in the URL, which parses to the map. */
export function navigateToMap(): void {
  window.location.hash = "";
}
