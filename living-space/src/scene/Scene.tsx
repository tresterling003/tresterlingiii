"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPE } from "react";
import { useWorld, world } from "@/engine/store";
import { sceneLook } from "@/engine/clock";
import { openPanel, petAction } from "@/engine/actions";
import { ResidentController, type ResidentView } from "@/engine/character";
import { tickVitals } from "@/domain/pet";
import { sheetModel } from "./Board";
import { HOTSPOTS, SPOTS, WORLD, type HotspotId } from "./layout";
import { useCamera } from "./useCamera";
import { PixelRoom, type RoomModel } from "./pixel/PixelRoom";
import { useReducedMotion } from "@/ui/useReducedMotion";
import type { PanelId } from "@/engine/store";

const HOTSPOT_PANEL: Record<HotspotId, PanelId> = {
  door: "inbox",
  mail: "inbox",
  window: "weather",
  calendar: "agenda",
  notes: "tasks",
  computer: "computer",
  phone: "phone",
};

export function Scene() {
  const reduced = useReducedMotion();
  const s = useWorld((x) => x);
  const look = useMemo(() => sceneLook(s), [s.now, s.timeOverride, s.weatherOverride, s.weather.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const { cam, panTo, panBy } = useCamera();
  const theme = s.settings.theme;
  const L = look.lighting;
  const demo = s.mode === "demo";
  const [hover, setHover] = useState<HotspotId | null>(null);
  const [painted, setPainted] = useState(false);

  // ── Resident controller (lives outside React; the canvas reads its state each frame) ──
  const petBtn = useRef<HTMLButtonElement>(null);
  const ctrl = useRef<ResidentController | null>(null);
  const [behavior, setBehavior] = useState<ResidentView["behavior"]>("idle");
  useEffect(() => {
    const place = (v: ResidentView) => {
      if (petBtn.current) petBtn.current.style.transform = `translate3d(${v.x - 55}px, ${v.y - 125}px, 0)`;
    };
    const c = new ResidentController(place, (v) => setBehavior(v.behavior), { phase: look.lighting.phase, weather: look.weather, energy: world.get().pet.vitals.energy, reducedMotion: reduced });
    ctrl.current = c;
    (window as unknown as { __resident?: ResidentController }).__resident = c;
    c.start();
    return () => c.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    ctrl.current?.setContext({ phase: L.phase, weather: look.weather, energy: s.pet.vitals.energy, reducedMotion: reduced });
  }, [L.phase, look.weather, s.pet.vitals.energy, reduced]);
  useEffect(() => {
    if (s.cue && Date.now() - s.cue.at < 3000) ctrl.current?.react(s.cue.kind);
  }, [s.cue]);
  // Vitals advance with time (gently; never from mail/schedule).
  useEffect(() => {
    if (!s.hydrated) return;
    world.set((w) => ({ pet: { ...w.pet, vitals: tickVitals(w.pet.vitals, Date.now(), behavior === "sleep") } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.now, s.hydrated]);
  const getResident = useCallback(() => ctrl.current?.state ?? null, []);

  // ── Derived object states ───────────────────────────────────────────────────
  const unread = s.mail.data?.unreadCount ?? 0;
  const compUnseen = s.activity.filter((a) => a.channel === "computer" && !a.read).length;
  const phoneUnseen = s.activity.filter((a) => a.channel === "phone" && !a.read).length;
  const compAwake = Date.now() - s.pulses.computer < 12_000 || s.ui.open === "computer" || compUnseen > 0;
  const phoneLit = Date.now() - s.pulses.phone < 8_000 || s.ui.open === "phone";
  const [, force] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => force((n) => n + 1), 12_500);
    return () => clearTimeout(t);
  }, [s.pulses.computer, s.pulses.phone]);
  const calState = !s.online && !s.calendar.data ? "offline" : demo ? "sample" : s.calendar.status === "error" ? "error" : s.calendar.status === "ready" ? "ready" : "loading";
  const sheet = useMemo(() => sheetModel(s.now, s.calendar.data?.events ?? null, calState), [s.now, s.calendar.data, calState]);
  const focusedId = s.ui.focusObject as HotspotId | null;

  const model: RoomModel = {
    theme,
    look,
    unread,
    tasks: s.tasks,
    sheet,
    pulses: s.pulses,
    compAwake,
    phoneLit,
    compUnseen,
    phoneUnseen,
    reduced,
    hover: hover ?? focusedId,
    showBall: theme.decorations.includes("ball"),
  };

  // ── Camera: drag to pan on narrow screens; focus on the opened object ──────
  const drag = useRef<{ x: number; moved: boolean; id: number } | null>(null);
  const onDown = (e: RPE) => {
    if (!cam.panX) return;
    drag.current = { x: e.clientX, moved: false, id: e.pointerId };
  };
  const onMove = (e: RPE) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 8) return;
    d.moved = true;
    d.x = e.clientX;
    panBy(dx);
  };
  const onUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };
  const activate = (id: HotspotId, el: HTMLElement) => {
    if (drag.current?.moved) return;
    const r = el.getBoundingClientRect();
    const h = HOTSPOTS[id];
    if (cam.panX) panTo(h.x + h.w / 2);
    openPanel(HOTSPOT_PANEL[id], { x: r.left + r.width / 2, y: r.top + r.height / 2 }, id);
  };

  const zoom = focusedId && !reduced && !cam.panX ? 1.06 : 1;
  const fx = focusedId && !cam.panX ? HOTSPOTS[focusedId].x + HOTSPOTS[focusedId].w / 2 : cam.x;
  const fy = focusedId && !cam.panX ? HOTSPOTS[focusedId].y + HOTSPOTS[focusedId].h / 2 : cam.y;
  const cx = cam.panX ? cam.x : cam.x + (fx - cam.x) * 0.25;
  const cy = cam.y + (fy - cam.y) * 0.25;
  const sc = cam.scale * zoom;
  const worldStyle: CSSProperties = {
    width: WORLD.w,
    height: WORLD.h,
    transform: `translate3d(${Math.round(cam.vw / 2 - cx * sc)}px, ${Math.round(cam.vh / 2 - cy * sc)}px, 0) scale(${sc})`,
  };

  return (
    <div
      className={`scene ${reduced ? "reduced" : ""} ${painted ? "painted" : ""}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onScroll={(e) => e.currentTarget.scrollTo(0, 0)}
      data-phase={L.phase}
      data-weather={look.weather}
    >
      <div className="world" style={worldStyle}>
        <PixelRoom model={model} resident={getResident} onFirstPaint={() => setPainted(true)} />

        {/* Interactive hotspots (real buttons, keyboard focusable, generous touch targets). */}
        <div className="hotspots">
          {(Object.keys(HOTSPOTS) as HotspotId[]).map((id) => {
            const h = HOTSPOTS[id];
            const label =
              id === "mail" || id === "door"
                ? `${h.label}: ${demo ? "sample " : ""}${unread} unread`
                : id === "computer"
                  ? `${h.label}: ${compUnseen} new`
                  : id === "phone"
                    ? `${h.label}: ${phoneUnseen} new alerts`
                    : id === "notes"
                      ? `${h.label}: ${s.tasks.filter((t) => !t.done).length} open`
                      : id === "window"
                        ? `${h.label}: weather`
                        : h.label;
            return (
              <button
                key={id}
                type="button"
                className={`hotspot hs-${id}`}
                style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
                aria-label={label}
                onClick={(e) => activate(id, e.currentTarget)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(id)}
                onPointerLeave={() => setHover((c) => (c === id ? null : c))}
                onFocus={(e) => {
                  if (e.currentTarget.matches(":focus-visible")) setHover(id);
                  if (cam.panX) panTo(h.x + h.w / 2);
                }}
                onBlur={() => setHover((c) => (c === id ? null : c))}
              >
                <span className="hs-tag">{h.label}</span>
              </button>
            );
          })}
          <button
            ref={petBtn}
            type="button"
            className="hotspot hs-pet"
            style={{ width: 110, height: 130, transform: `translate3d(${SPOTS.center.x - 55}px, ${SPOTS.center.y - 125}px, 0)` }}
            aria-label={`${s.pet.name}, your resident`}
            onClick={(e) => {
              if (drag.current?.moved) return;
              const r = e.currentTarget.getBoundingClientRect();
              petAction("pet");
              ctrl.current?.react("pet");
              openPanel("pet", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
          >
            <span className="hs-tag">{s.pet.name}</span>
          </button>
        </div>
      </div>

      {cam.panX && (
        <nav className="zones" aria-label="Look around the room">
          {[
            ["Door", 260],
            ["Window", 660],
            ["Board", 1050],
            ["Desk", 1360],
          ].map(([name, x]) => (
            <button key={name} type="button" className={Math.abs(cam.x - (x as number)) < 160 ? "on" : ""} onClick={() => panTo(x as number)}>
              {name}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
