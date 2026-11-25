import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in" };

export default function SignIn() {
  return (
    <>
      <h1 className="mb-1 text-3xl font-semibold">Welcome back</h1>
      <p className="mb-6 text-muted">Sign in to your family's Christmas HQ.</p>
      <Suspense><AuthForm mode="in" /></Suspense>
    </>
  );
}
