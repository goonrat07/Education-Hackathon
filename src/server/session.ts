import "server-only";
import { cookies, headers } from "next/headers";
import { isValidTimeZone, localDate } from "@/lib/dates";
import { getAuth } from "@/server/auth";

/** Name of the cookie the browser sets with the student's IANA timezone. */
export const TIMEZONE_COOKIE = "tz";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

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
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const zone = (await cookies()).get(TIMEZONE_COOKIE)?.value ?? "";
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
