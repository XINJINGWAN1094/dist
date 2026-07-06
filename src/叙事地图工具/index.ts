import { createScriptIdIframe, teleportStyle } from '@util/script';
import { createApp, type App as VueApp } from 'vue';
import MapToolApp from './App.vue';

const PAGE_SCOPE = '.thNarrativeMapTool';
const FRAME_ID = 'th-narrative-map-tool-frame';
const LAUNCHER_ID = 'th-narrative-map-tool-launcher';
const ROOT_ID = 'th-narrative-map-tool-root';
const FRAME_Z_INDEX = 2147483011;
const LAUNCHER_Z_INDEX = 2147483012;
const LAUNCHER_MARGIN = 18;
const LAUNCHER_EDGE_MARGIN = 8;

function resolveHostWindow(): Window {
  try {
    const ownerWindow = window.frameElement?.ownerDocument.defaultView;
    if (ownerWindow) {
      return ownerWindow;
    }
  } catch {
    // Fall back below when parent access is unavailable.
  }

  try {
    if (window.parent && window.parent !== window) {
      return window.parent;
    }
  } catch {
    // Fall back below when parent access is unavailable.
  }

  return window;
}

function mountNarrativeMapTool() {
  const hostWindow = resolveHostWindow();
  const hostDocument = hostWindow.document;
  const hostVisualViewport = hostWindow.visualViewport;
  const $hostWindow = $(hostWindow);
  const $hostDocument = $(hostDocument);
  const $hostBody = $(hostDocument.body);

  let app: VueApp<Element> | null = null;
  let destroyStyleTeleport: (() => void) | null = null;
  let cleanedUp = false;
  let toolVisible = false;
  let suppressLauncherClick = false;
  let launcherDragState:
    | {
        startX: number;
        startY: number;
        originLeft: number;
        originTop: number;
        moved: boolean;
      }
    | null = null;

  const $frame = createScriptIdIframe()
    .attr({
      id: FRAME_ID,
      title: '叙事地图工具',
    })
    .css({
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      minWidth: '100vw',
      minHeight: '100vh',
      border: '0',
      zIndex: String(FRAME_Z_INDEX),
      display: 'none',
      background: 'transparent',
    })
    .appendTo(hostDocument.body);

  const $launcher = $(hostDocument.createElement('button'))
    .attr({
      id: LAUNCHER_ID,
      type: 'button',
      script_id: getScriptId(),
      title: '打开或关闭叙事地图工具',
    })
    .css({
      position: 'fixed',
      right: `${LAUNCHER_MARGIN}px`,
      bottom: `${LAUNCHER_MARGIN}px`,
      zIndex: String(LAUNCHER_Z_INDEX),
      border: '1px solid rgba(74, 125, 140, 0.72)',
      borderRadius: '999px',
      padding: '9px 14px',
      color: '#f6fbfc',
      background: 'linear-gradient(145deg, rgba(35, 72, 84, 0.96), rgba(24, 43, 52, 0.96))',
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.28)',
      cursor: 'grab',
      touchAction: 'none',
      userSelect: 'none',
      fontSize: '13px',
      whiteSpace: 'nowrap',
      maxWidth: `calc(100vw - ${LAUNCHER_EDGE_MARGIN * 2}px)`,
    })
    .appendTo(hostDocument.body);

  const getViewportSize = () => {
    const width = Math.max(
      Math.floor(hostVisualViewport?.width ?? hostWindow.innerWidth ?? hostDocument.documentElement.clientWidth),
      1,
    );
    const height = Math.max(
      Math.floor(hostVisualViewport?.height ?? hostWindow.innerHeight ?? hostDocument.documentElement.clientHeight),
      1,
    );
    return { width, height };
  };

  const syncFrameViewport = () => {
    const width = Math.max(hostWindow.innerWidth, hostDocument.documentElement.clientWidth, 1);
    const height = Math.max(hostWindow.innerHeight, hostDocument.documentElement.clientHeight, 1);
    $frame.css({
      width: `${width}px`,
      height: `${height}px`,
      minWidth: `${width}px`,
      minHeight: `${height}px`,
      display: toolVisible ? 'block' : 'none',
    });

    const frameDocument = $frame[0].contentDocument;
    if (frameDocument) {
      frameDocument.documentElement.style.width = '100%';
      frameDocument.documentElement.style.height = '100%';
      frameDocument.body.style.width = '100%';
      frameDocument.body.style.height = '100%';
      frameDocument.getElementById(ROOT_ID)?.style.setProperty('width', '100%');
      frameDocument.getElementById(ROOT_ID)?.style.setProperty('height', '100%');
      $frame[0].contentWindow?.dispatchEvent(new Event('resize'));
    }
  };

  const syncFrameViewportSoon = () => {
    syncFrameViewport();
    hostWindow.requestAnimationFrame(syncFrameViewport);
    _.delay(syncFrameViewport, 80);
  };

  const mountVueOnFrame = () => {
    const frameDocument = $frame[0].contentDocument;
    if (!frameDocument) {
      return;
    }

    frameDocument.documentElement.style.width = '100%';
    frameDocument.documentElement.style.height = '100%';
    frameDocument.body.style.width = '100%';
    frameDocument.body.style.height = '100%';
    frameDocument.body.style.margin = '0';
    frameDocument.body.style.overflow = 'hidden';
    frameDocument.body.innerHTML = `<div id="${ROOT_ID}"></div>`;

    const rootElement = frameDocument.getElementById(ROOT_ID);
    if (!rootElement) {
      return;
    }
    rootElement.style.width = '100%';
    rootElement.style.height = '100%';

    destroyStyleTeleport?.();
    destroyStyleTeleport = teleportStyle(frameDocument.head).destroy;

    app?.unmount();
    app = createApp(MapToolApp, { onClose: () => setToolVisible(false) }).use(createPinia());
    app.config.errorHandler = error => {
      console.error('[叙事地图工具] Vue 运行错误', error);
      toastr.error('叙事地图工具运行出错，请查看控制台');
    };
    app.mount(rootElement);
    syncFrameViewportSoon();
  };

  const updateLauncherText = () => {
    $launcher.text(toolVisible ? '关闭地图工具' : '打开地图工具');
  };

  const setToolVisible = (visible: boolean) => {
    toolVisible = visible;
    $frame.toggle(visible);
    updateLauncherText();
    syncFrameViewportSoon();
  };

  const clampLauncherPosition = (left: number, top: number) => {
    const launcherWidth = $launcher.outerWidth() ?? 0;
    const launcherHeight = $launcher.outerHeight() ?? 0;
    const viewport = getViewportSize();
    return {
      left: _.clamp(
        left,
        LAUNCHER_EDGE_MARGIN,
        Math.max(LAUNCHER_EDGE_MARGIN, viewport.width - launcherWidth - LAUNCHER_EDGE_MARGIN),
      ),
      top: _.clamp(
        top,
        LAUNCHER_EDGE_MARGIN,
        Math.max(LAUNCHER_EDGE_MARGIN, viewport.height - launcherHeight - LAUNCHER_EDGE_MARGIN),
      ),
    };
  };

  const setLauncherPosition = (left: number, top: number) => {
    const next = clampLauncherPosition(left, top);
    $launcher.css({
      left: `${next.left}px`,
      top: `${next.top}px`,
      right: 'auto',
      bottom: 'auto',
    });
  };

  const syncLauncherInsideViewport = () => {
    const rect = $launcher[0].getBoundingClientRect();
    setLauncherPosition(rect.left, rect.top);
  };

  const syncLauncherInsideViewportSoon = () => {
    syncLauncherInsideViewport();
    hostWindow.requestAnimationFrame(syncLauncherInsideViewport);
    _.delay(syncLauncherInsideViewport, 80);
  };

  const placeLauncherAtDefaultPosition = () => {
    const launcherWidth = $launcher.outerWidth() ?? 0;
    const launcherHeight = $launcher.outerHeight() ?? 0;
    const viewport = getViewportSize();
    setLauncherPosition(
      viewport.width - launcherWidth - LAUNCHER_MARGIN,
      viewport.height - launcherHeight - LAUNCHER_MARGIN,
    );
  };

  const stopLauncherDrag = () => {
    launcherDragState = null;
    $launcher.css('cursor', 'grab');
    $hostBody.css('userSelect', '');
    $hostDocument.off(`pointermove${PAGE_SCOPE}`);
    $hostDocument.off(`pointerup${PAGE_SCOPE}`);
    $hostDocument.off(`pointercancel${PAGE_SCOPE}`);
  };

  $launcher.on(`pointerdown${PAGE_SCOPE}`, event => {
    const pointer = event.originalEvent as PointerEvent | undefined;
    if (!pointer || pointer.button !== 0) {
      return;
    }

    const rect = $launcher[0].getBoundingClientRect();
    launcherDragState = {
      startX: pointer.clientX,
      startY: pointer.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };
    setLauncherPosition(rect.left, rect.top);
    $launcher.css('cursor', 'grabbing');
    $hostBody.css('userSelect', 'none');
    $launcher[0].setPointerCapture?.(pointer.pointerId);

    $hostDocument.on(`pointermove${PAGE_SCOPE}`, moveEvent => {
      const movePointer = moveEvent.originalEvent as PointerEvent | undefined;
      if (!movePointer || !launcherDragState) {
        return;
      }
      const deltaX = movePointer.clientX - launcherDragState.startX;
      const deltaY = movePointer.clientY - launcherDragState.startY;
      if (!launcherDragState.moved && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
        launcherDragState.moved = true;
      }
      setLauncherPosition(launcherDragState.originLeft + deltaX, launcherDragState.originTop + deltaY);
    });

    $hostDocument.on(`pointerup${PAGE_SCOPE}`, upEvent => {
      const upPointer = upEvent.originalEvent as PointerEvent | undefined;
      if (launcherDragState?.moved) {
        suppressLauncherClick = true;
      }
      if (upPointer) {
        $launcher[0].releasePointerCapture?.(upPointer.pointerId);
      }
      stopLauncherDrag();
    });

    $hostDocument.on(`pointercancel${PAGE_SCOPE}`, stopLauncherDrag);
  });

  $launcher.on(`click${PAGE_SCOPE}`, event => {
    if (suppressLauncherClick) {
      suppressLauncherClick = false;
      event.preventDefault();
      return;
    }
    setToolVisible(!toolVisible);
  });

  $frame.on(`load${PAGE_SCOPE}`, mountVueOnFrame);
  $hostWindow.on(`resize${PAGE_SCOPE}`, () => {
    syncFrameViewportSoon();
    syncLauncherInsideViewportSoon();
  });
  hostVisualViewport?.addEventListener('resize', syncLauncherInsideViewportSoon);
  hostVisualViewport?.addEventListener('scroll', syncLauncherInsideViewportSoon);

  updateLauncherText();
  placeLauncherAtDefaultPosition();
  syncFrameViewportSoon();
  _.delay(mountVueOnFrame, 16);

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    app?.unmount();
    destroyStyleTeleport?.();
    stopLauncherDrag();
    $hostDocument.off(PAGE_SCOPE);
    $launcher.off(PAGE_SCOPE);
    $launcher.remove();
    $frame.off(PAGE_SCOPE);
    $frame.remove();
    $hostWindow.off(PAGE_SCOPE);
    hostVisualViewport?.removeEventListener('resize', syncLauncherInsideViewportSoon);
    hostVisualViewport?.removeEventListener('scroll', syncLauncherInsideViewportSoon);
    $(window).off(PAGE_SCOPE);
  };

  $hostWindow.on(`pagehide${PAGE_SCOPE}`, cleanup);
  if (hostWindow !== window) {
    $(window).on(`pagehide${PAGE_SCOPE}`, cleanup);
  }

  console.info('[叙事地图工具] 已挂载到顶层 body。');
}

$(() => {
  errorCatched(mountNarrativeMapTool)();
});
