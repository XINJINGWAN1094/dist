import { createScriptIdIframe, teleportStyle } from '@util/script';
import { createApp, type App as VueApp } from 'vue';
import OverlayApp from '../覆盖界面/App.vue';
import { OVERLAY_EVENTS, type OverlayVisibilityPayload } from '../共享/协议';
import { registerCoreEventSync } from './事件同步';
import { registerNativeSendBridge } from './原生发送';

const PAGE_SCOPE = '.thFullscreenOverlayHost';
const OVERLAY_FRAME_ID = 'th-fullscreen-overlay-frame';
const OVERLAY_ROOT_ID = 'th-fullscreen-overlay-root';
const OVERLAY_LAUNCHER_ID = 'th-fullscreen-overlay-launcher';
const DEFAULT_HIDE_NATIVE_UI = true;

const NATIVE_INPUT_UI_SELECTORS = ['#send_form', '#chat-input', '#chat_textarea_holder', '#chat_controls'] as const;

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

function mountFullscreenOverlayHost() {
  const syncBridge = registerCoreEventSync();
  const nativeSendBridge = registerNativeSendBridge();

  let app: VueApp<Element> | null = null;
  let destroyStyleTeleport: (() => void) | null = null;
  let overlayVisible = true;
  let nativeUiHidden = DEFAULT_HIDE_NATIVE_UI;

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
      zIndex: '2147483001',
      display: 'block',
      background: 'transparent',
    })
    .appendTo('body');

  const $launcher = $('<button>')
    .attr({
      id: OVERLAY_LAUNCHER_ID,
      type: 'button',
      script_id: getScriptId(),
      title: '打开或关闭覆盖层',
    })
    .css({
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483002',
      border: '1px solid rgba(115, 210, 255, 0.7)',
      borderRadius: '999px',
      padding: '8px 14px',
      fontSize: '13px',
      letterSpacing: '0.04em',
      color: '#e6f6ff',
      background: 'linear-gradient(145deg, rgba(11, 27, 45, 0.94), rgba(20, 65, 103, 0.9))',
      boxShadow: '0 10px 20px rgba(0, 0, 0, 0.28)',
      cursor: 'pointer',
    })
    .appendTo('body');

  const mountVueOnFrame = () => {
    const frameElement = $frame[0];
    const frameDocument = frameElement?.contentDocument;
    if (!frameDocument) {
      return;
    }

    frameDocument.body.innerHTML = `<div id="${OVERLAY_ROOT_ID}"></div>`;

    destroyStyleTeleport?.();
    destroyStyleTeleport = teleportStyle(frameDocument.head).destroy;

    app?.unmount();
    app = createApp(OverlayApp).use(createPinia());
    app.mount(frameDocument.getElementById(OVERLAY_ROOT_ID)!);
  };

  const updateLauncherText = () => {
    $launcher.text(overlayVisible ? '关闭覆盖页' : '打开覆盖页');
  };

  const setOverlayVisible = (visible: boolean, source: OverlayVisibilityPayload['source']) => {
    overlayVisible = visible;
    $frame.toggle(visible);
    updateLauncherText();
    void eventEmit(OVERLAY_EVENTS.OVERLAY_VISIBILITY_CHANGED, { visible, source } satisfies OverlayVisibilityPayload);
  };

  const applyNativeMessageVisibility = () => {
    const lastMessageId = getLastMessageId();
    if (lastMessageId < 0) {
      return;
    }

    for (let messageId = 0; messageId <= lastMessageId; messageId++) {
      const $messageFloor = retrieveDisplayedMessage(messageId).closest('.mes');
      if ($messageFloor.length === 0) {
        continue;
      }
      const shouldShow = !nativeUiHidden || messageId === 0;
      $messageFloor.toggle(shouldShow);
    }
  };

  const applyNativeUiVisibility = () => {
    NATIVE_INPUT_UI_SELECTORS.forEach(selector => {
      $(selector).toggle(!nativeUiHidden);
    });
    applyNativeMessageVisibility();
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
  stopHandles.push(eventOn(tavern_events.MESSAGE_RECEIVED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MESSAGE_SENT, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MESSAGE_UPDATED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MESSAGE_EDITED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(eventOn(tavern_events.MORE_MESSAGES_LOADED, syncNativeUiVisibilityAfterRender).stop);
  stopHandles.push(
    eventOn(tavern_events.CHAT_CHANGED, () => {
      _.delay(() => {
        nativeUiHidden = DEFAULT_HIDE_NATIVE_UI;
        applyNativeUiVisibility();
      }, 50);
    }).stop,
  );

  $launcher.on(`click${PAGE_SCOPE}`, () => {
    setOverlayVisible(!overlayVisible, 'launcher');
  });

  $frame.on(`load${PAGE_SCOPE}`, mountVueOnFrame);
  _.delay(mountVueOnFrame, 16);
  _.delay(applyNativeUiVisibility, 80);
  updateLauncherText();

  console.info('[全屏覆盖式酒馆前端] 已挂载到顶层 body 的全屏 iframe。');
  console.info('[全屏覆盖式酒馆前端] 原生聊天 UI 默认隐藏（保留开场白可见）。');

  $(window).on(`pagehide${PAGE_SCOPE}`, () => {
    nativeUiHidden = false;
    applyNativeUiVisibility();
    app?.unmount();
    destroyStyleTeleport?.();
    stopHandles.forEach(stop => stop());
    syncBridge.stop();
    nativeSendBridge.stop();
    $launcher.off(PAGE_SCOPE);
    $launcher.remove();
    $frame.off(PAGE_SCOPE);
    $frame.remove();
    $(window).off(PAGE_SCOPE);
  });
}

$(() => {
  errorCatched(mountFullscreenOverlayHost)();
});
