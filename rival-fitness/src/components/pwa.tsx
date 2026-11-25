"use client";
import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { Button } from "./ui/button";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();

/** Registers the service worker and captures Android's install prompt. Mounted once in the root layout. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as BIPEvent;
      listeners.forEach((l) => l());
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}

type Platform = "installed" | "ios" | "android" | "other";

function detect(): Platform {
  if (typeof window === "undefined") return "other";
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function useInstall() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [canPrompt, setCanPrompt] = useState(false);
  useEffect(() => {
    setPlatform(detect());
    const update = () => setCanPrompt(!!deferred);
    update();
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    setCanPrompt(false);
    setPlatform(detect());
  };
  return { platform, canPrompt, install };
}

function IosSteps() {
  const row = "flex gap-2";
  const n = "tnum w-4 shrink-0 font-bold text-fg";
  const icon = "mx-0.5 inline h-4 w-4 align-[-3px]";
  return (
    <ol className="flex flex-col gap-2 text-sm text-fg-muted">
      <li className={row}><span className={n}>1</span><span>Tap <Share className={`${icon} text-info`} aria-label="Share" /> <span className="font-semibold text-fg">Share</span> in Safari&rsquo;s toolbar</span></li>
      <li className={row}><span className={n}>2</span><span>Choose <PlusSquare className={`${icon} text-fg`} aria-hidden="true" /> <span className="font-semibold text-fg">Add to Home Screen</span></span></li>
      <li className={row}><span className={n}>3</span><span>Tap <span className="font-semibold text-fg">Add</span>. RIVAL opens full-screen like an app.</span></li>
    </ol>
  );
}

/** Install guidance. `dismissible` cards remember the choice per device. */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const { platform, canPrompt, install } = useInstall();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = dismissible && localStorage.getItem("rival.install-dismissed") === "1"; } catch {}
    setHidden(dismissed);
  }, [dismissible]);

  if (hidden || platform === "installed") return null;
  if (dismissible && platform === "other" && !canPrompt) return null; // desktop: don't nag

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem("rival.install-dismissed", "1"); } catch {}
  };

  return (
    <section className="panel relative p-4 sm:p-6" data-testid="install-card">
      {dismissible && (
        <button onClick={dismiss} aria-label="Dismiss" className="focus-ring absolute right-2 top-2 rounded-md p-2 text-fg-faint hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/apple-touch-icon.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-[11px]" />
        <div className="min-w-0 flex-1 pr-6">
          <p className="font-semibold">Put RIVAL on your home screen</p>
          <p className="mt-1 text-sm text-fg-muted">Opens full-screen like a real app — one tap to log.</p>
        </div>
      </div>
      <div className="mt-4">
        {canPrompt ? (
          <Button onClick={install} icon={<Download className="h-4 w-4" />} block>Install RIVAL</Button>
        ) : platform === "ios" ? (
          <IosSteps />
        ) : platform === "android" ? (
          <p className="text-sm text-fg-muted">Open Chrome&rsquo;s <span className="font-semibold text-fg">⋮ menu</span> and choose <span className="font-semibold text-fg">Add to Home screen</span> (or <span className="font-semibold text-fg">Install app</span>).</p>
        ) : (
          <p className="text-sm text-fg-muted">On your phone, open this site and add it to your home screen from the browser&rsquo;s share or menu button.</p>
        )}
      </div>
    </section>
  );
}
