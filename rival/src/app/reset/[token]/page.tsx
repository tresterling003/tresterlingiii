import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ResetForm } from "@/components/reset-form";
import { withUser } from "@/lib/db";
import { hashToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password" };

export default async function ResetPage({ params }: { params: { token: string } }) {
  const token = params.token.slice(0, 100);
  const info = await withUser(null, (tx) =>
    tx.one<{ display_name: string; team_name: string }>("select * from auth_reset_info($1)", [hashToken(token)]),
  );
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Link href="/" className="focus-ring mb-10 rounded-md"><Wordmark /></Link>
      <div className="panel w-full max-w-md animate-fade-up p-6 sm:p-8">
        {info ? (
          <>
            <h1 className="font-display text-3xl font-bold uppercase italic">New password</h1>
            <p className="mt-1 text-sm text-fg-muted">For {info.display_name} · {info.team_name}. This link works once.</p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold uppercase italic">Link expired</h1>
            <p className="mt-2 text-sm text-fg-muted">This reset link has expired or was already used. Ask your league commissioner for a new one.</p>
            <Link href="/sign-in" className="mt-6 inline-block text-sm font-semibold text-lime">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
