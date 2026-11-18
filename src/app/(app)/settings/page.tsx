import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AI_DAILY_CALL_LIMIT } from "@/config/ai";
import { getAiUsage } from "@/server/data/usage";
import { pageUser } from "@/server/page-user";
import { AccountActions } from "./account-actions";

export const metadata: Metadata = { title: "Settings" };

async function Account() {
  const user = await pageUser();
  const used = await getAiUsage(user.userId, user.today);
  return (
    <dl className="mt-6 max-w-xl ruled-top">
      <div className="flex justify-between gap-6 py-3 ruled-bottom">
        <dt className="text-pencil">Name</dt>
        <dd className="text-right font-semibold">{user.name}</dd>
      </div>
      <div className="flex justify-between gap-6 py-3 ruled-bottom">
        <dt className="text-pencil">Email</dt>
        <dd className="text-right font-semibold [overflow-wrap:anywhere]">{user.email}</dd>
      </div>
      <div className="flex justify-between gap-6 py-3 ruled-bottom">
        <dt className="text-pencil">Your timezone</dt>
        <dd className="text-right font-semibold">{user.timezone}</dd>
      </div>
      <div className="flex justify-between gap-6 py-3 ruled-bottom">
        <dt className="text-pencil">AI requests used today</dt>
        <dd className="text-right font-semibold tabular-nums">
          {used} of {AI_DAILY_CALL_LIMIT}
        </dd>
      </div>
    </dl>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <Link href="/" className="link link-quiet text-sm">
        Back to today
      </Link>
      <h1 className="mt-3 text-3xl">Settings</h1>
      <Suspense fallback={<div className="mt-6 h-48 max-w-xl rounded-[3px] bg-rule-faint" aria-busy="true" />}>
        <Account />
      </Suspense>
      <p className="mt-3 max-w-xl text-sm text-pencil">
        Reading your files and writing cards, questions and checks each use AI requests. The count starts again at
        midnight.
      </p>
      <div className="mt-8">
        <AccountActions />
      </div>
    </div>
  );
}
