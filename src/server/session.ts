import "server-only";
import { cookies, headers } from "next/headers";
import { databaseConfigured } from "@/db";
import { isValidTimeZone, localDate } from "@/lib/dates";
import { getAuth } from "@/server/auth";
import { UnauthorizedError } from "@/server/errors";

/** Name of the cookie the browser sets with the student's IANA timezone. */
export const TIMEZONE_COOKIE = "tz";

export interface UserContext {
  userId: string;
  email: string;
  name: string;
  /** IANA timezone from the browser; UTC when it has not told us yet. */
  timezone: string;
  /** The student's calendar date right now, YYYY-MM-DD. */
  today: string;
}

/** The signed-in student, or null. Reads the request, so call it inside a Suspense boundary. */
export async function getUser(): Promise<UserContext | null> {
  // Read the request first. While a page is being prerendered there is no
  // request, and these calls are what tell Next.js to leave this part for request time.
  const requestHeaders = await headers();
  const zone = (await cookies()).get(TIMEZONE_COOKIE)?.value ?? "";

  // Nobody can be signed in on a server whose database is not connected yet.
  if (!databaseConfigured()) return null;
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const timezone = isValidTimeZone(zone) ? zone : "UTC";
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    timezone,
    today: localDate(new Date(), timezone),
  };
}

/** The signed-in student. Throws UnauthorizedError when there is none. */
export async function requireUser(): Promise<UserContext> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
