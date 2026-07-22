import { createScriptIdIframe, teleportStyle } from '@util/script';
import { createApp, type App as VueApp } from 'vue';
import StoryDirectorApp from './App.vue';
import { emitStateChanged, onStateChanged, patchState, readState } from './state';
import { SCRIPT_BUTTON_NAME } from './types';
import {
  clearSyncTimers,
  cleanupLegacyRuntimeWorldbookEntries,
  ignoreStoredOutlineStateForMessage,
  prepareRuntimePromptForGeneration,
  queueSync,
  queueSyncSeries,
  refreshRuntimePromptStatus,
  RUNTIME_PROMPT_ID,
  resetSyncContextForCurrentChat,
} from './sync';

const PAGE_SCOPE = '.thXinjingwanStoryDirector';
const FRAME_ID = 'xinjingwan-story-director-frame';
const ROOT_ID = 'xinjingwan-story-director-root';
const FRAME_Z_INDEX = 2147483021;
const MOBILE_BREAKPOINT = 640;
const DESKTOP_FRAME_MARGIN = 8;
const DEFAULT_DESKTOP_WIDTH = 760;
const DEFAULT_DESKTOP_HEIGHT = 720;
const MIN_DESKTOP_WIDTH = 280;
const MIN_DESKTOP_HEIGHT = 58;

type FramePosition = {
  left: number;
  top: number;
};

type FrameSize = {
  width: number;
  height: number;
};

type DragState = {
  startScreenX: number;
  startScreenY: number;
  startLeft: number;
  startTop: number;
};

function resolveHostWindow(): Window {
  try {
    const ownerWindow = window.frameElement?.ownerDocument.defaultView;
    if (ownerWindow) {
      return ownerWindow;
    }
  } catch {
    // Fall back below.
  }

  try {
    if (window.parent && window.parent !== window) {
      return window.parent;
    }
  } catch {
    // Fall back below.
  }

  return window;
}

function getCurrentChatIdSafely() {
  try {
    return SillyTavern.getCurrentChatId();
  } catch {
    return '';
  }
}

function mountXinjingwanStoryDirector() {
  appendInexistentScriptButtons([{ name: SCRIPT_BUTTON_NAME, visible: true }]);
  patchState(state => {
    state.ui.visible = false;
  }, false);

  const hostWindow = resolveHostWindow();
  const hostDocument = hostWindow.document;
  const $hostWindow = $(hostWindow);
  const hostVisualViewport = hostWindow.visualViewport;

  let app: VueApp<Element> | null = null;
  let destroyStyleTeleport: (() => void) | null = null;
  let cleanedUp = false;
  let currentChatId = getCurrentChatIdSafely();
  let chatEventRevision = 0;
  let lastLegacyWorldbookName = readState(false).targetWorldbookName;
  let draggedFramePosition: FramePosition | null = null;
  let dragState: DragState | null = null;

  const $frame = createScriptIdIframe()
    .attr({
      id: FRAME_ID,
      title: '新景湾剧情指导',
    })
    .css({
      position: 'fixed',
      right: '20px',
      bottom: '74px',
      width: `${DEFAULT_DESKTOP_WIDTH}px`,
      height: `${DEFAULT_DESKTOP_HEIGHT}px`,
      maxWidth: 'calc(100vw - 40px)',
      maxHeight: 'calc(100vh - 96px)',
      border: '0',
      zIndex: String(FRAME_Z_INDEX),
      display: 'none',
      background: 'transparent',
    })
    .appendTo(hostDocument.body);

  const getViewportMetrics = () => ({
    width: Math.max(hostVisualViewport?.width ?? hostWindow.innerWidth, 1),
    height: Math.max(hostVisualViewport?.height ?? hostWindow.innerHeight, 1),
    offsetLeft: hostVisualViewport?.offsetLeft ?? 0,
    offsetTop: hostVisualViewport?.offsetTop ?? 0,
  });

  const getFrameSize = (): FrameSize => {
    const metrics = getViewportMetrics();
    const mobile = metrics.width <= MOBILE_BREAKPOINT;
    return {
      width: mobile
        ? Math.max(metrics.width - 16, 1)
        : Math.max(Math.min(DEFAULT_DESKTOP_WIDTH, metrics.width - 40), MIN_DESKTOP_WIDTH),
      height: mobile
        ? Math.max(metrics.height - 16, 1)
        : Math.max(Math.min(DEFAULT_DESKTOP_HEIGHT, metrics.height - 96), MIN_DESKTOP_HEIGHT),
    };
  };

  const clampFramePosition = (position: FramePosition, size = getFrameSize()): FramePosition => {
    const metrics = getViewportMetrics();
    const minLeft = metrics.offsetLeft + DESKTOP_FRAME_MARGIN;
    const minTop = metrics.offsetTop + DESKTOP_FRAME_MARGIN;
    const maxLeft = Math.max(minLeft, metrics.offsetLeft + metrics.width - size.width - DESKTOP_FRAME_MARGIN);
    const maxTop = Math.max(minTop, metrics.offsetTop + metrics.height - size.height - DESKTOP_FRAME_MARGIN);

    return {
      left: Math.min(Math.max(position.left, minLeft), maxLeft),
      top: Math.min(Math.max(position.top, minTop), maxTop),
    };
  };

  const applyDraggedFramePosition = (position: FramePosition) => {
    draggedFramePosition = clampFramePosition(position);
    $frame.css({
      left: `${draggedFramePosition.left}px`,
      top: `${draggedFramePosition.top}px`,
      right: 'auto',
      bottom: 'auto',
    });
  };

  const endFrameDrag = () => {
    dragState = null;
    $frame.css('pointer-events', '');
    $(hostDocument).off(`pointermove${PAGE_SCOPE} pointerup${PAGE_SCOPE} pointercancel${PAGE_SCOPE}`);
    $(hostDocument.body).css({
      cursor: '',
      userSelect: '',
    });
  };

  const updateFrameDrag = (event: JQuery.TriggeredEvent) => {
    if (!dragState) {
      return;
    }

    const pointerEvent = event.originalEvent as PointerEvent | undefined;
    if (!pointerEvent) {
      return;
    }

    event.preventDefault();
    applyDraggedFramePosition({
      left: dragState.startLeft + pointerEvent.screenX - dragState.startScreenX,
      top: dragState.startTop + pointerEvent.screenY - dragState.startScreenY,
    });
  };

  const beginFrameDrag = (event: JQuery.TriggeredEvent) => {
    const pointerEvent = event.originalEvent as PointerEvent | undefined;
    if (!pointerEvent || pointerEvent.button !== 0 || getViewportMetrics().width <= MOBILE_BREAKPOINT) {
      return;
    }

    const target = event.target as Element | null;
    if (target?.closest('button, input, textarea, select, a')) {
      return;
    }

    const frameRect = $frame[0].getBoundingClientRect();
    dragState = {
      startScreenX: pointerEvent.screenX,
      startScreenY: pointerEvent.screenY,
      startLeft: frameRect.left + (hostVisualViewport?.offsetLeft ?? 0),
      startTop: frameRect.top + (hostVisualViewport?.offsetTop ?? 0),
    };

    event.preventDefault();
    $frame.css('pointer-events', 'none');
    $(hostDocument.body).css({
      cursor: 'move',
      userSelect: 'none',
    });
    $(hostDocument)
      .off(`pointermove${PAGE_SCOPE} pointerup${PAGE_SCOPE} pointercancel${PAGE_SCOPE}`)
      .on(`pointermove${PAGE_SCOPE}`, updateFrameDrag)
      .on(`pointerup${PAGE_SCOPE} pointercancel${PAGE_SCOPE}`, endFrameDrag);
  };

  const syncFrameLayout = () => {
    const state = readState(false);
    if (state.targetWorldbookName) {
      lastLegacyWorldbookName = state.targetWorldbookName;
    }
    const visible = state.ui.visible;
    const metrics = getViewportMetrics();
    const mobile = metrics.width <= MOBILE_BREAKPOINT;
    const { width, height } = getFrameSize();
    const desktopPosition = !mobile && draggedFramePosition ? clampFramePosition(draggedFramePosition, { width, height }) : null;
    draggedFramePosition = desktopPosition;

    $frame.css({
      left: mobile ? `${metrics.offsetLeft + 8}px` : desktopPosition ? `${desktopPosition.left}px` : 'auto',
      top: mobile ? `${metrics.offsetTop + 8}px` : desktopPosition ? `${desktopPosition.top}px` : 'auto',
      right: mobile || desktopPosition ? 'auto' : '20px',
      bottom: mobile || desktopPosition ? 'auto' : '74px',
      display: visible ? 'block' : 'none',
      width: `${width}px`,
      height: `${height}px`,
      maxWidth: mobile ? 'none' : 'calc(100vw - 40px)',
      maxHeight: mobile ? 'none' : 'calc(100vh - 96px)',
    });

    const frameDocument = $frame[0].contentDocument;
    if (!frameDocument?.documentElement || !frameDocument.body) {
      return;
    }
    frameDocument.documentElement.style.width = '100%';
    frameDocument.documentElement.style.height = '100%';
    frameDocument.body.style.width = '100%';
    frameDocument.body.style.height = '100%';
    frameDocument.body.style.margin = '0';
    frameDocument.body.style.overflow = 'hidden';
    frameDocument.getElementById(ROOT_ID)?.style.setProperty('width', '100%');
    frameDocument.getElementById(ROOT_ID)?.style.setProperty('height', '100%');
  };

  const syncFrameLayoutSoon = () => {
    syncFrameLayout();
    hostWindow.requestAnimationFrame(syncFrameLayout);
    _.delay(syncFrameLayout, 80);
  };

  const syncFrameLayoutForEditing = () => {
    syncFrameLayoutSoon();
    _.delay(syncFrameLayout, 280);
    _.delay(syncFrameLayout, 640);
  };

  const mountVueOnFrame = () => {
    const frameDocument = $frame[0].contentDocument;
    if (!frameDocument?.documentElement || !frameDocument.body) {
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
    app = createApp(StoryDirectorApp);
    app.config.errorHandler = error => {
      console.error('[xinjingwan-story-director] Vue runtime error:', error);
      toastr.error('剧情指导界面运行出错，请查看控制台。', '剧情指导');
    };
    app.mount(rootElement);
    $(frameDocument)
      .off(PAGE_SCOPE)
      .on(`pointerdown${PAGE_SCOPE}`, '.titlebar', beginFrameDrag)
      .on(`focusin${PAGE_SCOPE}`, 'textarea,input', syncFrameLayoutForEditing)
      .on(`focusout${PAGE_SCOPE}`, 'textarea,input', syncFrameLayoutForEditing);
    syncFrameLayoutSoon();
  };

  const openWindow = () => {
    patchState(state => {
      state.ui.visible = true;
    });
    queueSync('脚本按钮打开浮窗', false, 0);
  };

  const refreshAfterChatEvent = async (reason: string, nextChatId: string) => {
    if (currentChatId === nextChatId) {
      return;
    }

    const eventRevision = ++chatEventRevision;
    const previousTarget = lastLegacyWorldbookName;
    currentChatId = nextChatId;
    resetSyncContextForCurrentChat();
    uninjectPrompts([RUNTIME_PROMPT_ID]);

    await cleanupLegacyRuntimeWorldbookEntries(previousTarget ?? undefined);

    if (eventRevision !== chatEventRevision || currentChatId !== getCurrentChatIdSafely()) {
      return;
    }

    let nextState = readState(true);
    if (nextState.ui.visible) {
      nextState = patchState(state => {
        state.ui.visible = false;
      }, false);
    }
    if (nextState.targetWorldbookName) {
      lastLegacyWorldbookName = nextState.targetWorldbookName;
    }
    emitStateChanged(nextState);
    refreshRuntimePromptStatus(`${reason}后恢复`, nextState);
    syncFrameLayoutSoon();
    if (nextState.activeMode) {
      queueSync(reason, false, 0);
      queueSyncSeries(reason);
    }
  };

  const queueSyncNowAndSeries = (reason: string, messageId?: number | null) => {
    ignoreStoredOutlineStateForMessage(messageId);
    queueSync(reason, false, 0);
    queueSyncSeries(reason);
  };

  const preparePromptForGeneration = (reason: string, generationType?: string) => {
    const keepLatestAssistantProgress = ['continue', 'append', 'appendFinal'].includes(generationType ?? '');
    prepareRuntimePromptForGeneration(reason, {
      excludeLatestAssistant: !keepLatestAssistantProgress,
    });
  };

  const stopStateListener = onStateChanged(syncFrameLayoutSoon);
  const stopHandles = [
    eventOn(
      getButtonEvent(SCRIPT_BUTTON_NAME),
      errorCatched(() => openWindow()),
    ).stop,
    eventOn(
      tavern_events.CHAT_CHANGED,
      errorCatched(chatId => refreshAfterChatEvent('聊天切换', chatId)),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_RECEIVED,
      errorCatched(() => queueSyncNowAndSeries('消息接收')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_UPDATED,
      errorCatched(() => queueSyncNowAndSeries('消息更新')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_EDITED,
      errorCatched(() => queueSyncNowAndSeries('消息编辑')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_DELETED,
      errorCatched(messageId => queueSyncNowAndSeries('消息删除', messageId)),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_SWIPED,
      errorCatched(messageId => queueSyncNowAndSeries('消息 swipe 切换', messageId)),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_SWIPE_DELETED,
      errorCatched(eventData => queueSyncNowAndSeries('消息 swipe 删除', eventData?.messageId)),
    ).stop,
    eventOn(
      tavern_events.GENERATION_AFTER_COMMANDS,
      errorCatched((generationType: string) => preparePromptForGeneration('生成请求准备', generationType)),
    ).stop,
    eventOn(
      tavern_events.GENERATION_STARTED,
      errorCatched(() => refreshRuntimePromptStatus('生成开始')),
    ).stop,
    eventOn(
      tavern_events.GENERATION_ENDED,
      errorCatched(() => queueSyncNowAndSeries('生成结束')),
    ).stop,
    eventOn(
      tavern_events.GENERATION_STOPPED,
      errorCatched(() => queueSyncNowAndSeries('生成停止')),
    ).stop,
  ];

  $frame.on(`load${PAGE_SCOPE}`, mountVueOnFrame);
  $hostWindow.on(`resize${PAGE_SCOPE}`, syncFrameLayoutSoon);
  hostVisualViewport?.addEventListener('resize', syncFrameLayoutSoon);
  hostVisualViewport?.addEventListener('scroll', syncFrameLayoutSoon);
  _.delay(mountVueOnFrame, 16);
  syncFrameLayoutSoon();
  refreshRuntimePromptStatus('脚本启动', readState(true));
  void cleanupLegacyRuntimeWorldbookEntries(lastLegacyWorldbookName ?? undefined);
  queueSync('脚本启动', false, 100);

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    stopHandles.forEach(stop => stop());
    stopStateListener();
    clearSyncTimers();
    endFrameDrag();
    uninjectPrompts([RUNTIME_PROMPT_ID]);
    app?.unmount();
    destroyStyleTeleport?.();
    $frame.off(PAGE_SCOPE);
    $frame.remove();
    $hostWindow.off(PAGE_SCOPE);
    hostVisualViewport?.removeEventListener('resize', syncFrameLayoutSoon);
    hostVisualViewport?.removeEventListener('scroll', syncFrameLayoutSoon);
    $(window).off(PAGE_SCOPE);
  };

  $hostWindow.on(`pagehide${PAGE_SCOPE}`, cleanup);
  if (hostWindow !== window) {
    $(window).on(`pagehide${PAGE_SCOPE}`, cleanup);
  }

  console.info('[xinjingwan-story-director] mounted.');
}

$(() => {
  errorCatched(mountXinjingwanStoryDirector)();
});
