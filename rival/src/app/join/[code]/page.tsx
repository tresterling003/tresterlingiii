import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { Wordmark } from "@/components/brand";
import { JoinButton } from "@/components/join-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join league" };

type Preview = { id: string; name: string; status: string; members: number; max_members: number; commissioner_team: string; is_member: boolean };

export default async function JoinPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const uid = await getUserId();
  if (!uid) redirect(`/sign-up?next=${encodeURIComponent(`/join/${code}`)}`);
  let preview: Preview | undefined;
  let error: string | null = null;
  try {
    preview = await withUser(uid, (tx) => tx.one<Preview>("select * from league_preview($1)", [code]));
    if (!preview) error = "That invite link doesn't match any league. Ask your commissioner for a new one.";
  } catch (e) {
    error = (e as Error).message;
  }
  if (preview?.is_member) redirect("/home");

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Link href="/home" className="focus-ring mb-10 rounded-md"><Wordmark /></Link>
      <div className="panel w-full max-w-md animate-fade-up p-6 text-center sm:p-8">
        {preview ? (
          <>
            <p className="eyebrow">You&rsquo;re invited to</p>
            <h1 className="mt-2 font-display text-4xl font-bold uppercase italic">{preview.name}</h1>
            <p className="mt-2 text-sm text-fg-muted">
              Commissioner: {preview.commissioner_team} · {preview.members}/{preview.max_members} teams
            </p>
            <div className="mt-8"><JoinButton code={code} disabled={preview.members >= preview.max_members || preview.status === "playoffs"} /></div>
            {preview.status === "playoffs" && <p className="mt-4 text-xs text-warn">This league is in the playoffs. You can join when the next season starts.</p>}
            {preview.members >= preview.max_members && <p className="mt-4 text-xs text-warn">This league is full.</p>}
            {preview.status === "regular" && <p className="mt-4 text-xs text-fg-faint">The season is underway — your first matchup starts next Monday.</p>}
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold uppercase italic">Invite not found</h1>
            <p className="mt-2 text-sm text-fg-muted">{error}</p>
            <Link href="/onboarding" className="mt-6 inline-block text-sm font-semibold text-lime">Enter a code instead</Link>
          </>
        )}
      </div>
    </div>
  );
}
