import Link from "next/link";
import { TreePine } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-bg grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 text-2xl font-semibold">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-onaccent shadow-soft"><TreePine /></span>
          Christmas HQ
        </Link>
        <div className="anim-pop rounded-xl3 bg-card p-6 shadow-pop sm:p-8">{children}</div>
      </div>
    </div>
  );
}
