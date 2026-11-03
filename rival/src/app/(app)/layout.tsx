import { AppShell } from "@/components/shell";
import { LeagueProvider } from "@/components/league-context";
import { ToastProvider } from "@/components/ui/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <LeagueProvider>
        <AppShell>{children}</AppShell>
      </LeagueProvider>
    </ToastProvider>
  );
}
