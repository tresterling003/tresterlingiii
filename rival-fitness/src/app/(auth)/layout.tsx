import Link from "next/link";
import { Wordmark, TAGLINE } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Link href="/" className="focus-ring mb-10 rounded-md"><Wordmark /></Link>
      <div className="w-full max-w-md animate-fade-up">{children}</div>
      <p className="mt-auto pt-10 text-xs text-fg-faint">{TAGLINE}</p>
    </div>
  );
}
