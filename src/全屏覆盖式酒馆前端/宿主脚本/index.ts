import { createScriptIdIframe, teleportStyle } from '@util/script';
import { createApp, type App as VueApp } from 'vue';
import OverlayApp from '../覆盖界面/App.vue';
import {
  OVERLAY_EVENTS,
  type NativeMessageVisibilityPayload,
  type OverlayVisibilityPayload,
} from '../共享/协议';
import { registerCoreEventSync } from './事件同步';
import { registerNativeSendBridge } from './原生发送';

const PAGE_SCOPE = '.thFullscreenOverlayHost';
const OVERLAY_FRAME_ID = 'th-fullscreen-overlay-frame';
const OVERLAY_ROOT_ID = 'th-fullscreen-overlay-root';
const OVERLAY_LAUNCHER_ID = 'th-fullscreen-overlay-launcher';
const DEFAULT_HIDE_NATIVE_UI = true;
const OVERLAY_FRAME_Z_INDEX = 2147483001;
const OVERLAY_LAUNCHER_FRONT_Z_INDEX = 2147483002;
const OVERLAY_LAUNCHER_BACK_Z_INDEX = 2147483000;
const OVERLAY_LAUNCHER_MARGIN = 18;

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

function normalizeVisibilityPayload(payload: unknown): OverlayVisibilityPayload {
  if (!payload || typeof payload !== 'object') {
    return { visible: true, source: 'unknown' };
  }

  const record = payload as Record<string, unknown>;
  const visible = record.visible !== false;
  const source =
    record.source === 'overlay_ui' || record.source === 'launcher' || record.source === 'script' || record.source === 'unknown'
      ? record.source
      : 'unknown';

  return { visible, source };
}

function normalizeNativeMessageVisibilityPayload(payload: unknown): NativeMessageVisibilityPayload {
  if (!payload || typeof payload !== 'object') {
    return { hidden: DEFAULT_HIDE_NATIVE_UI, source: 'unknown' };
  }

  const record = payload as Record<string, unknown>;
  const hidden = record.hidden !== false;
  const source =
    record.source === 'overlay_ui' || record.source === 'launcher' || record.source === 'script' || record.source === 'unknown'
      ? record.source
      : 'unknown';

  return { hidden, source };
}

function mountFullscreenOverlayHost() {
  const hostWindow = resolveHostWindow();
  const hostDocument = hostWindow.document;
  const $hostWindow = $(hostWindow);
  const $hostDocument = $(hostDocument);
  const $hostBody = $(hostDocument.body);

  const syncBridge = registerCoreEventSync();
  const nativeSendBridge = registerNativeSendBridge();

  let app: VueApp<Element> | null = null;
  let destroyStyleTeleport: (() => void) | null = null;
  let cleanedUp = false;
  let overlayVisible = true;
  let nativeUiHidden = DEFAULT_HIDE_NATIVE_UI;
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
      id: OVERLAY_FRAME_ID,
      title: '全屏覆盖式酒馆前端',
    })
    .css({
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      border: '0',
      zIndex: String(OVERLAY_FRAME_Z_INDEX),
      display: 'block',
      background: 'transparent',
    })
    .appendTo(hostDocument.body);

  const $launcher = $(hostDocument.createElement('button'))
    .attr({
      id: OVERLAY_LAUNCHER_ID,
      type: 'button',
      script_id: getScriptId(),
      title: '打开或关闭覆盖层',
    })
    .css({
      position: 'fixed',
      right: `${OVERLAY_LAUNCHER_MARGIN}px`,
      bottom: `${OVERLAY_LAUNCHER_MARGIN}px`,
      zIndex: String(OVERLAY_LAUNCHER_BACK_Z_INDEX),
      border: '1px solid rgba(115, 210, 255, 0.7)',
      borderRadius: '999px',
      padding: '8px 14px',
      fontSize: '13px',
      letterSpacing: '0.04em',
      color: '#e6f6ff',
      background: 'linear-gradient(145deg, rgba(11, 27, 45, 0.94), rgba(20, 65, 103, 0.9))',
      boxShadow: '0 10px 20px rgba(0, 0, 0, 0.28)',
      cursor: 'grab',
      touchAction: 'none',
      userSelect: 'none',
    })
    .appendTo(hostDocument.body);

  const syncOverlayFrameViewport = () => {
    const width = Math.max(hostWindow.innerWidth, hostDocument.documentElement.clientWidth, 1);
    const height = Math.max(hostWindow.innerHeight, hostDocument.documentElement.clientHeight, 1);

    $frame.css({
      position: 'fixed',
      inset: '0',
      width: `${width}px`,
      height: `${height}px`,
      minWidth: `${width}px`,
      minHeight: `${height}px`,
      maxWidth: 'none',
      maxHeight: 'none',
      border: '0',
      display: overlayVisible ? 'block' : 'none',
    });

    const frameElement = $frame[0];
    const frameDocument = frameElement?.contentDocument;
    if (frameDocument) {
      frameDocument.documentElement.style.width = '100%';
      frameDocument.documentElement.style.height = '100%';
      frameDocument.body.style.width = '100%';
      frameDocument.body.style.height = '100%';
      frameDocument.getElementById(OVERLAY_ROOT_ID)?.style.setProperty('width', '100%');
      frameDocument.getElementById(OVERLAY_ROOT_ID)?.style.setProperty('height', '100%');
      frameElement.contentWindow?.dispatchEvent(new Event('resize'));
    }
  };

  const syncOverlayFrameViewportSoon = () => {
    syncOverlayFrameViewport();
    hostWindow.requestAnimationFrame(syncOverlayFrameViewport);
    _.delay(syncOverlayFrameViewport, 80);
  };

  const mountVueOnFrame = () => {
    syncOverlayFrameViewport();
    const frameElement = $frame[0];
    const frameDocument = frameElement?.contentDocument;
    if (!frameDocument) {
      return;
    }

    frameDocument.documentElement.style.width = '100%';
    frameDocument.documentElement.style.height = '100%';
    frameDocument.body.style.width = '100%';
    frameDocument.body.style.height = '100%';
    frameDocument.body.style.margin = '0';
    frameDocument.body.style.overflow = 'hidden';
    frameDocument.body.innerHTML = `<div id="${OVERLAY_ROOT_ID}"></div>`;
    const rootElement = frameDocument.getElementById(OVERLAY_ROOT_ID);
    if (rootElement) {
      rootElement.style.width = '100%';
      rootElement.style.height = '100%';
    }

    destroyStyleTeleport?.();
    destroyStyleTeleport = teleportStyle(frameDocument.head).destroy;

    app?.unmount();
    app = createApp(OverlayApp).use(createPinia());
    app.mount(rootElement!);
  };

  const updateLauncherText = () => {
    $launcher.text(overlayVisible ? '关闭覆盖页' : '打开覆盖页');
  };

  const updateLauncherLayer = () => {
    $launcher.css('zIndex', String(overlayVisible ? OVERLAY_LAUNCHER_BACK_Z_INDEX : OVERLAY_LAUNCHER_FRONT_Z_INDEX));
  };

  const clampLauncherPosition = (left: number, top: number) => {
    const launcherWidth = $launcher.outerWidth() ?? 0;
    const launcherHeight = $launcher.outerHeight() ?? 0;

    return {
      left: _.clamp(left, 8, Math.max(8, hostWindow.innerWidth - launcherWidth - 8)),
      top: _.clamp(top, 8, Math.max(8, hostWindow.innerHeight - launcherHeight - 8)),
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

  const stopLauncherDrag = () => {
    launcherDragState = null;
    $launcher.css('cursor', 'grab');
    $hostBody.css('userSelect', '');
    $hostDocument.off(`pointermove${PAGE_SCOPE}`);
    $hostDocument.off(`pointerup${PAGE_SCOPE}`);
    $hostDocument.off(`pointercancel${PAGE_SCOPE}`);
  };

  const setOverlayVisible = (visible: boolean, source: OverlayVisibilityPayload['source']) => {
    overlayVisible = visible;
    $frame.toggle(visible);
    syncOverlayFrameViewportSoon();
    updateLauncherText();
    updateLauncherLayer();
    void eventEmit(OVERLAY_EVENTS.OVERLAY_VISIBILITY_CHANGED, { visible, source } satisfies OverlayVisibilityPayload);
  };

  const applyNativeMessageVisibility = () => {
    $('#chat > .mes', hostDocument).each((_, element) => {
      const $messageFloor = $(element);
      const messageId = Number($messageFloor.attr('mesid'));
      const shouldShow = !nativeUiHidden || messageId === 0;
      $messageFloor.toggle(shouldShow);
    });
  };

  const applyNativeUiVisibility = () => {
    applyNativeMessageVisibility();
  };

  const setNativeMessageHidden = (hidden: boolean, source: NativeMessageVisibilityPayload['source']) => {
    nativeUiHidden = hidden;
    applyNativeUiVisibility();
    void eventEmit(OVERLAY_EVENTS.NATIVE_MESSAGE_VISIBILITY_CHANGED, {
      hidden,
      source,
    } satisfies NativeMessageVisibilityPayload);
  };

  const syncNativeUiVisibilityAfterRender = () => {
    if (!nativeUiHidden) {
      return;
    }
    _.delay(applyNativeUiVisibility, 32);
  };

  const stopHandles: Array<() => void> = [];
  stopHandles.push(
    eventOn(OVERLAY_EVENTS.REQUEST_OVERLAY_VISIBILITY, rawPayload => {
      const payload = normalizeVisibilityPayload(rawPayload);
      setOverlayVisible(payload.visible, payload.source);
    }).stop,
  );
  stopHandles.push(
    eventOn(OVERLAY_EVENTS.REQUEST_NATIVE_MESSAGE_VISIBILITY, rawPayload => {
      const payload = normalizeNativeMessageVisibilityPayload(rawPayload);
      setNativeMessageHidden(payload.hidden, payload.source);
    }).stop,
  );
  stopHandles.push(eventOn(tavern_events.MESSAGE_RECEIVED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MESSAGE_SENT, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MESSAGE_UPDATED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MESSAGE_EDITED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MORE_MESSAGES_LOADED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(
    eventOn(tavern_events.CHAT_CHANGED, () => {
      _.delay(() => {
        applyNativeUiVisibility();
      }, 50);
    }).stop,
  );

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

    $hostDocument.on(`pointercancel${PAGE_SCOPE}`, () => {
      stopLauncherDrag();
    });
  });

  $launcher.on(`click${PAGE_SCOPE}`, event => {
    if (suppressLauncherClick) {
      suppressLauncherClick = false;
      event.preventDefault();
      return;
    }
    setOverlayVisible(!overlayVisible, 'launcher');
  });

  $hostWindow.on(`resize${PAGE_SCOPE}`, () => {
    syncOverlayFrameViewportSoon();
    const rect = $launcher[0].getBoundingClientRect();
    if ($launcher.css('left') !== 'auto') {
      setLauncherPosition(rect.left, rect.top);
    }
  });

  $frame.on(`load${PAGE_SCOPE}`, mountVueOnFrame);
  syncOverlayFrameViewportSoon();
  _.delay(mountVueOnFrame, 16);
  _.delay(applyNativeUiVisibility, 80);
  void eventEmit(OVERLAY_EVENTS.OVERLAY_VISIBILITY_CHANGED, {
    visible: overlayVisible,
    source: 'script',
  } satisfies OverlayVisibilityPayload);
  void eventEmit(OVERLAY_EVENTS.NATIVE_MESSAGE_VISIBILITY_CHANGED, {
    hidden: nativeUiHidden,
    source: 'script',
  } satisfies NativeMessageVisibilityPayload);
  updateLauncherText();
  updateLauncherLayer();

  console.info('[全屏覆盖式酒馆前端] 已挂载到顶层 body 的全屏 iframe。');
  console.info('[全屏覆盖式酒馆前端] 原生聊天 UI 默认隐藏（保留开场白可见）。');

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    nativeUiHidden = false;
    applyNativeUiVisibility();
    app?.unmount();
    destroyStyleTeleport?.();
    stopHandles.forEach(stop => stop());
    syncBridge.stop();
    nativeSendBridge.stop();
    stopLauncherDrag();
    $hostDocument.off(PAGE_SCOPE);
    $launcher.off(PAGE_SCOPE);
    $launcher.remove();
    $frame.off(PAGE_SCOPE);
    $frame.remove();
    $hostWindow.off(PAGE_SCOPE);
    $(window).off(PAGE_SCOPE);
  };

  $hostWindow.on(`pagehide${PAGE_SCOPE}`, cleanup);
  if (hostWindow !== window) {
    $(window).on(`pagehide${PAGE_SCOPE}`, cleanup);
  }
}

$(() => {
  errorCatched(mountFullscreenOverlayHost)();
});
