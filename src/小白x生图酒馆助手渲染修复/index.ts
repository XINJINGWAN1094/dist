(() => {
  const ROOT = (() => {
    try {
      return window.top || window.parent || window;
    } catch (_error) {
      return window;
    }
  })() as Window & Record<string, any>;

  const PATCH_FLAG = '__xbNovelDrawTavernHelperRenderFix20260625';
  const PATCH_VERSION = 1;
  const LOG_PREFIX = '[小白x生图渲染修复]';
  const IMAGE_PLACEHOLDER_PATTERN = /\[image:([a-z0-9_-]+)\]/gi;
  const TAVERN_HELPER_RENDER_HINTS = [
    /<status!>[\s\S]*?<\/status!>/i,
    /```(?:html|htm|xml|svg|vue|svelte|tsx?|jsx?|css|scss)\b/i,
    /<\s*(?:html|body|script|style|template|div|section|article|main|canvas|svg|iframe)\b/i,
    /\bTavernHelper\b|酒馆助手/i,
  ];
  const REPAIR_DEBOUNCE_MS = 700;
  const REPAIR_COOLDOWN_MS = 1500;

  type RootState = {
    version: number;
    installed: boolean;
    cleanup?: () => void;
  };

  ROOT[PATCH_FLAG]?.cleanup?.();
  ROOT[PATCH_FLAG] = { version: PATCH_VERSION, installed: false } satisfies RootState;

  const getHostDocument = () => ROOT.document;

  const expectedFrameCountByMessageId = new Map<number, number>();
  const pendingTimers = new Map<number, number>();
  const repairingMessageIds = new Set<number>();
  const lastRepairTimeByMessageId = new Map<number, number>();

  let observer: MutationObserver | null = null;
  const eventStops: Array<{ stop: () => void }> = [];

  function delay(ms: number) {
    return new Promise(resolve => ROOT.setTimeout(resolve, ms));
  }

  function getApi<T extends (...args: any[]) => any>(name: string): T | null {
    const candidates = [window, window.parent, window.top, ROOT];
    for (const candidate of candidates) {
      try {
        if (!candidate) {
          continue;
        }
        if (typeof (candidate as any)[name] === 'function') {
          return (candidate as any)[name].bind(candidate) as T;
        }
        if (typeof (candidate as any).TavernHelper?.[name] === 'function') {
          return (candidate as any).TavernHelper[name].bind((candidate as any).TavernHelper) as T;
        }
      } catch (_error) {
        // Keep looking through the same-origin windows we can access.
      }
    }
    return null;
  }

  function parseMessageId(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
  }

  function getMessageElement(messageId: number): HTMLElement | null {
    return getHostDocument().querySelector(`#chat .mes[mesid="${messageId}"]`);
  }

  function getMessageTextElement(messageId: number): HTMLElement | null {
    return getMessageElement(messageId)?.querySelector('.mes_text') ?? null;
  }

  function getClosestMessageId(node: Node | null): number | null {
    if (!node) {
      return null;
    }
    const element = (node.nodeType === 1 ? node : node.parentElement) as Element | null;
    const messageElement = element?.closest?.('#chat .mes[mesid]');
    return parseMessageId(messageElement?.getAttribute('mesid'));
  }

  function countTavernHelperFrames(messageId: number) {
    return getMessageTextElement(messageId)?.querySelectorAll(`iframe[id^="TH-message--${messageId}--"]`).length ?? 0;
  }

  function rememberFrameState(messageId: number) {
    const frameCount = countTavernHelperFrames(messageId);
    if (frameCount > 0) {
      expectedFrameCountByMessageId.set(messageId, frameCount);
    }
  }

  function getRawMessageText(messageId: number) {
    const getChatMessages = getApi<(range: number) => Array<{ message?: string }>>('getChatMessages');
    try {
      const helperMessage = getChatMessages?.(messageId)?.[0]?.message;
      if (typeof helperMessage === 'string') {
        return helperMessage;
      }
    } catch (_error) {
      // Fall back to SillyTavern's raw chat object below.
    }

    try {
      return String(ROOT.SillyTavern?.getContext?.()?.chat?.[messageId]?.mes ?? '');
    } catch (_error) {
      return '';
    }
  }

  function getImageSlotIds(messageId: number) {
    const rawMessage = getRawMessageText(messageId);
    const slotIds = new Set<string>();
    let match: RegExpExecArray | null;
    IMAGE_PLACEHOLDER_PATTERN.lastIndex = 0;
    while ((match = IMAGE_PLACEHOLDER_PATTERN.exec(rawMessage))) {
      slotIds.add(match[1]);
    }
    return slotIds;
  }

  function messageHasImageSlots(messageId: number) {
    return getImageSlotIds(messageId).size > 0;
  }

  function messageLooksLikeTavernHelperRender(messageId: number) {
    if ((expectedFrameCountByMessageId.get(messageId) ?? 0) > 0) {
      return true;
    }
    const rawMessage = getRawMessageText(messageId);
    return TAVERN_HELPER_RENDER_HINTS.some(pattern => pattern.test(rawMessage));
  }

  function collectRenderedImageHtml(messageId: number) {
    const htmlBySlotId = new Map<string, string>();
    getMessageTextElement(messageId)
      ?.querySelectorAll<HTMLElement>('.xb-nd-img[data-slot-id]')
      .forEach(element => {
        const slotId = element.dataset.slotId;
        if (slotId) {
          htmlBySlotId.set(slotId, element.outerHTML);
        }
      });
    return htmlBySlotId;
  }

  function hasRenderedImageForSlot(root: HTMLElement, slotId: string) {
    return Array.from(root.querySelectorAll<HTMLElement>('.xb-nd-img[data-slot-id]')).some(
      element => element.dataset.slotId === slotId,
    );
  }

  function elementFromHtml(html: string) {
    const template = getHostDocument().createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function replaceTextPlaceholder(root: HTMLElement, placeholder: string, html: string) {
    const textNodes: Text[] = [];
    const walker = getHostDocument().createTreeWalker(root, 4, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent || parent.closest('.xb-nd-img, script, style, textarea')) {
          return 2;
        }
        return node.nodeValue?.includes(placeholder) ? 1 : 3;
      },
    });

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    let replaced = 0;
    for (const node of textNodes) {
      const parts = String(node.nodeValue ?? '').split(placeholder);
      if (parts.length <= 1) {
        continue;
      }

      const fragment = getHostDocument().createDocumentFragment();
      parts.forEach((part, index) => {
        if (part) {
          fragment.appendChild(getHostDocument().createTextNode(part));
        }
        if (index < parts.length - 1) {
          const element = elementFromHtml(html);
          if (element) {
            fragment.appendChild(element);
          }
        }
      });
      node.parentNode?.replaceChild(fragment, node);
      replaced += parts.length - 1;
    }
    return replaced;
  }

  function restoreCachedImages(messageId: number, cachedImageHtml: Map<string, string>) {
    const messageTextElement = getMessageTextElement(messageId);
    if (!messageTextElement) {
      return 0;
    }

    let replaced = 0;
    for (const slotId of getImageSlotIds(messageId)) {
      if (hasRenderedImageForSlot(messageTextElement, slotId)) {
        continue;
      }
      const html = cachedImageHtml.get(slotId);
      if (!html) {
        continue;
      }
      replaced += replaceTextPlaceholder(messageTextElement, `[image:${slotId}]`, html);
    }
    return replaced;
  }

  async function repairMessage(messageId: number, reason: string) {
    const refreshOneMessage = getApi<(messageId: number) => Promise<void>>('refreshOneMessage');
    if (!refreshOneMessage) {
      console.warn(LOG_PREFIX, '未找到 refreshOneMessage，无法自动修复楼层渲染');
      return;
    }

    const cachedImageHtml = collectRenderedImageHtml(messageId);
    repairingMessageIds.add(messageId);
    lastRepairTimeByMessageId.set(messageId, Date.now());

    try {
      await refreshOneMessage(messageId);
      await delay(500);

      const fallbackRestored = restoreCachedImages(messageId, cachedImageHtml);
      rememberFrameState(messageId);

      console.info(LOG_PREFIX, `已刷新第 ${messageId} 楼显示`, {
        reason,
        tavernHelperFrames: countTavernHelperFrames(messageId),
        fallbackRestored,
      });
    } catch (error) {
      console.warn(LOG_PREFIX, `刷新第 ${messageId} 楼显示失败`, error);
    } finally {
      repairingMessageIds.delete(messageId);
    }
  }

  async function repairIfNeeded(messageId: number, reason: string) {
    pendingTimers.delete(messageId);
    if (repairingMessageIds.has(messageId) || !messageHasImageSlots(messageId)) {
      rememberFrameState(messageId);
      return;
    }

    const messageTextElement = getMessageTextElement(messageId);
    if (!messageTextElement) {
      return;
    }

    const currentFrameCount = countTavernHelperFrames(messageId);
    if (currentFrameCount > 0) {
      rememberFrameState(messageId);
      return;
    }

    const expectedFrameCount = expectedFrameCountByMessageId.get(messageId) ?? 0;
    const hasRenderedNovelDrawImage = Boolean(messageTextElement.querySelector('.xb-nd-img[data-slot-id]'));
    const hasRawImagePlaceholder = /\[image:[a-z0-9_-]+\]/i.test(messageTextElement.textContent ?? '');
    const shouldRepair =
      (expectedFrameCount > 0 || messageLooksLikeTavernHelperRender(messageId)) &&
      (hasRenderedNovelDrawImage || hasRawImagePlaceholder);
    if (!shouldRepair) {
      return;
    }

    const lastRepairTime = lastRepairTimeByMessageId.get(messageId) ?? 0;
    if (Date.now() - lastRepairTime < REPAIR_COOLDOWN_MS) {
      return;
    }

    await repairMessage(messageId, reason);
  }

  function scheduleRepairCheck(messageId: number, reason: string) {
    rememberFrameState(messageId);
    const existingTimer = pendingTimers.get(messageId);
    if (existingTimer !== undefined) {
      ROOT.clearTimeout(existingTimer);
    }
    const timer = ROOT.setTimeout(() => {
      void repairIfNeeded(messageId, reason);
    }, REPAIR_DEBOUNCE_MS);
    pendingTimers.set(messageId, timer);
  }

  function handleRenderedMessage(messageId: number) {
    ROOT.setTimeout(() => {
      rememberFrameState(messageId);
      if (messageHasImageSlots(messageId)) {
        scheduleRepairCheck(messageId, 'message-rendered');
      }
    }, 250);
  }

  function collectMutationMessageIds(mutations: MutationRecord[]) {
    const messageIds = new Set<number>();
    for (const mutation of mutations) {
      const targetMessageId = getClosestMessageId(mutation.target);
      if (targetMessageId !== null) {
        messageIds.add(targetMessageId);
      }

      mutation.addedNodes.forEach(node => {
        const messageId = getClosestMessageId(node);
        if (messageId !== null) {
          messageIds.add(messageId);
        }
      });
      mutation.removedNodes.forEach(node => {
        const messageId = getClosestMessageId(node);
        if (messageId !== null) {
          messageIds.add(messageId);
        }
      });
    }
    return messageIds;
  }

  function startObserver() {
    const chatElement = getHostDocument().querySelector('#chat');
    if (!chatElement) {
      ROOT.setTimeout(startObserver, 1000);
      return;
    }

    observer = new ROOT.MutationObserver(mutations => {
      for (const messageId of collectMutationMessageIds(mutations)) {
        if (messageHasImageSlots(messageId)) {
          scheduleRepairCheck(messageId, 'dom-mutated');
        } else {
          rememberFrameState(messageId);
        }
      }
    });
    observer.observe(chatElement, { childList: true, subtree: true });
  }

  function scanVisibleMessages() {
    getHostDocument()
      .querySelectorAll<HTMLElement>('#chat .mes[mesid]')
      .forEach(messageElement => {
        const messageId = parseMessageId(messageElement.getAttribute('mesid'));
        if (messageId === null) {
          return;
        }
        rememberFrameState(messageId);
        if (messageHasImageSlots(messageId)) {
          scheduleRepairCheck(messageId, 'initial-scan');
        }
      });
  }

  function cleanup() {
    observer?.disconnect();
    observer = null;
    eventStops.forEach(stopHandle => stopHandle.stop());
    eventStops.length = 0;
    pendingTimers.forEach(timer => ROOT.clearTimeout(timer));
    pendingTimers.clear();
    repairingMessageIds.clear();
    ROOT[PATCH_FLAG] = { version: PATCH_VERSION, installed: false };
  }

  function init() {
    try {
      startObserver();
      scanVisibleMessages();

      if (typeof eventOn === 'function' && typeof tavern_events === 'object') {
        eventStops.push(eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, handleRenderedMessage));
        eventStops.push(eventOn(tavern_events.USER_MESSAGE_RENDERED, handleRenderedMessage));
        eventStops.push(eventOn(tavern_events.MESSAGE_UPDATED, handleRenderedMessage));
        eventStops.push(eventOn(tavern_events.MESSAGE_EDITED, handleRenderedMessage));
        eventStops.push(
          eventOn(tavern_events.CHAT_CHANGED, () => {
            expectedFrameCountByMessageId.clear();
            ROOT.setTimeout(scanVisibleMessages, 500);
          }),
        );
      }

      ROOT[PATCH_FLAG] = { version: PATCH_VERSION, installed: true, cleanup } satisfies RootState;
      window.addEventListener('pagehide', cleanup, { once: true });
      console.info(LOG_PREFIX, '已加载');
    } catch (error) {
      ROOT[PATCH_FLAG] = { version: PATCH_VERSION, installed: false, cleanup } satisfies RootState;
      console.warn(LOG_PREFIX, '初始化失败', error);
    }
  }

  const runner = () => {
    const safeInit = typeof errorCatched === 'function' ? errorCatched(init) : init;
    Promise.resolve(safeInit()).catch(error => console.warn(LOG_PREFIX, '初始化失败', error));
  };

  if (typeof $ === 'function') {
    $(runner);
  } else {
    ROOT.setTimeout(runner, 0);
  }
})();
