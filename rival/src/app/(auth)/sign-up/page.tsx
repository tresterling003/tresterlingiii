import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account" };

export default function SignUp() {
  return (
    <>
      <h1 className="mb-1 text-3xl font-semibold">Join Christmas HQ</h1>
      <p className="mb-6 text-muted">Make your wishlist, see your family's, and keep gifts a surprise.</p>
      <Suspense><AuthForm mode="up" /></Suspense>
    </>
  );
}
