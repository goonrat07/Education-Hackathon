import { deleteAccount } from "@/server/data/account";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/session";

/** "Delete my data": removes the account and everything it owns. */
export async function DELETE() {
  return handle(async () => {
    const user = await requireUser();
    await deleteAccount(user.userId);
    return json({ ok: true });
  });
}
