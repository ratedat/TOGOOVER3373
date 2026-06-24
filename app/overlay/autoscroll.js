let overlayAutoScrollFrame = null;

export function cancelOverlayAutoScroll() {
  if (overlayAutoScrollFrame !== null) {
    clearInterval(overlayAutoScrollFrame);
    overlayAutoScrollFrame = null;
  }
}

export function setupOverlayAutoScroll(root = document) {
  cancelOverlayAutoScroll();
  const scrollers = [...root.querySelectorAll("[data-autoscroll]")];
  if (!scrollers.length) return;
  const entries = scrollers.map((element, index) => {
    const content = element.firstElementChild;
    if (content) content.style.transform = "translateY(0px)";
    return {
      element,
      content,
      offset: 0,
      direction: 1,
      last: performance.now(),
      pauseUntil: performance.now() + 900 + index * 700,
      speed: Number.isFinite(Number(element.dataset.scrollSpeed)) ? Number(element.dataset.scrollSpeed) : 14,
    };
  }).filter((entry) => entry.content);
  if (!entries.length) return;
  overlayAutoScrollFrame = setInterval(() => {
    const now = performance.now();
    for (const entry of entries) {
      const max = Math.max(0, entry.content.scrollHeight - entry.element.clientHeight);
      if (max <= 1) {
        entry.offset = 0;
        entry.content.style.transform = "translateY(0px)";
        entry.last = now;
        continue;
      }
      const delta = Math.min(120, now - entry.last);
      entry.last = now;
      if (now < entry.pauseUntil) continue;
      entry.offset += entry.direction * entry.speed * delta / 1000;
      if (entry.offset >= max) {
        entry.offset = max;
        entry.direction = -1;
        entry.pauseUntil = now + 1600;
      } else if (entry.offset <= 0) {
        entry.offset = 0;
        entry.direction = 1;
        entry.pauseUntil = now + 1200;
      }
      entry.content.style.transform = `translateY(${-entry.offset}px)`;
    }
  }, 80);
}