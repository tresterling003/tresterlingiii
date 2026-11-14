import { AppShell } from "@/components/shell";
import { AppProvider } from "@/components/league-context";
import { ToastProvider } from "@/components/ui/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <AppShell>{children}</AppShell>
      </AppProvider>
    </ToastProvider>
  );
}
