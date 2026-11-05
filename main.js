// Smooth, slightly slower scrolling
let lenis = null;
// Sections can claim a wheel/swipe before Lenis scrolls the page: return false to swallow it
let scrollGuard = null;
// True while the top slider is carrying the page to a section (sections skip their own snapping)
let navJumping = false;
if (window.Lenis && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  lenis = new Lenis({
    lerp: 0.07,
    wheelMultiplier: 0.7,
    touchMultiplier: 0.8,
    virtualScroll: (data) => (scrollGuard ? scrollGuard(data) : true),
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}

// ---------- Design concept: images appear one by one along the arc ----------
(() => {
  const section = document.querySelector(".concept");
  const group = section?.querySelector(".concept__images");
  if (!group) return;

  // Arc of the field line in design-concept-field.jpg (1920 × 1080 frame)
  const ARC = { cx: 2056.4, cy: 1637.2, r: 1370.3, from: 200, to: 268 }; // degrees
  const LINE = 48; // thickness of that field line

  // The 26 brand photos (레퍼런스무드_재생성_v2/완성본, white frames cropped off), placed along the arc
  // in the order 1, 14, 2, 15, … so look-alike neighbours in the folder don't sit side by side
  const IMAGES = Array.from({ length: 26 }, (_, i) => {
    const n = (i % 2 ? 14 : 1) + Math.floor(i / 2);
    return [`motif-${String(n).padStart(2, "0")}.jpg`];
  });

  // Mask boxes (panel units). Width runs along the arc, height across it —
  // the next step keeps the width and shrinks the height so each box reads as a line.
  const BOXES = [
    [300, 250], [375, 375], [250, 215], [425, 325], [315, 315], [265, 225], [400, 300],
    [300, 300], [365, 265], [240, 240], [415, 350], [275, 225], [350, 350],
  ];
  const OFFSETS = [-18, 22, -8, 12, -25, 15, -10, 28, -20, 8, -12, 20, -5];

  const SVG_NS = "http://www.w3.org/2000/svg";
  const n = IMAGES.length;

  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  // Place a box on the arc, `offset` units off the line, rotated so its width follows the tangent
  const placeOnArc = (deg, offset) => {
    const a = (deg * Math.PI) / 180;
    const r = ARC.r + offset;
    const x = ARC.cx + r * Math.cos(a);
    const y = ARC.cy + r * Math.sin(a);
    return `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(deg + 90).toFixed(1)})`;
  };

  const boxes = [];

  const items = IMAGES.map(([file], i) => {
    const deg = ARC.from + ((ARC.to - ARC.from) * (i + 0.5)) / n;
    const offset = OFFSETS[i % OFFSETS.length];
    const [bw, bh] = BOXES[i % BOXES.length];

    const g = svgEl("g", { class: "concept__item", transform: placeOnArc(deg, offset) });

    const clipId = `concept-mask-${i}`;
    const clip = svgEl("clipPath", { id: clipId });
    const box = svgEl("rect", { class: "concept__mask", x: -bw / 2, y: -bh / 2, width: bw, height: bh });
    clip.appendChild(box);

    // the photo fills the full box and stays put; only the mask will change
    const img = svgEl("image", {
      href: `assets/images/${encodeURIComponent(file)}`,
      x: -bw / 2,
      y: -bh / 2,
      width: bw,
      height: bh,
      preserveAspectRatio: "xMidYMid slice",
      "clip-path": `url(#${clipId})`,
    });

    g.append(clip, img);
    group.appendChild(g);
    boxes.push({ g, mask: box, deg, offset, bh });
    return g;
  });

  const tween = (ms, onFrame) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      (function frame(now) {
        const t = Math.min((now - t0) / ms, 1);
        onFrame(ease(t));
        t < 1 ? requestAnimationFrame(frame) : resolve();
      })(t0);
    });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Keep each mask's width, squeeze its height down to the field line's thickness,
  // and settle it onto the line so it meets the photo's line exactly
  function squeezeToLine(ms) {
    return tween(ms, (k) => {
      for (const b of boxes) {
        const h = b.bh + (LINE - b.bh) * k;
        b.mask.setAttribute("y", (-h / 2).toFixed(2));
        b.mask.setAttribute("height", h.toFixed(2));
        b.g.setAttribute("transform", placeOnArc(b.deg, b.offset * (1 - k)));
      }
    });
  }

  // Snap the section into place, hold the page, then cut the images in at random
  const STEP_MS = 260; // average gap between images (was 420 with 13 photos)
  const JITTER_MS = 90; // +/- variation so the rhythm isn't mechanical
  const SNAP_ZONE = 0.8; // snap as soon as the section's top is within 80% of a screen

  let played = false;

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function playSequence() {
    // 1. images cut in at random, the newest on top
    for (const item of shuffle(items)) {
      group.appendChild(item);
      item.classList.add("is-visible");
      await wait(STEP_MS + (Math.random() * 2 - 1) * JITTER_MS);
    }
    // 2. once all are in, the boxes squeeze into the line
    await wait(600);
    await squeezeToLine(1400);
    // 3. the field photo replaces the black background and the masked images
    await wait(250);
    section.classList.add("is-field");
    await wait(1200);
  }

  // ---------- Stage 2: one more scroll → flat graphic → white → core values ----------
  const arc = section.querySelector(".concept__arc");
  const ARC_SPAN = [180, 290]; // degrees; runs past both screen edges
  const EXPAND = 2800; // stroke width that covers the whole 1920 × 1080 frame

  {
    const pt = (deg) => {
      const a = (deg * Math.PI) / 180;
      return `${(ARC.cx + ARC.r * Math.cos(a)).toFixed(1)} ${(ARC.cy + ARC.r * Math.sin(a)).toFixed(1)}`;
    };
    arc.setAttribute("d", `M ${pt(ARC_SPAN[0])} A ${ARC.r} ${ARC.r} 0 0 1 ${pt(ARC_SPAN[1])}`);
    arc.setAttribute("stroke-width", LINE);
  }

  async function playCore() {
    // the photo turns into the flat graphic, the text steps aside
    section.classList.add("is-graphic");
    await wait(1300);
    // the white line widens until the screen is white
    await tween(1600, (k) => arc.setAttribute("stroke-width", (LINE + (EXPAND - LINE) * k).toFixed(1)));
    // OFF THE is there from the start; the colour columns rise one after another
    section.classList.add("is-core");
    await wait(1500);
    // then their labels appear
    section.classList.add("is-core-text");
    await wait(600);
  }

  let stage = "idle"; // idle → images → field → core → done

  const holdPage = () => lenis?.stop();
  const releasePage = () => lenis?.start();

  async function runImages() {
    stage = "images";
    try {
      await playSequence();
    } finally {
      stage = "field";
      releasePage();
    }
  }

  // Pull the section back flush with the top of the screen (if it drifted) before playing
  const settleOnSection = () =>
    new Promise((resolve) => {
      if (!lenis || Math.abs(section.getBoundingClientRect().top) <= 1) return resolve();
      lenis.scrollTo(section, { duration: 0.5, force: true, onComplete: () => resolve() });
    });

  async function runCore() {
    stage = "core";
    holdPage();
    try {
      await settleOnSection();
      await playCore();
    } finally {
      stage = "done";
      releasePage();
    }
  }

  // At the field-photo stage, the next downward scroll plays stage 2 instead of moving the page —
  // even if the visitor scrolled up a little and comes back down. Scrolling up still works.
  const claimsNext = () => {
    if (stage !== "field") return false;
    const top = section.getBoundingClientRect().top;
    return top < window.innerHeight * 0.8 && top > -window.innerHeight;
  };

  scrollGuard = ({ deltaY, event }) => {
    if (deltaY > 0 && claimsNext()) {
      if (event.cancelable) event.preventDefault();
      runCore();
      return false;
    }
    return true;
  };

  window.addEventListener("keydown", (e) => {
    if (["ArrowDown", "PageDown", " ", "Spacebar"].includes(e.key) && claimsNext()) {
      e.preventDefault();
      runCore();
    }
  });

  // Arriving from the top slider: play whatever stages haven't run yet
  section.addEventListener("concept:enter", async (e) => {
    if (stage === "images" || stage === "core") return;
    played = true;
    if (stage === "idle") {
      holdPage();
      await runImages();
    }
    if (e.detail?.stage === "core" && stage === "field") runCore();
  });

  // Back to the start for the next visitor (the idle timer sends this once the page is at the top).
  // Only with Lenis: without it the sequence is started by a one-shot observer that can't re-arm.
  document.addEventListener("page:reset", () => {
    if (!lenis || stage === "images" || stage === "core") return;
    stage = "idle";
    played = false;
    section.classList.remove("is-field", "is-graphic", "is-core", "is-core-text");
    items.forEach((item) => item.classList.remove("is-visible"));
    for (const b of boxes) {
      b.mask.setAttribute("y", -b.bh / 2);
      b.mask.setAttribute("height", b.bh);
      b.g.setAttribute("transform", placeOnArc(b.deg, b.offset));
    }
    arc.setAttribute("stroke-width", LINE);
  });

  if (!lenis) {
    // Without Lenis, catch the native wheel/swipe ourselves
    window.addEventListener("wheel", (e) => {
      if (e.deltaY > 0 && claimsNext()) {
        e.preventDefault();
        runCore();
      }
    }, { passive: false });
    let touchY = null;
    window.addEventListener("touchstart", (e) => (touchY = e.touches[0].clientY), { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (touchY !== null && touchY - e.touches[0].clientY > 10 && claimsNext()) {
        e.preventDefault();
        touchY = null;
        runCore();
      }
    }, { passive: false });
  }

  if (!lenis) {
    // No smooth scroll (or reduced motion): play when the section is mostly in view
    new IntersectionObserver((entries, io) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        runImages();
      }
    }, { threshold: 0.6 }).observe(section);
    return;
  }

  lenis.on("scroll", ({ direction }) => {
    if (played || navJumping) return;
    const top = section.getBoundingClientRect().top;
    const vh = window.innerHeight;
    // coming down: the top edge rises into the lower 80% · coming back up: the section drops in from above
    const fromAbove = direction === 1 && top <= vh * SNAP_ZONE && top >= -vh * 0.5;
    const fromBelow = direction === -1 && top < 0 && top >= -vh * SNAP_ZONE;
    if (!fromAbove && !fromBelow) return;

    played = true;
    // Kill the wheel momentum first. Otherwise, when that momentum is already heading for the
    // page end, Lenis sees the snap target as "already reached", skips the animation and the
    // page freezes with the section half on screen.
    lenis.stop();
    lenis.scrollTo(section, {
      duration: 0.65,
      easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)), // fast pull, soft landing
      force: true,
      onComplete: async () => {
        // make sure we really landed on the section before holding the page there
        if (Math.abs(section.getBoundingClientRect().top) > 1) {
          window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top);
        }
        await wait(250);
        runImages();
      },
    });
  });
})();

// ---------- Layout grid overlay: press "1" to show / hide ----------
(() => {
  const overlay = document.querySelector(".grid-overlay");
  if (!overlay) return;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "1" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.("input, textarea, [contenteditable]")) return;
    overlay.classList.toggle("is-on");
  });
})();

// ---------- Top slider: section names on a line that fills as you scroll ----------
(() => {
  const nav = document.querySelector(".slider");
  if (!nav) return;
  const concept = document.querySelector(".concept");
  const items = [...nav.querySelectorAll(".slider__item")];
  const fill = nav.querySelector(".slider__fill");
  const MIN_STEP = 0.1; // names stay at least this share of the line apart
  const GAP = 24; // and never closer than this many px (of the 1728-wide layout, see --px) after the previous name

  const topOf = (el) => el.getBoundingClientRect().top + window.scrollY;
  // where each name sends you (in page pixels)
  const targetOf = (item) => {
    const el = document.querySelector(item.dataset.target);
    return el ? Math.max(0, topOf(el)) : 0;
  };

  // The line stands for the page from the first section to the end: each name sits where its
  // section starts, so long stretches (Brand Identity) get long runs. Short sections are pushed apart a little,
  // and the fill runs from name to name as the page moves between their sections.
  let stops = [];
  let lefts = [];
  let end = 1;
  let width = 1;
  function layout() {
    stops = items.map(targetOf);
    end = Math.max(document.documentElement.scrollHeight - window.innerHeight, stops[0] + 1);
    width = nav.clientWidth;
    let minLeft = 0;
    lefts = items.map((item, k) => {
      const w = item.offsetWidth;
      const at = ((stops[k] - stops[0]) / (end - stops[0])) * width;
      const left = Math.min(Math.max(at, minLeft), width - w);
      item.parentElement.style.left = `${left}px`;
      minLeft = left + Math.max(MIN_STEP * width, w + GAP * Math.max(1, window.innerWidth / 1728));
      return left;
    });
    update();
  }

  function update() {
    const y = window.scrollY + 1;
    let x = 0;
    for (let k = 0; k < stops.length; k++) {
      if (y < stops[k]) break;
      const nextStop = k + 1 < stops.length ? stops[k + 1] : end;
      const nextLeft = k + 1 < stops.length ? lefts[k + 1] : width;
      const frac = nextStop > stops[k] ? Math.min((y - stops[k]) / (nextStop - stops[k]), 1) : 1;
      x = lefts[k] + frac * (nextLeft - lefts[k]);
    }
    fill.style.transform = `scaleX(${x / width})`;
    items.forEach((item, k) => item.classList.toggle("is-passed", y >= stops[k]));
  }

  items.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = targetOf(item);
      const toConcept = item.dataset.target === ".concept";
      const done = () => {
        if (toConcept) concept.dispatchEvent(new CustomEvent("concept:enter", { detail: { stage: "motif" } }));
      };
      if (lenis) {
        navJumping = true;
        lenis.scrollTo(target, {
          duration: 1.2,
          onComplete: () => {
            navJumping = false;
            done();
          },
        });
      } else {
        window.scrollTo({ top: target, behavior: "smooth" });
        setTimeout(done, 900);
      }
    });
  });

  window.addEventListener("scroll", update, { passive: true });
  // section heights settle as images and fonts load
  new ResizeObserver(layout).observe(document.body);
  window.addEventListener("resize", layout);
  document.fonts?.ready.then(layout);
  layout();
})();

// ---------- Color system: the chips fade in on arrival, then their names and values ----------
(() => {
  const section = document.querySelector(".colors");
  const chart = section?.querySelector(".colors__chart");
  if (!chart) return;
  [...chart.children].forEach((chip, i) => chip.style.setProperty("--i", i));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    section.classList.add("is-in");
    return;
  }
  let io;
  const arm = () => {
    io?.disconnect();
    // once half the chart is on screen; plays once per visit
    io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      section.classList.add("is-in");
    }, { threshold: 0.5 });
    io.observe(chart);
  };
  arm();
  // the idle reset hides them again so the next visitor sees it play
  document.addEventListener("page:reset", () => {
    section.classList.remove("is-in");
    arm();
  });
})();

// ---------- Ending: fade to white → logo → designer's note, its text typed like on a Korean keyboard ----------
// When the section paging is about to move on from the end of the medal, the ending takes that step
// instead: a white veil fades over the medal, the page jumps under it, then the screen plays.
(() => {
  const section = document.querySelector(".ending");
  const veil = document.querySelector(".ending-veil");
  if (!section || !veil) return;
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Wrap every character of the typed lines in a span that keeps its place (see .ending .t)
  const blocks = [...section.querySelectorAll("[data-type]")].map((el) => {
    const steps = [];
    for (const node of [...el.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE) {
        steps.push({ br: true });
        continue;
      }
      const frag = document.createDocumentFragment();
      for (const ch of node.data) {
        const span = document.createElement("span");
        span.className = "t";
        span.textContent = ch;
        span.dataset.t = "";
        frag.appendChild(span);
        steps.push({ span, ch });
      }
      node.replaceWith(frag);
    }
    return steps;
  });
  const spans = blocks.flat().filter((s) => s.span).map((s) => s.span);

  // 다 → ㄷ, 다 · 문 → ㅁ, 무, 문: the keystrokes a Korean keyboard shows for one syllable
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const keystrokes = (ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) return [ch];
    const cho = Math.floor(c / 588);
    const open = String.fromCharCode(0xac00 + c - (c % 28));
    return c % 28 ? [CHO[cho], open, ch] : [CHO[cho], ch];
  };
  // extra breath after some characters, so the rhythm follows the sentence
  const PAUSE = { " ": 25, ",": 170, ".": 340 };

  let run = 0; // bumped by a reset; a sequence still running from before stops itself
  let stage = "idle"; // idle → playing → done
  let caret = null;
  const moveCaret = (span) => {
    caret?.classList.remove("is-caret", "is-blink");
    caret = span;
    caret?.classList.add("is-caret");
  };

  async function type(steps, token, keyMs) {
    for (const step of steps) {
      if (step.br) {
        await wait(210);
        continue;
      }
      moveCaret(step.span);
      for (const k of keystrokes(step.ch)) {
        step.span.dataset.t = k;
        await wait(keyMs + Math.random() * keyMs * 0.7);
        if (token !== run) return false;
      }
      if (PAUSE[step.ch]) await wait(PAUSE[step.ch]);
    }
    return true;
  }

  const holdPage = () => lenis?.stop();
  const releasePage = () => lenis?.start();

  async function play(fromMedal) {
    const token = ++run;
    stage = "playing";
    holdPage();
    try {
      if (fromMedal) {
        veil.classList.add("is-on"); // the medal fades to white
        await wait(1300);
        if (lenis) lenis.scrollTo(section, { immediate: true, force: true });
        else window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY);
        root.classList.add("is-ending");
        veil.classList.remove("is-on"); // white on white: the veil leaves unseen
        await wait(350);
      }
      if (token !== run) return;
      section.classList.add("is-logo");
      await wait(1200 + 1500); // fade in, hold
      section.classList.remove("is-logo");
      await wait(1100);
    } finally {
      releasePage();
    }
    if (token !== run) return;
    section.classList.add("is-note");
    await wait(900);
    for (let i = 0; i < blocks.length; i++) {
      const isSign = i === blocks.length - 1;
      if (i) await wait(isSign ? 700 : 480); // a paragraph break; a longer breath before the name
      if (!(await type(blocks[i], token, isSign ? 46 : 26))) return;
    }
    caret?.classList.add("is-blink");
    await wait(2600);
    if (token === run) moveCaret(null);
    stage = "done";
  }

  function showAll() {
    run++;
    spans.forEach((span) => (span.dataset.t = span.textContent));
    section.classList.add("is-note");
    stage = "done";
  }

  // The paging's next step down from the medal would land here: play the ending instead (first time)
  document.addEventListener("paging:advance", (e) => {
    const top = section.getBoundingClientRect().top + window.scrollY;
    if (stage !== "idle" || reduce || e.detail.dir < 0 || Math.abs(e.detail.target - top) > 2) return;
    e.preventDefault();
    play(true);
  });

  // Arriving some other way (top slider, scrollbar, touch): start from the logo; the slider hides here
  new IntersectionObserver(([entry]) => {
    const inView = entry.isIntersecting && entry.intersectionRatio >= 0.9;
    root.classList.toggle("is-ending", inView);
    if (inView && stage === "idle") reduce ? showAll() : play(false);
  }, { threshold: [0, 0.9] }).observe(section);

  // back to the start for the next visitor (the idle timer)
  document.addEventListener("page:reset", () => {
    run++;
    stage = "idle";
    section.classList.remove("is-logo", "is-note");
    veil.classList.remove("is-on");
    root.classList.remove("is-ending");
    spans.forEach((span) => (span.dataset.t = ""));
    moveCaret(null);
  });
})();

// ---------- Logo grid: each screen draws its grid when it arrives ----------
(() => {
  const screens = document.querySelectorAll(".logogrid[data-draw]");
  if (!screens.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    screens.forEach((s) => s.classList.add("is-drawn"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-drawn");
      io.unobserve(e.target);
    }
  }, { threshold: 0.5 });
  screens.forEach((s) => io.observe(s));
  // the idle reset rubs them out again for the next visitor
  document.addEventListener("page:reset", () => {
    screens.forEach((s) => {
      s.classList.remove("is-drawn");
      io.observe(s);
    });
  });
})();

// ---------- Section paging: one wheel gesture or key press moves to the next section ----------
// Sections up to a little taller than the screen are pages: one gesture glides to the next one.
// Taller sections (long reads) scroll freely, with no snapping, between their top and the point where
// their bottom meets the bottom of the screen; at either end a new gesture moves on to the neighbour.
// The whole Application part (Signage → Winner Medal) is one free stretch, so no layout gets cut.
// Touch keeps native scrolling. The Graphic Motif section's own snapping and stages still take precedence.
(() => {
  if (!lenis) return;
  const sections = [...document.querySelectorAll("body > section")];
  // first and last section of the free Application stretch
  const FREE_FROM = document.querySelector(".wayfinding");
  const FREE_TO = document.querySelector(".medal");
  const MIN_EXTRA = 0.25; // a section taller than the screen by more than this share scrolls freely
  const KEY_STEP = 0.85; // inside such a section, arrow / page keys move this share of a screen
  const GESTURE_GAP = 180; // ms without wheel events that ends a gesture (trackpad momentum included)
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // stops: where a page glide can land · zones: the free-scroll range of each tall section
  let map = null;
  const invalidate = () => (map = null);
  new ResizeObserver(invalidate).observe(document.body); // heights settle as images load
  window.addEventListener("resize", invalidate);

  function layout() {
    if (map) return map;
    const vh = window.innerHeight;
    const limit = lenis.limit;
    const stops = [0, limit];
    const zones = [];
    const pageY = (el) => el.getBoundingClientRect().top + window.scrollY;
    const freeFrom = FREE_FROM && FREE_TO ? pageY(FREE_FROM) : Infinity;
    const freeTo = FREE_FROM && FREE_TO ? pageY(FREE_TO) + FREE_TO.offsetHeight : -Infinity;
    if (freeTo > freeFrom) {
      const top = Math.min(Math.round(freeFrom), limit);
      const end = Math.min(Math.round(freeTo - vh), limit);
      zones.push({ top, end });
      stops.push(top, end);
    }
    for (const s of sections) {
      if (getComputedStyle(s).position === "sticky") continue; // the hero: always at 0
      const top = Math.min(Math.round(pageY(s)), limit);
      if (top >= freeFrom - 1 && top < freeTo - 1) continue; // inside the Application stretch
      const extra = s.offsetHeight - vh;
      if (extra > vh * MIN_EXTRA) {
        const end = Math.min(Math.round(top + extra), limit);
        zones.push({ top, end });
        stops.push(top, end);
      } else {
        stops.push(top);
      }
    }
    stops.sort((a, b) => a - b);
    map = { zones, stops: stops.filter((y, i) => i === 0 || y - stops[i - 1] > 24) };
    return map;
  }

  // the long section the page is in, if it can still move that way inside it
  const freeZone = (y, dir) =>
    layout().zones.find((z) => (dir > 0 ? y >= z.top - 1 && y < z.end - 1 : y > z.top + 1 && y <= z.end + 1));

  let busy = false;
  function glide(target) {
    const y = lenis.targetScroll;
    if (Math.abs(target - y) < 2) return;
    const duration = Math.min(1.1, 0.6 + (0.5 * Math.abs(target - y)) / window.innerHeight);
    busy = true;
    // another scroll (the Graphic Motif snap) can take over and drop our onComplete
    const timer = setTimeout(() => (busy = false), duration * 1000 + 150);
    lenis.scrollTo(target, {
      duration,
      easing: ease,
      onComplete: () => {
        clearTimeout(timer);
        busy = false;
      },
    });
  }

  // next / previous stop from where the page is heading. Others can take over the step (the ending
  // does, coming from the medal) by cancelling "paging:advance".
  function page(dir) {
    const y = lenis.targetScroll;
    const { stops } = layout();
    const target = dir > 0 ? stops.find((s) => s > y + 4) : stops.findLast((s) => s < y - 4);
    if (target === undefined) return;
    const step = new CustomEvent("paging:advance", { cancelable: true, detail: { dir, target } });
    if (document.dispatchEvent(step)) glide(target);
  }

  // A trackpad swipe sends a stream of wheel events that fades out; a new gesture starts after a pause,
  // or when the deltas suddenly grow again (a new swipe during the fade).
  let lastTime = 0;
  let lastAbs = 0;
  const isGestureStart = (deltaY) => {
    const now = performance.now();
    const abs = Math.abs(deltaY);
    const start = now - lastTime > GESTURE_GAP || abs > lastAbs * 1.5 + 4;
    lastTime = now;
    lastAbs = abs;
    return start;
  };

  let consumed = false; // this gesture already moved a page: the rest of it (momentum) is ignored
  const sectionGuard = scrollGuard;
  scrollGuard = (data) => {
    const { deltaX, deltaY, event } = data;
    if (!event.type.includes("wheel") || event.ctrlKey || Math.abs(deltaX) > Math.abs(deltaY)) {
      return sectionGuard ? sectionGuard(data) : true;
    }
    const start = isGestureStart(deltaY);
    if (start) consumed = false;
    if (sectionGuard && sectionGuard(data) === false) return false;
    if (event.cancelable) event.preventDefault();
    if (busy || navJumping || lenis.isStopped || !deltaY) return false;

    const dir = Math.sign(deltaY);
    const y = lenis.targetScroll;
    const zone = freeZone(y, dir);
    if (zone) {
      // inside a long section: ordinary smooth scrolling, held at its two ends
      if (!consumed) lenis.scrollTo(Math.min(Math.max(y + deltaY, zone.top), zone.end), { programmatic: false });
      return false;
    }
    if (start) {
      consumed = true;
      page(dir);
    }
    return false;
  };

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.("input, textarea, select, button, [contenteditable]")) return;
    const dir = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1, " ": e.shiftKey ? -1 : 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    if (busy || navJumping || lenis.isStopped) return;
    const y = lenis.targetScroll;
    const zone = freeZone(y, dir);
    if (zone) glide(Math.min(Math.max(y + window.innerHeight * KEY_STEP * dir, zone.top), zone.end));
    else page(dir);
  });
})();

// ---------- Idle: after a while without input, glide back to the top and reset for the next visitor ----------
(() => {
  const IDLE_MS = 60000;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reset = () => document.dispatchEvent(new CustomEvent("page:reset"));

  function goHome() {
    const y = window.scrollY;
    if (y < 2) return reset();
    if (!lenis) {
      window.scrollTo(0, 0);
      return reset();
    }
    // navJumping keeps the Graphic Motif snap and the paging out of the way on the way up
    navJumping = true;
    lenis.scrollTo(0, {
      duration: Math.min(3, 1.2 + y / 15000),
      easing: ease,
      force: true,
      onComplete: () => {
        navJumping = false;
        reset();
      },
    });
  }

  let timer;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(goHome, IDLE_MS);
  };
  for (const type of ["wheel", "keydown", "pointerdown", "pointermove", "touchstart"]) {
    window.addEventListener(type, arm, { passive: true });
  }
  arm();
})();

// ---------- Naming: the logo motion only plays while it is on screen ----------
(() => {
  const video = document.querySelector(".naming__logo");
  if (!video) return;
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) video.play().catch(() => {});
    else video.pause();
  }).observe(video);
})();

// ---------- Typography specimen: the big letter keeps changing ----------
(() => {
  const glyph = document.querySelector(".typeface__glyph");
  if (!glyph) return;
  // same order as the character set above it (A–Z, 0–9), starting from the O
  const chars = [...document.querySelectorAll(".typeface__chart span")].map((s) => s.textContent);
  if (!chars.length) return;
  const STEP_MS = 900;
  let i = Math.max(chars.indexOf(glyph.textContent), 0);
  setInterval(() => {
    i = (i + 1) % chars.length;
    glyph.textContent = chars[i];
  }, STEP_MS);
})();

// ---------- Type tester: weight slider ----------
(() => {
  const tester = document.querySelector(".tester");
  if (!tester) return;
  const range = tester.querySelector(".tester__range");
  const value = tester.querySelector(".tester__value");
  const text = tester.querySelector(".tester__text");

  const apply = () => {
    tester.style.setProperty("--wght", range.value);
    value.textContent = range.value;
  };
  range.addEventListener("input", apply);
  apply();

  // the idle reset puts back the sample text and weight
  const initial = { text: text.innerHTML, weight: range.value };
  document.addEventListener("page:reset", () => {
    text.innerHTML = initial.text;
    range.value = initial.weight;
    apply();
  });

  // keep pasted text plain so it stays in the typeface
  text.addEventListener("paste", (e) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
})();

// ---------- Pictograms: the big figure's guide lines draw in when the section arrives ----------
(() => {
  const section = document.querySelector(".picto");
  const hero = section?.querySelector(".picto__hero");
  if (!hero) return;
  // once the framed figure is mostly on screen; plays once
  new IntersectionObserver((entries, io) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    section.classList.add("is-drawn");
  }, { threshold: 0.6 }).observe(hero);
})();

// ---------- Pictograms: each tile's rule draws and its icon turns from black to colour on arrival ----------
(() => {
  const items = document.querySelectorAll(".picto__item");
  if (!items.length) return;
  // column 0–3 staggers the tiles of a row
  items.forEach((item, i) => item.style.setProperty("--c", i % 4));
  // once a tile is a third on screen; plays once per tile
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      entry.target.classList.add("is-in");
    });
  }, { threshold: 0.35 });
  items.forEach((item) => io.observe(item));
})();

// ---------- Signage: the sign stays, the place around it keeps changing ----------
(() => {
  const scenes = [...document.querySelectorAll(".wayfinding__scene")];
  if (scenes.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = scenes[0].parentElement;
  const STEP_MS = 900; // same beat as the Typography letter
  let i = 0;
  let timer = 0;
  let ready = false;
  let onScreen = false;

  const step = () => {
    scenes[i].classList.remove("is-current");
    i = (i + 1) % scenes.length;
    scenes[i].classList.add("is-current");
  };
  // cut only while the photos are on screen
  const sync = () => {
    const run = ready && onScreen;
    if (run && !timer) timer = setInterval(step, STEP_MS);
    if (!run && timer) {
      clearInterval(timer);
      timer = 0;
    }
  };

  // a screen ahead, load all eight, so no cut lands on an empty frame
  new IntersectionObserver((entries, io) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    scenes.forEach((img) => (img.loading = "eager"));
    Promise.all(scenes.map((img) => img.decode().catch(() => {}))).then(() => {
      ready = true;
      sync();
    });
  }, { rootMargin: "100% 0px" }).observe(box);

  new IntersectionObserver((entries) => {
    onScreen = entries[0].isIntersecting;
    sync();
  }).observe(box);
})();

// ---------- Wall signage: the diagram's guide lines draw in when it arrives ----------
(() => {
  const section = document.querySelector(".wall-sign");
  const spec = section?.querySelector(".wall-sign__spec");
  if (!spec) return;
  // once the diagram is mostly on screen; plays once
  new IntersectionObserver((entries, io) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    section.classList.add("is-drawn");
  }, { threshold: 0.6 }).observe(spec);
})();

// ---------- Floor wayfinding: a line's colour slides in, then its pictogram, word and arrows appear.
// The set keeps changing: one line → two → directions → destinations → ... ----------
(() => {
  const svg = document.querySelector(".floor__lines");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";
  const W = 1920;
  // one line at full size pointing right, measured from the mock at 1920 (y from the band's top)
  const M = {
    band: 240,
    stripes: [15, 217], // the two thin lines, 8 tall
    icon: 431.4, // pictogram box (240) left; the ball's circle starts 31 in
    word: 728.7, // word ink left
    font: 185,
    base: 181.6,
    track: 4.5, // the mock sets the word a little looser than the font's kerning
    chev: [1366.6, 1471.9, 1567.4], // each arrow's left edge on the band's top edge
    chevW: 46.4, // arrow stroke, measured across
    chevD: 12.3, // the two arms' tips sit this far above / below the centre line
    minGap: 120, // word → arrows, when a long word pushes the block toward the tail
    centre: 1076, // the two-line size scales around here (mirrored for a left-pointing line)
    fade: 600, // past each side the band fades out over this, so its square end never shows while it slides
  };
  const SMALL = 164 / 240; // two lines: 164 tall, 25 apart (second mock), centred where the one line was
  const SLOTS = [[{ y: 56.5, k: 1 }], [{ y: 0, k: SMALL }, { y: 189, k: SMALL }]];
  // colour = pictogram category: 1 participants magenta, 2 spectators & amenities blue, 3 safety green
  const PLACES = {
    field: ["FIELD", "floor-field", "magenta"],
    changing: ["CHANGING ROOM", "floor-changing", "magenta"],
    water: ["WATER", "floor-water", "blue"],
    restroom: ["RESTROOM", "floor-restroom", "blue"],
    medical: ["MEDICAL", "floor-medical", "green"],
  };
  // [place, 1 = right / -1 = left]; each step changes one thing
  const SETS = [
    [["field", 1]],
    [["field", 1], ["water", -1]],
    [["field", -1], ["water", 1]],
    [["changing", -1], ["restroom", 1]],
    [["medical", 1]],
  ];
  const HOLD_MS = 2800;
  const FADE_MS = 350;
  const SWEEP_MS = 1600; // one set pushes the other out, left to right
  const ENTER_MS = 1400; // the very first line, onto an empty stage
  const EASE_SWEEP = "cubic-bezier(0.65, 0, 0.35, 1)";
  const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const el = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.appendChild(node);
    return node;
  };

  // word ink at full size; canvas shapes the text the same way as the SVG text
  const fontReady = document.fonts.load(`400 ${M.font}px "OffTheLeague Flex"`).catch(() => {});
  const ctx = document.createElement("canvas").getContext("2d");
  const inkOf = (word) => {
    ctx.font = `400 ${M.font}px "OffTheLeague Flex"`;
    const m = ctx.measureText(word);
    const left = -m.actualBoundingBoxLeft;
    return { left, width: m.actualBoundingBoxRight + M.track * (word.length - 1) - left };
  };

  // soft ends: the band runs M.fade past each side of the screen and fades out there (smoothstep).
  // One mask for every band; it moves with the band it is on.
  const SPAN = W + 2 * M.fade;
  const SLIDE = W + M.fade; // far enough that the faded end is off screen too
  const defs = svg.querySelector("defs");
  const ramp = el("linearGradient", { id: "floor-ends-ramp", gradientUnits: "userSpaceOnUse", x1: -M.fade, x2: W + M.fade, y1: 0, y2: 0 }, defs);
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => [(t * M.fade) / SPAN, t * t * (3 - 2 * t)]);
  [...stops, ...stops.map(([at, a]) => [1 - at, a]).reverse()].forEach(([at, a]) =>
    el("stop", { offset: at.toFixed(4), "stop-color": "#fff", "stop-opacity": a.toFixed(3) }, ramp),
  );
  const ends = el("mask", { id: "floor-ends", maskUnits: "userSpaceOnUse", x: -M.fade, y: 0, width: SPAN, height: M.band }, defs);
  el("rect", { x: -M.fade, width: SPAN, height: M.band, fill: "url(#floor-ends-ramp)" }, ends);

  // the colour: band + two thin lines, past both sides of the screen
  const makeLine = (color) => {
    const g = el("g", { class: "floor__line", style: `--c: var(--${color})` }, svg);
    const band = el("g", { class: "floor__band", mask: "url(#floor-ends)" }, g);
    el("rect", { class: "floor__fill", x: -M.fade, width: SPAN, height: M.band }, band);
    M.stripes.forEach((y) => el("rect", { class: "floor__stripe", x: -M.fade, y, width: SPAN, height: 8 }, band));
    const marks = el("g", { class: "floor__marks" }, g);
    return { color, g, band, marks };
  };

  // line at its slot, dx along; band and marks move together
  const place = (line, dx, ms = 0, ease = EASE_SWEEP) => {
    line.g.style.transition = ms ? `transform ${ms}ms ${ease}` : "none";
    line.g.style.transform = `translate(${dx}px, ${line.slot.y}px)`;
    line.band.style.transform = `scale(1, ${line.slot.k})`;
  };

  // pictogram, word and arrows at size k. Laid out pointing right (pictogram at the tail, arrows at the head)
  // and mirrored for left; the letters themselves are never mirrored.
  const drawMarks = (line, { word, icon, dir, slot: { k } }) => {
    line.marks.replaceChildren();
    const S = (x) => M.centre + (x - M.centre) * k;
    const X = (x) => (dir > 0 ? x : W - x);
    const ink = inkOf(word);
    let iconX = S(M.icon);
    let inkX = S(M.word);
    // a long word pushes the pictogram and word toward the tail, never into the arrows
    const over = inkX + ink.width * k - (S(M.chev[0]) - M.minGap * k);
    if (over > 0) {
      iconX -= over;
      inkX -= over;
    }
    const size = M.band * k;
    el("use", { href: `#${icon}`, x: dir > 0 ? iconX : W - iconX - size, y: 0, width: size, height: size }, line.marks);
    const text = el("text", { x: (dir > 0 ? inkX : W - inkX - ink.width * k) - ink.left * k, y: M.base * k }, line.marks);
    text.style.fontSize = `${M.font * k}px`;
    text.style.letterSpacing = `${M.track * k}px`;
    text.textContent = word;
    // each arrow is two bars whose square ends meet just off the centre line, as in the mock
    const { chevW: w, chevD: d } = M;
    const c = M.band / 2;
    M.chev.forEach((x0) => {
      [false, true].forEach((lower) => {
        const pts = [
          [x0, 0],
          [x0 + w, 0],
          [x0 + w + c - d, c - d],
          [x0 + w / 2 + c - d, c - d + w / 2],
        ].map(([x, y]) => `${X(S(x)).toFixed(1)},${((lower ? M.band - y : y) * k).toFixed(1)}`);
        el("polygon", { points: pts.join(" ") }, line.marks);
      });
    });
  };

  let lines = [];
  const show = async (set) => {
    const next = set.map(([key, dir], i) => {
      const [word, icon, color] = PLACES[key];
      return { word, icon, color, dir, slot: SLOTS[set.length - 1][i] };
    });
    // 1. the whole set changes at once: the new lines (colour only) come in from the left right behind
    //    the old ones, which carry their marks out to the right. Their faded ends overlap, so the seam is soft.
    const ms = lines.length ? SWEEP_MS : ENTER_MS;
    const ease = lines.length ? EASE_SWEEP : EASE_OUT;
    const old = lines;
    lines = next.map((n) => Object.assign(makeLine(n.color), { slot: n.slot }));
    lines.forEach((line) => place(line, -SLIDE));
    svg.getBoundingClientRect(); // commit the start before sliding
    old.forEach((line) => place(line, SLIDE, ms, ease));
    lines.forEach((line) => place(line, 0, ms, ease));
    await wait(ms);
    old.forEach((line) => line.g.remove());
    // 2. then the pictogram, word and arrows appear
    await fontReady;
    lines.forEach((line, i) => drawMarks(line, next[i]));
    lines.forEach((line) => line.g.classList.add("is-marked"));
    await wait(FADE_MS);
  };

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // first set, still
    const [[key, dir]] = SETS[0];
    const [word, icon, color] = PLACES[key];
    const line = Object.assign(makeLine(color), { slot: SLOTS[0][0] });
    place(line, 0);
    fontReady.then(() => {
      drawMarks(line, { word, icon, dir, slot: SLOTS[0][0] });
      line.g.classList.add("is-marked");
    });
    return;
  }

  // changes only while the lines are on screen
  let onScreen = false;
  let resume = null;
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen && resume) {
      resume();
      resume = null;
    }
  }).observe(svg);
  const whenOnScreen = () => (onScreen ? Promise.resolve() : new Promise((resolve) => (resume = resolve)));

  const run = async () => {
    await show(SETS[0]);
    for (let i = 1; ; i = (i + 1) % SETS.length) {
      await wait(HOLD_MS);
      await whenOnScreen();
      await show(SETS[i]);
    }
  };

  // the first line slides in once the stage is half on screen
  new IntersectionObserver((entries, io) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    run();
  }, { threshold: 0.5 }).observe(svg);
})();

// ---------- Offline copy: press 0 to download the whole site as one HTML file ----------
// For venues with a weak connection: the file (offline/OFF-THE-LEAGUE.html, built by tools/build-offline.py)
// holds every image, font and script, so opening it from the Downloads folder runs the site without internet.
(() => {
  if (location.protocol === "file:") return; // this is already the offline copy
  const FILE = "offline/OFF-THE-LEAGUE.html";
  let note = null;
  let hide = 0;

  window.addEventListener("keydown", (e) => {
    if (e.key !== "0" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.("input, textarea, [contenteditable]")) return; // typing in the font tester
    const a = document.createElement("a");
    a.href = FILE;
    a.download = "OFF-THE-LEAGUE.html";
    a.click();

    // full screen hides the browser's download bubble, so say it here
    if (!note) {
      note = document.createElement("p");
      note.className = "offline-note";
      note.setAttribute("role", "status");
      note.textContent = "오프라인 파일을 내려받고 있어요 · 다운로드 폴더의 OFF-THE-LEAGUE.html을 열면 인터넷 없이 실행돼요";
      document.body.appendChild(note);
    }
    requestAnimationFrame(() => note.classList.add("is-on"));
    clearTimeout(hide);
    hide = setTimeout(() => note.classList.remove("is-on"), 5000);
  });
})();
