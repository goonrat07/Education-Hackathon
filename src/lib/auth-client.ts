import { createAuthClient } from "better-auth/react";

/** Browser-side sign-in helpers. Talks to /api/auth on the same origin. */
export const authClient = createAuthClient();
