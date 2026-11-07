"use client";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Chrome/Edge/Android fire this once, early — capture it at module load so we don't miss it.
let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    subs.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    subs.forEach((f) => f());
  });
}

export type Platform = "ios" | "android" | "desktop";

export interface InstallState {
  platform: Platform;
  /** Already running as an installed app (home-screen / standalone window). */
  installed: boolean;
  /** A native install prompt is available (Android/desktop Chromium). */
  canPrompt: boolean;
  /** Served from localhost/a LAN IP — a phone can't reach or install it from here. */
  localOnly: boolean;
  /** iOS but not Safari-family browser that supports Add to Home Screen well. */
  iosInAppBrowser: boolean;
  url: string;
  prompt(): Promise<boolean>;
}

export function useInstall(): InstallState {
  const [, bump] = useState(0);
  const [env, setEnv] = useState({ platform: "desktop" as Platform, installed: false, localOnly: true, iosInAppBrowser: false, url: "" });
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const h = location.hostname;
    const localOnly = h === "localhost" || h === "127.0.0.1" || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h) || location.protocol !== "https:";
    // In-app browsers (Instagram, Gmail, etc.) can't add to home screen.
    const iosInAppBrowser = ios && /(FBAN|FBAV|Instagram|GSA\/|Line\/|Twitter)/.test(ua);
    setEnv({ platform: ios ? "ios" : android ? "android" : "desktop", installed: standalone, localOnly, iosInAppBrowser, url: location.origin });
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return {
    ...env,
    canPrompt: deferred != null,
    async prompt() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      bump((n) => n + 1);
      return outcome === "accepted";
    },
  };
}
