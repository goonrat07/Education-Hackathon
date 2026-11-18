"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const COOKIE = "tz";

/**
 * Tells the server which timezone the student is in, so "today" and "a day
 * later" mean their calendar day. Sets a cookie and re-renders once if it changed.
 */
export function TimezoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const current = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `${COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
