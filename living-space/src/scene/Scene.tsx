"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPE } from "react";
import { useWorld, world } from "@/engine/store";
import { sceneLook } from "@/engine/clock";
import { openPanel, petAction } from "@/engine/actions";
import { ResidentController, type ResidentView } from "@/engine/character";
import { tickVitals } from "@/domain/pet";
import { RoomShell, WallClockHands, FairyLights } from "./Room";
import { RoomWindow } from "./Window";
import { FrontDoor, MailPile, MailDelivery } from "./Door";
import { DailySheet, StickyNotes } from "./Board";
import { Desk, DeskLamp, Computer, Phone, Chair, FloorPlant, Cushion, Ball } from "./Desk";
import { ResidentSprite } from "./Resident";
import { HOTSPOTS, SPOTS, WORLD, type HotspotId } from "./layout";
import { useCamera } from "./useCamera";
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

/** A full-world SVG layer; `z` sorts it against the resident by floor depth. */
function Layer({ z, children, className }: { z: number; children: React.ReactNode; className?: string }) {
  return (
    <svg className={`layer ${className ?? ""}`} width={WORLD.w} height={WORLD.h} viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} overflow="visible" style={{ zIndex: z }} aria-hidden>
      {children}
    </svg>
  );
}

export function Scene() {
  const reduced = useReducedMotion();
  const s = useWorld((x) => x);
  const look = useMemo(() => sceneLook(s), [s.now, s.timeOverride, s.weatherOverride, s.weather.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const { cam, panTo, panBy } = useCamera();
  const theme = s.settings.theme;
  const L = look.lighting;
  const demo = s.mode === "demo";

  // ── Resident controller (lives outside React; we only mirror its view) ──────────
  const residentEl = useRef<HTMLDivElement>(null);
  const petBtn = useRef<HTMLButtonElement>(null);
  const ctrl = useRef<ResidentController | null>(null);
  const [rv, setRv] = useState<ResidentView | null>(null);
  useEffect(() => {
    const place = (v: ResidentView) => {
      const depth = 0.88 + ((v.y - 650) / 210) * 0.16;
      const t = `translate3d(${v.x - 80}px, ${v.y - 150}px, 0) scale(${depth})`;
      if (residentEl.current) {
        residentEl.current.style.transform = t;
        residentEl.current.style.zIndex = String(Math.round(v.y));
      }
      if (petBtn.current) petBtn.current.style.transform = `translate3d(${v.x - 55}px, ${v.y - 125}px, 0)`;
    };
    const c = new ResidentController(place, (v) => setRv({ ...v }), { phase: look.lighting.phase, weather: look.weather, energy: world.get().pet.vitals.energy, reducedMotion: reduced });
    ctrl.current = c;
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
    world.set((w) => ({ pet: { ...w.pet, vitals: tickVitals(w.pet.vitals, Date.now(), rv?.behavior === "sleep") } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.now, s.hydrated]);
  useEffect(() => {
    (window as unknown as { __resident?: ResidentController | null }).__resident = ctrl.current;
  });

  // ── Derived object states ───────────────────────────────────────────────────────
  const unread = s.mail.data?.unreadCount ?? 0;
  const compUnseen = s.activity.filter((a) => a.channel === "computer" && !a.read).length;
  const phoneUnseen = s.activity.filter((a) => a.channel === "phone" && !a.read).length;
  const compAwake = Date.now() - s.pulses.computer < 12_000 || s.ui.open === "computer" || compUnseen > 0;
  const phoneLit = Date.now() - s.pulses.phone < 8_000 || s.ui.open === "phone";
  // Re-render when the transient glow should end.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => force((n) => n + 1), 12_500);
    return () => clearTimeout(t);
  }, [s.pulses.computer, s.pulses.phone]);
  const calState = !s.online && !s.calendar.data ? "offline" : demo ? "sample" : s.calendar.status === "error" ? "error" : s.calendar.status === "ready" ? "ready" : "loading";

  // ── Camera: drag to pan on narrow screens; focus on the opened object ───────────
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

  const focus = s.ui.focusObject as HotspotId | null;
  const zoom = focus && !reduced && !cam.panX ? 1.06 : 1;
  const fx = focus && !cam.panX ? HOTSPOTS[focus].x + HOTSPOTS[focus].w / 2 : cam.x;
  const fy = focus && !cam.panX ? HOTSPOTS[focus].y + HOTSPOTS[focus].h / 2 : cam.y;
  const cx = cam.panX ? cam.x : cam.x + (fx - cam.x) * 0.25;
  const cy = cam.y + (fy - cam.y) * 0.25;
  const sc = cam.scale * zoom;
  const worldStyle: CSSProperties = {
    width: WORLD.w,
    height: WORLD.h,
    transform: `translate3d(${cam.vw / 2 - cx * sc}px, ${cam.vh / 2 - cy * sc}px, 0) scale(${sc})`,
  };

  const lampGlow = Math.max(L.lamps, look.dim * 0.8);
  const sunPool = Math.max(0, L.daylight - look.dim) * 0.5;
  const tintA = Math.min(0.62, L.tint[3] + look.dim * 0.35);

  return (
    <div
      className={`scene ${reduced ? "reduced" : ""}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onScroll={(e) => e.currentTarget.scrollTo(0, 0)}
      data-phase={L.phase}
      data-weather={look.weather}
    >
      <div className="world" style={worldStyle}>
        {/* z 0–599: wall plane; the resident (z = feet y ≥ 650) always walks in front of it. */}
        <Layer z={1}>
          <RoomShell theme={theme} />
          <WallClockHands minutes={look.minutes} />
          <FairyLights glow={L.lamps} />
        </Layer>
        <Layer z={2}>
          <RoomWindow weather={look.weather} lighting={L} minutes={look.minutes} reducedMotion={reduced} />
          {/* Daylight pool on the floor from the window */}
          <path
            d={`M470 604 L830 604 L${980 - (look.minutes / 1440) * 300} 780 L${380 - (look.minutes / 1440) * 200} 780 Z`}
            fill={L.golden > 0.5 ? "#FFD9A0" : "#FFF3D6"}
            opacity={sunPool}
            style={{ mixBlendMode: "soft-light", transition: "opacity 20s linear" }}
          />
        </Layer>
        <Layer z={3}>
          <FrontDoor flapAt={s.pulses.door} />
          <DailySheet now={s.now} events={s.calendar.data?.events ?? null} state={calState} />
          <StickyNotes tasks={s.tasks} />
          <Desk />
          <Computer awake={compAwake} unseen={compUnseen} glowKey={s.pulses.computer} lighting={L.daylight} />
          <Phone lit={phoneLit} unseen={phoneUnseen} buzzKey={s.pulses.phone} />
          <DeskLamp on={lampGlow} />
        </Layer>
        {/* Floor props, depth-sorted by their base line */}
        <Layer z={640}>
          <MailPile unread={unread} />
          <MailDelivery at={s.pulses.door} count={s.pulses.doorCount} />
        </Layer>
        <Layer z={742}>
          <FloorPlant still={reduced} />
        </Layer>
        <Layer z={780}>
          <Cushion color={theme.cushion} />
        </Layer>
        {rv?.pose !== "play" && theme.decorations.includes("ball") && (
          <Layer z={845}>
            <Ball x={600} y={840} />
          </Layer>
        )}
        <Layer z={822}>
          <Chair />
        </Layer>

        <div ref={residentEl} className="resident-wrap" style={{ zIndex: SPOTS.center.y }}>
          {rv && <ResidentSprite view={rv} body={theme.residentBody} belly={theme.residentBelly} sprout={theme.residentSprout} />}
        </div>

        {/* Lighting: multiply tint for time/weather, then additive lamp + screen glows. */}
        <div className="light tint" style={{ background: `rgba(${L.tint[0]},${L.tint[1]},${L.tint[2]},${tintA})` }} />
        <div className="light glow" style={{ opacity: lampGlow }}>
          <div className="g g-lamp" />
          <div className="g g-fairy" />
          <div className="g g-door" />
        </div>
        <div className="light glow" style={{ opacity: compAwake ? 0.9 : 0.15 + lampGlow * 0.2 }}>
          <div className="g g-screen" />
        </div>
        {sunPool > 0.15 && !reduced && <Dust />}

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
                onFocus={() => cam.panX && panTo(h.x + h.w / 2)}
              >
                <span className="hs-tag">{h.label}</span>
              </button>
            );
          })}
          <button
            ref={petBtn}
            type="button"
            className="hotspot hs-pet"
            style={{ width: 110, height: 130 }}
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

function Dust() {
  return (
    <div className="dust" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{ left: 480 + ((i * 53) % 380), top: 420 + ((i * 71) % 260), animationDelay: `${-i * 1.7}s`, animationDuration: `${14 + (i % 4) * 3}s` }} />
      ))}
    </div>
  );
}
