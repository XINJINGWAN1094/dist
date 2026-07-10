import { createScriptIdIframe, teleportStyle } from '@util/script';
import { createApp, type App as VueApp } from 'vue';
import StoryDirectorApp from './App.vue';
import { emitStateChanged, onStateChanged, patchState, readState } from './state';
import { SCRIPT_BUTTON_NAME } from './types';
import {
  clearSyncTimers,
  disableScriptEntriesInWorldbook,
  queueSync,
  queueSyncSeries,
  resetSyncContextForCurrentChat,
} from './sync';

const PAGE_SCOPE = '.thXinjingwanStoryDirector';
const FRAME_ID = 'xinjingwan-story-director-frame';
const ROOT_ID = 'xinjingwan-story-director-root';
const FRAME_Z_INDEX = 2147483021;
const MOBILE_BREAKPOINT = 640;

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
  readState(true);

  const hostWindow = resolveHostWindow();
  const hostDocument = hostWindow.document;
  const $hostWindow = $(hostWindow);
  const hostVisualViewport = hostWindow.visualViewport;

  let app: VueApp<Element> | null = null;
  let destroyStyleTeleport: (() => void) | null = null;
  let cleanedUp = false;
  let currentChatId = getCurrentChatIdSafely();
  let lastTargetWorldbookName = readState(false).targetWorldbookName;

  const $frame = createScriptIdIframe()
    .attr({
      id: FRAME_ID,
      title: '新景湾剧情指导',
    })
    .css({
      position: 'fixed',
      right: '20px',
      bottom: '74px',
      width: '760px',
      height: '720px',
      maxWidth: 'calc(100vw - 40px)',
      maxHeight: 'calc(100vh - 96px)',
      border: '0',
      zIndex: String(FRAME_Z_INDEX),
      display: 'none',
      background: 'transparent',
    })
    .appendTo(hostDocument.body);

  const syncFrameLayout = () => {
    const state = readState(false);
    lastTargetWorldbookName = state.targetWorldbookName;
    const visible = state.ui.visible;
    const viewportWidth = Math.max(hostVisualViewport?.width ?? hostWindow.innerWidth, 1);
    const viewportHeight = Math.max(hostVisualViewport?.height ?? hostWindow.innerHeight, 1);
    const mobile = viewportWidth <= MOBILE_BREAKPOINT;
    const viewportOffsetLeft = hostVisualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = hostVisualViewport?.offsetTop ?? 0;
    const width = mobile ? Math.max(viewportWidth - 16, 1) : Math.min(760, viewportWidth - 40);
    const height = mobile ? Math.max(viewportHeight - 16, 1) : Math.min(720, viewportHeight - 96);

    $frame.css({
      left: mobile ? `${viewportOffsetLeft + 8}px` : 'auto',
      top: mobile ? `${viewportOffsetTop + 8}px` : 'auto',
      right: mobile ? 'auto' : '20px',
      bottom: mobile ? 'auto' : '74px',
      display: visible ? 'block' : 'none',
      width: `${Math.max(width, mobile ? 1 : 280)}px`,
      height: `${Math.max(height, mobile ? 1 : 58)}px`,
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

    const previousChatId = currentChatId;
    const previousTarget = lastTargetWorldbookName;
    currentChatId = nextChatId;
    resetSyncContextForCurrentChat();

    if (previousTarget) {
      await disableScriptEntriesInWorldbook(previousTarget, previousChatId).catch(error => {
        console.warn('[xinjingwan-story-director] failed to disable previous chat entries:', error);
      });
    }

    if (currentChatId !== getCurrentChatIdSafely()) {
      return;
    }

    const nextState = readState(true);
    lastTargetWorldbookName = nextState.targetWorldbookName;
    emitStateChanged(nextState);
    syncFrameLayoutSoon();
    queueSync(reason, false, 0);
    queueSyncSeries(reason);
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
      errorCatched(() => queueSyncSeries('消息接收')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_UPDATED,
      errorCatched(() => queueSyncSeries('消息更新')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_EDITED,
      errorCatched(() => queueSyncSeries('消息编辑')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_DELETED,
      errorCatched(() => queueSyncSeries('消息删除')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_SWIPED,
      errorCatched(() => queueSyncSeries('消息 swipe 切换')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_SWIPE_DELETED,
      errorCatched(() => queueSyncSeries('消息 swipe 删除')),
    ).stop,
    eventOn(
      tavern_events.GENERATION_STARTED,
      errorCatched(() => queueSync('生成开始', false, 0)),
    ).stop,
    eventOn(
      tavern_events.GENERATION_ENDED,
      errorCatched(() => queueSyncSeries('生成结束')),
    ).stop,
    eventOn(
      tavern_events.GENERATION_STOPPED,
      errorCatched(() => queueSyncSeries('生成停止')),
    ).stop,
  ];

  $frame.on(`load${PAGE_SCOPE}`, mountVueOnFrame);
  $hostWindow.on(`resize${PAGE_SCOPE}`, syncFrameLayoutSoon);
  hostVisualViewport?.addEventListener('resize', syncFrameLayoutSoon);
  hostVisualViewport?.addEventListener('scroll', syncFrameLayoutSoon);
  _.delay(mountVueOnFrame, 16);
  syncFrameLayoutSoon();
  queueSync('脚本启动', false, 100);

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    stopHandles.forEach(stop => stop());
    stopStateListener();
    clearSyncTimers();
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
