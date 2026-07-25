import Link from "next/link";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-neutral-200 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <nav className="flex items-center gap-8 text-sm">
            <span className="text-base font-semibold tracking-tight">
              Gift Registry
            </span>
            <Link href="/admin" className="text-neutral-500 hover:text-black">
              Gifts
            </Link>
            <Link
              href="/admin/theme"
              className="text-neutral-500 hover:text-black"
            >
              Theme
            </Link>
          </nav>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
