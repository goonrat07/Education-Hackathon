import "server-only";
import { redirect } from "next/navigation";
import { getUser, type UserContext } from "@/server/session";

/** The signed-in student for a page. Sends anyone else to the sign-in screen. */
export async function pageUser(): Promise<UserContext> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
