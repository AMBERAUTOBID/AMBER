"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import createGlobe from "cobe";
import { clsx } from "clsx";
import {
  DESTINATION_PORTS,
  nearestLoadingPort,
  pickupCoords,
  oceanRouteWaypoints,
  densifyRoute,
  type GeoPoint,
} from "@/modules/pricing/model/mapGeo";

type Vec3 = [number, number, number];
type CobeMarker = { location: [number, number]; size: number; color?: Vec3; id?: string };
type CobeArc = { from: [number, number]; to: [number, number]; color?: Vec3 };
type TimedArc = { arc: CobeArc; revealAt: number };

// Brand palette in cobe's normalized RGB. The two route legs use
// deliberately high-contrast colors (near-black vs. bright amber) since
// cobe can't vary line width or add a dash pattern per-arc — color is the
// only lever available to tell the legs apart at a glance.
const AMBER: Vec3 = [0.765, 0.4, 0.141]; // amber-500 #c36624 — ocean freight leg
/**
 * The domestic trucking leg.
 *
 * ⚠️ THIS COLOUR AND THE SPHERE'S ARE ONE DECISION, NOT TWO. It was briefly
 * lightened to char-400 while the globe was dark, because char-900 on a
 * charcoal sphere is a line drawn in the background colour. The globe went back
 * to light, so this goes back to dark with it — and if the sphere is ever
 * darkened again, this has to move in the same commit.
 *
 * ⚠️ **The legend swatch is a Tailwind class in CostCalculator, not this
 * constant** — change one and the key stops describing the picture.
 */
const TRUCK: Vec3 = [0.102, 0.094, 0.09]; // char-900 #1a1817 — domestic trucking leg

// CSS-ident-safe ids for cobe's anchor-name labels.
const PORT_IDS: Record<string, string> = {
  "Los Angeles, CA": "la",
  "Seattle, WA": "sea",
  "Newark, NJ": "ewr",
  "Houston, TX": "hou",
  "Savannah, GA": "sav",
  "Chicago, IL": "chi",
  "Klaipėda, Lithuania": "klaipeda",
  "Poti, Georgia": "poti",
  "Rotterdam, Netherlands": "rotterdam",
  "Bremerhaven, Germany": "bremerhaven",
  "Gdańsk, Poland": "gdansk",
  "Batumi, Georgia": "batumi",
  "Constanța, Romania": "constanta",
  "Varna, Bulgaria": "varna",
  "Mersin, Turkey": "mersin",
  "Beirut, Lebanon": "beirut",
  "Aqaba, Jordan": "aqaba",
  "Dubai, United Arab Emirates": "dubai",
  "Dammam, Saudi Arabia": "dammam",
  "Doha, Qatar": "doha",
  "Salalah, Oman": "salalah",
};

// cobe centers longitude (-90 − phi·180/π) on screen, derived from its
// source (view rotation A(phi,theta) against U(lat,lng)); this inverts that.
const phiForLng = (lng: number) => (-(90 + lng) * Math.PI) / 180;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const IDLE_SPIN_SPEED = 0.0022;
const EASE = 0.07;
const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2.6;
const ZOOM_EASE = 0.12;

const subscribeNever = () => () => {};

function toArcs(points: GeoPoint[], color: Vec3, startAt: number, perSegment: number): TimedArc[] {
  const arcs: TimedArc[] = [];
  for (let i = 1; i < points.length; i++) {
    arcs.push({
      arc: {
        from: [points[i - 1].lat, points[i - 1].lng],
        to: [points[i].lat, points[i].lng],
        color,
      },
      revealAt: startAt + (i - 1) * perSegment,
    });
  }
  return arcs;
}

export default function RouteGlobe({
  pickup,
  destinationPort,
  className,
}: {
  pickup: string;
  destinationPort: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // SSR-safe one-time capability check: labels rely on CSS Anchor Positioning.
  const anchorsSupported = useSyncExternalStore(
    subscribeNever,
    () => CSS.supports("anchor-name", "--probe"),
    () => false
  );

  const scene = useMemo(() => {
    const pickupPoint = pickup ? pickupCoords(pickup) : null;
    const nearestPort = pickupPoint ? nearestLoadingPort(pickupPoint) : null;
    const destPort = DESTINATION_PORTS[destinationPort] ?? null;

    const markers: CobeMarker[] = [];
    const labels: { id: string; text: string; active: boolean; isPickup: boolean }[] = [];

    // US loading ports stay hidden until a pickup is chosen — only the
    // nearest one (the port the route actually uses) appears, keeping the
    // US side of the globe uncluttered.
    if (nearestPort) {
      // When the pickup city is the port city itself, the pickup pill is enough.
      const coveredByPickup =
        pickupPoint !== null &&
        Math.abs(pickupPoint.lat - nearestPort.point.lat) < 1.2 &&
        Math.abs(pickupPoint.lng - nearestPort.point.lng) < 1.2;
      markers.push({
        location: [nearestPort.point.lat, nearestPort.point.lng],
        size: 0.05,
        color: AMBER,
        id: PORT_IDS[nearestPort.name],
      });
      if (!coveredByPickup) {
        labels.push({ id: PORT_IDS[nearestPort.name], text: nearestPort.name, active: true, isPickup: false });
      }
    }

    // Only the client's actually-selected destination port is shown — not
    // every port SmartAutoBid ships to — so the globe stays uncluttered.
    if (destPort) {
      markers.push({
        location: [destPort.point.lat, destPort.point.lng],
        size: 0.05,
        color: AMBER,
        id: PORT_IDS[destPort.name],
      });
      labels.push({ id: PORT_IDS[destPort.name], text: destPort.name, active: true, isPickup: false });
    }

    const arcs: TimedArc[] = [];
    if (pickupPoint && nearestPort) {
      markers.push({
        location: [pickupPoint.lat, pickupPoint.lng],
        size: 0.055,
        color: AMBER,
        id: "pickup",
      });
      labels.push({ id: "pickup", text: pickup, active: true, isPickup: true });

      const truckingPoints = densifyRoute([pickupPoint, nearestPort.point], 4);
      arcs.push(...toArcs(truckingPoints, TRUCK, 0.15, 0.05));
      const truckingDone = 0.15 + (truckingPoints.length - 1) * 0.05;

      if (destPort) {
        const oceanPoints = densifyRoute(
          [nearestPort.point, ...oceanRouteWaypoints(nearestPort.name, destPort.name), destPort.point],
          6
        );
        arcs.push(...toArcs(oceanPoints, AMBER, truckingDone + 0.3, 0.03));
      }
    }

    let target: { phi: number; theta: number } | null = null;
    if (pickupPoint && destPort) {
      const midLng = (pickupPoint.lng + destPort.point.lng) / 2;
      const midLat = (pickupPoint.lat + destPort.point.lat) / 2 + 6;
      target = {
        phi: phiForLng(midLng),
        theta: clamp((midLat * Math.PI) / 180, 0.15, 0.52),
      };
    }

    return { markers, labels, arcs, target };
  }, [pickup, destinationPort]);

  const sceneRef = useRef(scene);
  const animStartRef = useRef(0);
  const interactedRef = useRef(false);
  // scaleRef is the value actually rendered each frame; scaleTargetRef is
  // what the zoom buttons set. frame() eases the former toward the latter
  // every tick, so a click produces a smooth zoom rather than an instant jump.
  const scaleRef = useRef(1);
  const scaleTargetRef = useRef(1);

  function zoomBy(delta: number) {
    scaleTargetRef.current = clamp(scaleTargetRef.current + delta, ZOOM_MIN, ZOOM_MAX);
    interactedRef.current = true;
  }

  useEffect(() => {
    sceneRef.current = scene;
    animStartRef.current = performance.now();
    interactedRef.current = false;
  }, [scene]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas: HTMLCanvasElement = canvasRef.current;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let globe: ReturnType<typeof createGlobe> | null = null;
    let rafId = 0;
    let width = 0;

    const phiRef = { current: phiForLng(-45) };
    const thetaRef = { current: 0.3 };
    const dragging = { current: null as { x: number; y: number } | null };
    const velocity = { current: { phi: 0, theta: 0 } };
    const lastPointer = { current: null as { x: number; y: number; t: number } | null };
    const pendingResize = { current: 0 };

    function onPointerDown(e: PointerEvent) {
      dragging.current = { x: e.clientX, y: e.clientY };
      interactedRef.current = true;
      velocity.current = { phi: 0, theta: 0 };
      canvas.style.cursor = "grabbing";
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging.current) return;
      const dx = e.clientX - dragging.current.x;
      const dy = e.clientY - dragging.current.y;
      dragging.current = { x: e.clientX, y: e.clientY };
      phiRef.current += dx / 240;
      thetaRef.current = clamp(thetaRef.current + dy / 500, -0.2, 0.8);
      const now = performance.now();
      if (lastPointer.current) {
        const dt = Math.max(now - lastPointer.current.t, 1);
        velocity.current = {
          phi: clamp(((e.clientX - lastPointer.current.x) / dt) * 0.02, -0.12, 0.12),
          theta: clamp(((e.clientY - lastPointer.current.y) / dt) * 0.008, -0.05, 0.05),
        };
      }
      lastPointer.current = { x: e.clientX, y: e.clientY, t: now };
    }
    function onPointerUp() {
      dragging.current = null;
      lastPointer.current = null;
      canvas.style.cursor = "grab";
    }

    function frame() {
      const scene = sceneRef.current;

      if (!dragging.current) {
        if (Math.abs(velocity.current.phi) > 1e-4 || Math.abs(velocity.current.theta) > 1e-4) {
          phiRef.current += velocity.current.phi;
          thetaRef.current = clamp(thetaRef.current + velocity.current.theta, -0.2, 0.8);
          velocity.current.phi *= 0.94;
          velocity.current.theta *= 0.94;
        } else if (scene.target && !interactedRef.current) {
          const ease = reducedMotion ? 1 : EASE;
          phiRef.current += wrapAngle(scene.target.phi - phiRef.current) * ease;
          thetaRef.current += (scene.target.theta - thetaRef.current) * ease;
        } else if (!scene.target && !interactedRef.current && !reducedMotion) {
          phiRef.current += IDLE_SPIN_SPEED;
          thetaRef.current += (0.3 - thetaRef.current) * 0.02;
        }
      }

      const elapsed = reducedMotion ? Infinity : (performance.now() - animStartRef.current) / 1000;
      const arcs: CobeArc[] = [];
      for (const timed of scene.arcs) {
        if (timed.revealAt <= elapsed) arcs.push(timed.arc);
      }

      scaleRef.current += reducedMotion
        ? scaleTargetRef.current - scaleRef.current
        : (scaleTargetRef.current - scaleRef.current) * ZOOM_EASE;

      const update: Record<string, unknown> = {
        phi: phiRef.current,
        theta: thetaRef.current,
        scale: scaleRef.current,
        markers: scene.markers,
        arcs,
      };
      if (pendingResize.current && pendingResize.current !== width) {
        width = pendingResize.current;
        update.width = width;
        update.height = width;
      }
      globe?.update(update);
      rafId = requestAnimationFrame(frame);
    }

    function init() {
      if (globe || canvas.offsetWidth === 0) return;
      width = canvas.offsetWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width,
        height: width,
        phi: phiRef.current,
        theta: thetaRef.current,
        scale: scaleRef.current,
        /*
         * ⚠️ THESE NUMBERS WERE CHANGED TO A DARK SPHERE ON 2026-08-18 AND PUT
         * BACK THE SAME DAY. The reasoning for darkening them was sound — a
         * near-white globe under a near-white glow on a near-white page reads
         * as a smudge — but the result was worse, not better: the owner's words
         * were that it now looked like a hole in the section. Reverted rather
         * than tuned further, because tuning needs eyes on the screen and this
         * cannot be checked headlessly: a WebGL drawing buffer is cleared after
         * compositing, so both screenshots and `readPixels` come back empty in
         * a background tab and report a blank globe that is actually fine.
         *
         * **The colour question is still open and belongs to the owner.** What
         * changed instead is the one thing that helps whatever colour wins: the
         * sphere now has a defined edge (see the ring on the canvas below), so
         * it reads as an object rather than dissolving into the page.
         */
        dark: 0,
        diffuse: 1.8,
        mapSamples: 24000,
        mapBrightness: 11,
        baseColor: [1, 0.98, 0.955],
        markerColor: AMBER,
        glowColor: [0.965, 0.95, 0.93],
        opacity: 0.96,
        markers: [],
        arcs: [],
        arcColor: AMBER,
        arcWidth: 0.55,
        arcHeight: 0.02,
        markerElevation: 0.012,
      });
      frame();
      // createGlobe renders its first frame synchronously, so the reveal
      // must not wait on rAF — rAF never fires in hidden/background tabs.
      setTimeout(() => {
        canvas.style.opacity = "1";
      }, 0);
    }

    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w === 0) return;
      if (!globe) init();
      else pendingResize.current = w;
    });
    ro.observe(canvas);
    init();

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      globe?.destroy();
    };
  }, []);

  return (
    <div className={clsx("relative aspect-square w-full select-none", className)}>
      {/*
        ⚠️ THE RING AND GROUND SHADOW THAT SAT HERE ARE GONE — owner's call,
        2026-08-19, and worth recording rather than just deleting.

        They were added earlier the same week to answer a different complaint:
        a pale sphere on a pale page has no silhouette, and "the map isn't
        clear" was mostly that. What they actually produced was a second circle
        — a lit disc a good deal larger than the globe, so the graphic read as a
        plate with a world sitting on it. The fix was aimed at the right problem
        and drew the wrong thing.

        If the silhouette ever needs help again, the answer is contrast INSIDE
        the sphere — cobe's own `dark`, `baseColor` and `glowColor` — not another
        shape around it. A ring is a frame, and this globe is not a picture.
      */}
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1s ease",
          touchAction: "none",
        }}
      />
      {anchorsSupported &&
        scene.labels.map((label) => (
          <div
            key={label.id}
            className={clsx(
              "pointer-events-none absolute whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none shadow-sm",
              label.isPickup
                ? "bg-amber-600 font-semibold text-white"
                : label.active
                  ? "border border-amber-300 bg-amber-50 text-amber-700"
                  : "border border-char-200 bg-white/95 text-char-600"
            )}
            /**
             * ⚠️ THE PICKUP SITS ABOVE ITS DOT AND THE PORTS SIT BELOW THEIRS,
             * and that is the whole fix for labels landing on top of each other.
             *
             * Reported by the owner 2026-08-19 with "Montgomery, AL" printed
             * over "Savannah, GA". Every label used to hang above its marker,
             * which is fine until two markers are close — and two of these three
             * are ALWAYS close, because the loading port is by definition the
             * nearest one to the pickup. Montgomery to Savannah is ~500km, which
             * on a globe this size is a few pixels, so the two badges occupied
             * the same space.
             *
             * Splitting them by role fixes it without any collision maths: the
             * pair that can collide can no longer be on the same side of the
             * dot. The two PORTS never collide with each other — one is in the
             * United States and the other in Europe.
             */
            style={
              {
                positionAnchor: `--cobe-${label.id}`,
                ...(label.isPickup
                  ? { bottom: "anchor(top)", marginBottom: 6 }
                  : { top: "anchor(bottom)", marginTop: 6 }),
                left: "anchor(center)",
                translate: "-50% 0",
                opacity: `var(--cobe-visible-${label.id}, 0)`,
                transition: "opacity 0.4s",
              } as React.CSSProperties
            }
          >
            {label.text}
          </div>
        ))}

      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-full border border-char-200 bg-white/90 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP)}
          className="flex h-8 w-8 items-center justify-center text-base font-semibold text-char-700 transition-colors hover:bg-amber-50 hover:text-amber-600"
        >
          +
        </button>
        <div className="h-px bg-char-200" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(-ZOOM_STEP)}
          className="flex h-8 w-8 items-center justify-center text-base font-semibold text-char-700 transition-colors hover:bg-amber-50 hover:text-amber-600"
        >
          −
        </button>
      </div>
    </div>
  );
}
