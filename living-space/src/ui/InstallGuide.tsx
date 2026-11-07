"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useInstall } from "./useInstall";

/** "Put Living Space on your phone": native prompt where supported, clear steps on iOS, QR code on desktop. */
export function InstallGuide() {
  const i = useInstall();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (i.platform !== "desktop" || i.localOnly || !i.url) return;
    QRCode.toString(i.url, { type: "svg", margin: 1, color: { dark: "#4A3428", light: "#FBF5E8" } }).then(setQr, () => setQr(null));
  }, [i.platform, i.localOnly, i.url]);

  if (i.installed)
    return (
      <p className="text-[15px]">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-sage border-2 border-ink mr-2" aria-hidden />
        Installed. You're running Living Space as an app.
      </p>
    );

  if (i.localOnly)
    return (
      <div className="text-[15px]">
        <p className="mb-2">This copy is running on <b>{i.url.replace(/^https?:\/\//, "")}</b>, which your phone can't install from.</p>
        <p className="text-sm text-ink-soft">
          Deploy it to an <b>https://</b> address first (README → “Put it on your phone” has a 5-minute Vercel guide), then open that address on your phone.
        </p>
      </div>
    );

  if (i.platform === "ios")
    return (
      <div className="text-[15px]">
        {i.iosInAppBrowser && <p className="mb-2 font-semibold">Open this page in Safari first. In-app browsers can't add apps to your home screen.</p>}
        <ol className="flex flex-col gap-2">
          <Step n={1}>
            Tap the <b>Share</b> button <ShareIcon /> in Safari's toolbar.
          </Step>
          <Step n={2}>
            Scroll down and tap <b>Add to Home Screen</b> <PlusIcon />.
          </Step>
          <Step n={3}>
            Tap <b>Add</b>. Living Space opens full-screen from its icon, like any app.
          </Step>
        </ol>
      </div>
    );

  return (
    <div className="text-[15px] flex flex-col gap-3">
      {i.canPrompt ? (
        <button
          type="button"
          className="btn btn-primary self-start"
          onClick={() => i.prompt()}
        >
          Install Living Space
        </button>
      ) : i.platform === "android" ? (
        <p>
          Open your browser menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.
        </p>
      ) : (
        <p>Use your browser's install button in the address bar, or open this page on your phone.</p>
      )}
      {qr && (
        <div className="flex gap-4 items-center">
          <div className="w-[132px] h-[132px] shrink-0 rounded-lg border-2 border-ink overflow-hidden bg-paper" role="img" aria-label={`QR code for ${i.url}`} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-sm text-ink-soft">
            Scan with your phone's camera to open <b className="break-all">{i.url.replace(/^https:\/\//, "")}</b>, then add it to your home screen.
          </p>
        </div>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="w-7 h-7 shrink-0 rounded-full border-2 border-ink bg-honey-soft grid place-items-center font-display text-sm" aria-hidden>
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function ShareIcon() {
  return (
    <svg className="inline -mt-1 mx-0.5" width="18" height="20" viewBox="0 0 18 22" aria-label="Share icon">
      <path d="M9 1v13M5 5l4-4 4 4" fill="none" stroke="#2F7DF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 9H3v12h12V9h-3" fill="none" stroke="#2F7DF6" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="inline -mt-1 mx-0.5" width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 5v8M5 9h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
