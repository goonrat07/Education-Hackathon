import { databaseConfigured } from "@/db";
import { getAuth } from "@/server/auth";

function notSetUp(): Response {
  return Response.json(
    { message: "Study Coach isn't fully set up yet: its database isn't connected.", code: "SETUP_INCOMPLETE" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  if (!databaseConfigured()) return notSetUp();
  return getAuth().handler(request);
}

export async function POST(request: Request) {
  if (!databaseConfigured()) return notSetUp();
  return getAuth().handler(request);
}
