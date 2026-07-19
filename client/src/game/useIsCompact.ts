import { useEffect, useState } from "react";

/**
 * True on narrow (phone) viewports, so the table can switch to its compact
 * portrait layout. Uses matchMedia; SSR-safe default is false.
 */
export function useIsCompact(maxWidth = 640): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [compact, setCompact] = useState<boolean>(
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setCompact(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return compact;
}
