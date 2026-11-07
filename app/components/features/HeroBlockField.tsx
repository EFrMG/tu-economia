import { useEffect, useRef } from "react";

interface Block {
  col: number;
  row: number;
  x: number;
  y: number;
  baseHeight: number;
  hoverHeight: number;
}

interface Point {
  x: number;
  y: number;
}

interface HitArea {
  blockIndex: number;
  faces: Point[][];
}

interface Wave {
  col: number;
  row: number;
  startedAt: number;
}

// Constants

const WAVE_RADIUS = 7;
const WAVE_TRAVEL_SECONDS = 0.105;
const WAVE_PULSE_SECONDS = 1.6;

const WAVE_LIFETIME_MS =
  (WAVE_RADIUS * WAVE_TRAVEL_SECONDS + WAVE_PULSE_SECONDS) * 1000;

const HOVER_LIFT = 24;
const HOVER_EASING = 15;

// While the primary button is held
const PRESSED_DROP = -15;
const PRESSED_EASING = 16;

// Helpers

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function containsPoint(polygon: Point[], x: number, y: number) {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const a = polygon[index];
    const b = polygon[previous];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }

  return inside;
}

// Signed saturation keeps overlapping ripples additive without a hard height cap, while still allowing negative (downward) travel
const saturate = (value: number, limit: number) => {
  const sign = value >= 0 ? 1 : -1;
  return limit * sign * (1 - Math.exp(-Math.abs(value) / limit));
};

// A single wave contribution
// The pulse starts negative so the ripple begins by pushing blocks downward, then swings upward, and finally settles to zero
const waveContribution = (wave: Wave, block: Block, now: number) => {
  const distance = Math.hypot(block.col - wave.col, block.row - wave.row);
  if (distance >= WAVE_RADIUS) return 0;

  const ageSeconds =
    (now - wave.startedAt) / 1000 - distance * WAVE_TRAVEL_SECONDS;

  if (ageSeconds <= 0 || ageSeconds >= WAVE_PULSE_SECONDS) return 0;

  const progress = ageSeconds / WAVE_PULSE_SECONDS;
  const oscillation = -Math.sin(2 * Math.PI * progress);
  const envelope = 1 - progress * 0.35;
  const edgeFade = clamp((WAVE_RADIUS - distance) / 2, 0, 1);

  return 23 * Math.exp(-distance * 0.22) * edgeFade * oscillation * envelope;
};

/** A fixed isometric view: the blocks are decorative, not a market chart. */
export const HeroBlockField = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !host || !context) return;

    const baseCanvas = document.createElement("canvas");
    const baseContext = baseCanvas.getContext("2d");
    if (!baseContext) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const colors = getComputedStyle(document.documentElement);
    const primary = colors.getPropertyValue("--color-primary-500").trim();
    const background = colors.getPropertyValue("--color-base-950").trim();

    let width = 0;
    let height = 0;
    let fieldHeight = 0;
    let columnStep: Point = { x: 0, y: 0 };
    let rowStep: Point = { x: 0, y: 0 };
    let blocks: Block[] = [];
    let baseHitAreas: (HitArea | null)[] = [];
    let waves: Wave[] = [];
    let hovered = -1;
    let pressedBlock = -1;
    let isPressed = false;
    let frame = 0;
    let lastFrame = 0;
    let inView = true;
    let pageVisible = document.visibilityState === "visible";

    // Drawing

    const polygon = (
      drawingContext: CanvasRenderingContext2D,
      points: Point[],
      fillOpacity: number,
      strokeOpacity: number,
    ) => {
      drawingContext.beginPath();
      drawingContext.moveTo(points[0].x, points[0].y);

      for (let index = 1; index < points.length; index++)
        drawingContext.lineTo(points[index].x, points[index].y);

      drawingContext.closePath();

      drawingContext.globalAlpha = fillOpacity;
      drawingContext.fillStyle = background;
      drawingContext.fill();

      drawingContext.globalAlpha = strokeOpacity;
      drawingContext.strokeStyle = primary;
      drawingContext.lineWidth = 1;
      drawingContext.stroke();
    };

    const drawBlock = (
      drawingContext: CanvasRenderingContext2D,
      index: number,
      elevation: number,
    ): HitArea | null => {
      const block = blocks[index];
      const energy = clamp((elevation - block.baseHeight) / 28, 0, 1);
      const fade = clamp((fieldHeight - block.y) / (fieldHeight * 0.16), 0, 1);
      if (fade <= 0) return null;

      const top = {
        x: block.x - (columnStep.x + rowStep.x) / 2,
        y: block.y - (columnStep.y + rowStep.y) / 2 - elevation,
      };

      const right = { x: top.x + columnStep.x, y: top.y + columnStep.y };
      const bottom = { x: right.x + rowStep.x, y: right.y + rowStep.y };
      const left = { x: top.x + rowStep.x, y: top.y + rowStep.y };
      const bottomGround = { x: bottom.x, y: bottom.y + elevation };
      const leftGround = { x: left.x, y: left.y + elevation };
      const rightGround = { x: right.x, y: right.y + elevation };
      const leftFace = [left, bottom, bottomGround, leftGround];
      const rightFace = [bottom, right, rightGround, bottomGround];
      const topFace = [top, right, bottom, left];

      polygon(drawingContext, leftFace, fade, fade * (0.16 + energy * 0.2));
      polygon(drawingContext, rightFace, fade, fade * (0.22 + energy * 0.25));
      polygon(drawingContext, topFace, fade, fade * (0.38 + energy * 0.3));

      return { blockIndex: index, faces: [topFace, leftFace, rightFace] };
    };

    const drawStaticBase = () => {
      baseContext.clearRect(0, 0, width, height);

      baseHitAreas = blocks.map((_, index) =>
        drawBlock(baseContext, index, blocks[index].baseHeight),
      );

      baseContext.globalAlpha = 1;
      drawActive();
    };

    const drawActive = () => {
      context.clearRect(0, 0, width, height);
      context.globalAlpha = 1;
      context.drawImage(baseCanvas, 0, 0, width, height);
    };

    const drawElevated = (now: number) => {
      // Depth order is preserved for the whole lifetime of waves and hover motion
      context.clearRect(0, 0, width, height);

      blocks.forEach((block, index) => {
        let waveHeight = 0;
        for (const wave of waves)
          waveHeight += waveContribution(wave, block, now);

        const combinedHeight = saturate(waveHeight, 48);

        drawBlock(
          context,
          index,
          block.baseHeight + block.hoverHeight + combinedHeight,
        );
      });

      context.globalAlpha = 1;
    };

    const drawCurrent = (now: number) => {
      waves = waves.filter((wave) => now - wave.startedAt < WAVE_LIFETIME_MS);

      const hasMotion =
        (!reducedMotion.matches && waves.length > 0) ||
        blocks.some((block) => Math.abs(block.hoverHeight) > 0.1);

      if (hasMotion) drawElevated(now);
      else drawActive();
    };

    // Animation loop

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);

      frame = 0;
      lastFrame = 0;
    };

    const tick = (now: number) => {
      frame = 0;

      if (!inView || !pageVisible || reducedMotion.matches) return;

      const elapsed = lastFrame
        ? Math.min((now - lastFrame) / 1000, 0.05)
        : 0.016;

      lastFrame = now;

      let moving = false;
      for (const [index, block] of blocks.entries()) {
        let target = 0;
        let rate = HOVER_EASING;

        if (isPressed && index === pressedBlock) {
          target = PRESSED_DROP;
          rate = PRESSED_EASING;
        } else if (!isPressed && index === hovered) {
          target = HOVER_LIFT;
        }

        block.hoverHeight +=
          (target - block.hoverHeight) * (1 - Math.exp(-elapsed * rate));

        if (Math.abs(target - block.hoverHeight) > 0.1) moving = true;
      }

      drawCurrent(now);

      if (moving || waves.length) frame = requestAnimationFrame(tick);
      else lastFrame = 0;
    };

    const animate = () => {
      if (!frame && inView && pageVisible && !reducedMotion.matches)
        frame = requestAnimationFrame(tick);
    };

    // Layout

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      if (!width || !height) return;

      fieldHeight = Math.min(height, window.innerHeight);

      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      baseCanvas.width = canvas.width;
      baseCanvas.height = canvas.height;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      baseContext.setTransform(ratio, 0, 0, ratio, 0, 0);

      const compact = width < 640;
      const medium = width < 1024;

      const halfWidth = compact ? 40 : medium ? 56 : 72;
      const halfDepth = compact ? 14 : medium ? 19 : 24;

      const rotation = Math.PI / 12;
      const sine = Math.sin(rotation);
      const cosine = Math.cos(rotation);

      columnStep = {
        x: halfWidth * cosine + halfDepth * sine,
        y: halfDepth * cosine - halfWidth * sine,
      };

      rowStep = {
        x: -halfWidth * cosine + halfDepth * sine,
        y: halfDepth * cosine + halfWidth * sine,
      };

      const centerX = width / 2;
      const centerY = fieldHeight / 2;
      const determinant = columnStep.x * rowStep.y - columnStep.y * rowStep.x;

      const corners = [
        { x: -halfWidth, y: -halfWidth },
        { x: width + halfWidth, y: -halfWidth },
        { x: -halfWidth, y: fieldHeight + halfWidth },
        { x: width + halfWidth, y: fieldHeight + halfWidth },
      ];

      const coordinates = corners.map(({ x, y }) => {
        const dx = x - centerX;
        const dy = y - centerY;
        return {
          col: (dx * rowStep.y - dy * rowStep.x) / determinant,
          row: (dy * columnStep.x - dx * columnStep.y) / determinant,
        };
      });

      const minCol =
        Math.floor(Math.min(...coordinates.map((point) => point.col))) - 1;

      const maxCol =
        Math.ceil(Math.max(...coordinates.map((point) => point.col))) + 1;

      const minRow =
        Math.floor(Math.min(...coordinates.map((point) => point.row))) - 1;

      const maxRow =
        Math.ceil(Math.max(...coordinates.map((point) => point.row))) + 1;

      blocks = [];

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          blocks.push({
            col,
            row,
            x: centerX + col * columnStep.x + row * rowStep.x,
            y: centerY + col * columnStep.y + row * rowStep.y,
            baseHeight: compact
              ? 10 + 2 * Math.sin(col * 0.8 + row * 0.6)
              : 13 + 3 * Math.sin(col * 0.8 + row * 0.6),
            hoverHeight: 0,
          });
        }
      }

      blocks = blocks.filter(
        (block) =>
          block.x > -80 &&
          block.x < width + 80 &&
          block.y > -80 &&
          block.y < fieldHeight + 80,
      );

      blocks.sort((a, b) => a.y - b.y);

      hovered = -1;
      pressedBlock = -1;
      isPressed = false;
      waves = [];
      stop();
      drawStaticBase();
    };

    // Interaction

    const pick = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // Hit-test against the resting (base) geometry so a block that is currently lifted or pressed keeps the same interactive footprint
      // Using the animated geometry here made the pointer "fall off" a dropping block and caused flicker and missed clicks
      for (let index = baseHitAreas.length - 1; index >= 0; index--) {
        const hit = baseHitAreas[index];
        if (hit?.faces.some((face) => containsPoint(face, x, y)))
          return hit.blockIndex;
      }

      return -1;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || reducedMotion.matches) return;

      const next = pick(event.clientX, event.clientY);
      // While pressed, keep the current target in the gaps between blocks so a dropping block does not flicker when the pointer briefly leaves it
      if (isPressed && next < 0) return;
      if (next === hovered) return;

      hovered = next;

      if (isPressed) pressedBlock = next;

      canvas.style.cursor = next < 0 ? "default" : "pointer";
      animate();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        event.pointerType === "touch" ||
        reducedMotion.matches
      )
        return;

      const index = pick(event.clientX, event.clientY);
      if (index < 0) return;

      hovered = index;
      pressedBlock = index;
      isPressed = true;
      canvas.style.cursor = "pointer";

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional; ignore failures.
      }

      animate();
    };

    const releasePress = () => {
      if (!isPressed) return;

      isPressed = false;
      pressedBlock = -1;
      animate();
    };

    const onPointerUp = (event: PointerEvent) => {
      // Fire the ripple on release
      // Relying on the separate `click` event was unreliable once pointer capture and the pressed (dropped) geometry were involved, so the wave is created here from the resting hit areas
      if (!reducedMotion.matches && event.button === 0) {
        const index = pick(event.clientX, event.clientY);
        if (index >= 0) {
          const block = blocks[index];
          const now = performance.now();
          hovered = index;

          waves = [
            ...waves.filter((wave) => now - wave.startedAt < WAVE_LIFETIME_MS),
            { col: block.col, row: block.row, startedAt: now },
          ];
        }
      }

      releasePress();

      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
    };

    const onPointerCancel = () => {
      releasePress();
    };

    const onPointerLeave = () => {
      hovered = -1;
      releasePress();
      canvas.style.cursor = "default";
      animate();
    };

    const onVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";

      if (pageVisible) {
        drawCurrent(performance.now());
        animate();
      } else {
        stop();
      }
    };

    const onMotionChange = () => {
      waves = [];
      hovered = -1;
      pressedBlock = -1;
      isPressed = false;

      for (const block of blocks) block.hoverHeight = 0;

      stop();
      drawActive();
    };

    // Wiring

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;

      if (inView) {
        drawCurrent(performance.now());
        animate();
      } else {
        stop();
      }
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    observer.observe(host);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.addEventListener("change", onMotionChange);

    resize();

    return () => {
      stop();

      resizeObserver.disconnect();
      observer.disconnect();

      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="marketing-hero-canvas absolute inset-0 h-full w-full touch-pan-y"
    />
  );
};
