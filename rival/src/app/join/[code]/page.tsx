import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/** Invite links: /join/ABC123 → sign up (or sign in) with the code attached. */
export default function Join({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const signedIn = Boolean(cookies().get("hq_session")?.value);
  redirect(signedIn ? `/family?code=${code}` : `/sign-up?code=${code}`);
}
