import {Capacitor, registerPlugin} from '@capacitor/core';

type PreviewBounds = {left: number; top: number; width: number; height: number; viewportWidth: number};
const ScannerTools = registerPlugin<{
  setPreviewBounds: (bounds: PreviewBounds) => Promise<void>;
  vibrate: () => Promise<void>;
}>('ScannerTools');

export function vibrateOnRead(): void {
  if (Capacitor.getPlatform() === 'android') {
    void ScannerTools.vibrate().catch(() => {});
  } else {
    try {
      navigator.vibrate?.(45);
    } catch {
      /* Feedback is optional on the web. */
    }
  }
}

export function prepareCameraViewport(element: HTMLElement) {
  function measure(): PreviewBounds {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      viewportWidth: innerWidth,
    };
  }
  let stopped = false;
  let frame = 0;
  let updating = false;
  let pending = false;
  async function update() {
    pending = true;
    if (updating) return;
    updating = true;
    try {
      while (pending && !stopped) {
        pending = false;
        await ScannerTools.setPreviewBounds(measure());
      }
    } finally {
      updating = false;
    }
  }
  function schedule() {
    if (frame || stopped) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      void update().catch(() => {});
    });
  }
  const observer = new ResizeObserver(schedule);
  return {
    async start() {
      await update();
      if (stopped) return;
      observer.observe(element);
      window.addEventListener('resize', schedule);
      window.addEventListener('scroll', schedule, true);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    },
  };
}
