const MAX_POPUP_HEIGHT = 600;
const MEASURE_SAFETY_OFFSET_PX = 2;

function toFiniteNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

export function resolveMinHeight(layoutMode, linkRequestOpen) {
  if (layoutMode === 'ready') {
    return 520;
  }
  if (layoutMode === 'unlock') {
    return 252;
  }
  if (linkRequestOpen) {
    return 470;
  }
  return 340;
}

export function measurePopupHeight(input) {
  const shell = input?.shell ?? null;
  const header = input?.header ?? null;
  const content = input?.content ?? null;
  const layoutMode = typeof input?.layoutMode === 'string' ? input.layoutMode : 'pairing';
  const linkRequestOpen = input?.linkRequestOpen === true;
  const minHeight = resolveMinHeight(layoutMode, linkRequestOpen);
  const shellScrollHeight = shell ? Math.ceil(toFiniteNumber(shell.scrollHeight, 0)) : 0;
  const headerHeight = header ? Math.ceil(toFiniteNumber(header.offsetHeight, 0)) : 0;
  const contentScrollHeight = content ? Math.ceil(toFiniteNumber(content.scrollHeight, 0)) : 0;
  const measuredFromRegions =
    headerHeight > 0 && contentScrollHeight > 0
      ? headerHeight + contentScrollHeight + MEASURE_SAFETY_OFFSET_PX
      : null;
  const measuredHeight = measuredFromRegions ?? shellScrollHeight;
  const upperBound = Math.max(minHeight, toFiniteNumber(input?.maxHeight, MAX_POPUP_HEIGHT));
  const clamped = Math.max(minHeight, Math.min(measuredHeight, upperBound));
  return clamped;
}

export function createPopupAutosizer(input) {
  const shell = input?.shell ?? null;
  const header = input?.header ?? shell?.querySelector?.('.popup-header') ?? null;
  const content = input?.content ?? shell?.querySelector?.('.popup-content') ?? null;
  const body = input?.body ?? document.body;
  const preservedScrollNode = input?.preservedScrollNode ?? null;
  const maxHeight = Math.max(200, toFiniteNumber(input?.maxHeight, MAX_POPUP_HEIGHT));
  if (!(shell instanceof HTMLElement) || !(body instanceof HTMLElement)) {
    return {
      schedule() {},
      applyNow() {},
      destroy() {},
    };
  }

  let destroyed = false;
  let rafId = null;
  const observers = [];
  const cleanupHandlers = [];

  function applyNow() {
    if (destroyed) {
      return;
    }
    const previousHeight = Number.parseInt(body.style.height, 10);
    const previousScrollTop =
      preservedScrollNode instanceof HTMLElement ? preservedScrollNode.scrollTop : null;
    const nextHeight = measurePopupHeight({
      shell,
      header,
      content,
      layoutMode: body.dataset.layout,
      linkRequestOpen: body.dataset.linkRequest === 'open',
      maxHeight,
    });
    if (Number.isFinite(previousHeight) && Math.abs(previousHeight - nextHeight) <= 1) {
      return;
    }
    body.style.height = `${nextHeight}px`;
    if (preservedScrollNode instanceof HTMLElement && typeof previousScrollTop === 'number' && previousScrollTop > 0) {
      preservedScrollNode.scrollTop = previousScrollTop;
    }
  }

  function schedule() {
    if (destroyed) {
      return;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      applyNow();
    });
  }

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => {
      schedule();
    });
    observer.observe(shell);
    observers.push(observer);
  }

  const onWindowResize = () => {
    schedule();
  };
  window.addEventListener('resize', onWindowResize);
  cleanupHandlers.push(() => {
    window.removeEventListener('resize', onWindowResize);
  });

  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    document.fonts.ready.then(
      () => {
        schedule();
      },
      () => {
        // Ignore font loading failures.
      },
    );
  }

  schedule();

  return {
    schedule,
    applyNow,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      for (const observer of observers) {
        observer.disconnect();
      }
      for (const cleanup of cleanupHandlers) {
        cleanup();
      }
    },
  };
}
