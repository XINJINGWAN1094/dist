(() => {
  const PATCH_FLAG = '__xieguGuPopupFallback20260616';
  if ((window as any)[PATCH_FLAG]) {
    return;
  }
  (window as any)[PATCH_FLAG] = true;

  const LOG_PREFIX = '[邪蛊志下蛊弹窗修复]';
  const VALID_JILE_GU = ['一阶子蛊·缠丝', '二阶子蛊·噬脉', '三阶子蛊·迷心', '本命真血子蛊'];
  const UNGUARDED_WORDS = [
    '重伤',
    '濒死',
    '昏迷',
    '昏过去',
    '晕过去',
    '晕厥',
    '不省人事',
    '睡眠',
    '迷药',
    '媚药',
    '药力',
    '神志不清',
    '理智受损',
    '心智崩溃',
    '穴道被制',
    '被制住大穴',
    '行动受制',
    '失去行动能力',
    '无法行动',
    '被束缚',
  ];

  type XieguTask = {
    source: 'explicit' | 'narrative';
    targetName: string;
    guName: string;
    plotModifier: string;
  };

  function getHelper() {
    return (window as any).TavernHelper || (window.parent as any)?.TavernHelper || (window.top as any)?.TavernHelper;
  }

  function cloneData<T>(value: T): T {
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch (_error) {
      // Fall through to JSON clone.
    }
    return JSON.parse(JSON.stringify(value));
  }

  function hashText(text: string) {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return String(hash >>> 0);
  }

  function uniqueWindows(): Window[] {
    const candidates = [window, window.parent, window.top].filter(Boolean) as Window[];
    return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
  }

  function getStatusbarFrames() {
    const frames: { win: Window; doc: Document }[] = [];
    for (const hostWindow of uniqueWindows()) {
      try {
        const hostDocument = hostWindow.document;
        if (!hostDocument) {
          continue;
        }
        if (hostDocument.querySelector?.('#gu-alert-modal') || (hostWindow as any).__xieguStatusbar) {
          frames.push({ win: hostWindow, doc: hostDocument });
        }
        hostDocument.querySelectorAll?.('iframe').forEach(iframe => {
          try {
            const frameWindow = iframe.contentWindow;
            const frameDocument = iframe.contentDocument;
            if (!frameWindow || !frameDocument) {
              return;
            }
            const title = frameDocument.querySelector('.top-title')?.textContent?.trim();
            const isXieguStatusbar =
              title === '邪蛊志' ||
              Boolean((frameWindow as any).__xieguStatusbar) ||
              Boolean(frameDocument.querySelector('#gu-alert-modal'));
            if (isXieguStatusbar) {
              frames.push({ win: frameWindow, doc: frameDocument });
            }
          } catch (_error) {
            // Ignore inaccessible frames.
          }
        });
      } catch (_error) {
        // Ignore inaccessible windows.
      }
    }
    return frames;
  }

  function getLatestStatusbarFrame() {
    const frames = getStatusbarFrames();
    return frames[frames.length - 1];
  }

  function hasActiveGuModal() {
    return getStatusbarFrames().some(frame => {
      try {
        return Boolean(frame.doc.querySelector('#gu-alert-modal.active, #gu-result-modal.active'));
      } catch (_error) {
        return false;
      }
    });
  }

  function showFallbackNotice(targetName: string, guName: string) {
    const frame = getLatestStatusbarFrame();
    if (!frame) {
      return false;
    }
    const notice = frame.doc.createElement('div');
    notice.textContent = `检测到${targetName}已满足下蛊条件，但当前状态栏接口不可用。请手动点击【下蛊】并选择${guName}。`;
    notice.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;max-width:88%;padding:10px 14px;border:1px solid rgba(192,154,48,.45);border-radius:8px;background:rgba(25,20,18,.96);color:#f4dfaa;font-size:12px;line-height:1.6;box-shadow:0 8px 24px rgba(0,0,0,.35);';
    frame.doc.body.appendChild(notice);
    setTimeout(() => notice.remove(), 5000);
    return true;
  }

  function findTargetRecord(stat: any, targetName: string) {
    if (!stat || !targetName) {
      return null;
    }
    return stat.绝色群芳?.[targetName] || stat.额外群芳?.[targetName] || null;
  }

  function isAlreadyPlanted(stat: any, targetName: string) {
    return Boolean(findTargetRecord(stat, targetName)?.已种下极乐子蛊);
  }

  function getCandidateNames(stat: any) {
    return [...Object.keys(stat?.绝色群芳 || {}), ...Object.keys(stat?.额外群芳 || {})];
  }

  function inferTargetName(messageContent: string, stat: any) {
    const content = String(messageContent || '');
    const allNames = getCandidateNames(stat).filter(name => content.includes(name) && !isAlreadyPlanted(stat, name));
    return allNames.length === 1 ? allNames[0] : null;
  }

  function inferGuName(messageContent: string, stat: any) {
    const content = String(messageContent || '');
    const mentioned = VALID_JILE_GU.find(name => content.includes(name));
    if (mentioned) {
      return mentioned;
    }

    const guBag = stat?.主角?.蛊 || {};
    return VALID_JILE_GU.find(name => Number(guBag[name]?.数量 || 0) > 0) || null;
  }

  function inferPlotModifier(messageContent: string) {
    const content = String(messageContent || '');
    if (/(重伤|濒死|不省人事|昏迷|昏过去|晕过去|晕厥|失去行动能力|无法行动)/.test(content)) {
      return '50';
    }
    if (/(迷药|媚药|药力|神志不清|理智受损|心智崩溃)/.test(content)) {
      return '40';
    }
    return '25';
  }

  function hasUnguardedContext(text: string) {
    const content = String(text || '');
    return UNGUARDED_WORDS.some(word => content.includes(word));
  }

  function normalizeTargetForCheck(stat: any, targetName: string, messageContent: string, plotModifier: string) {
    const target = findTargetRecord(stat, targetName);
    if (!target) {
      return;
    }

    const source = `${target.性别 || ''} ${target.身份 || ''}`;
    const acceptedByStatusbar =
      source.includes('女') ||
      source.includes('外室') ||
      source.includes('侍妾') ||
      source.includes('炉鼎');
    const hasFemaleSignal =
      acceptedByStatusbar ||
      Boolean(target.性器状态?.阴部) ||
      Boolean(target.性器状态?.子宫) ||
      /她|少女|女人|姑娘|女子|女/.test(String(messageContent || ''));
    if (hasFemaleSignal && !acceptedByStatusbar) {
      target.性别 = '女';
    }

    const stateText = JSON.stringify(target);
    const shouldMarkUnguarded = hasUnguardedContext(`${messageContent}\n${plotModifier}`) || Number(plotModifier) > 0;
    const alreadyUnguarded = UNGUARDED_WORDS.some(word => stateText.includes(word));
    if (shouldMarkUnguarded && !alreadyUnguarded) {
      target.状态 = target.状态 && target.状态 !== '正常' ? `${target.状态}，失去行动能力` : '昏迷';
    }
  }

  function parseExplicitCommand(messageContent: string): XieguTask | null {
    const content = String(messageContent || '');
    const match = content.match(/\[触发下蛊：([^\]|]+)\|([^\]|]+)\|([^\]]+)\]/);
    if (!match) {
      return null;
    }
    return {
      source: 'explicit',
      targetName: match[1].trim(),
      guName: match[2].trim(),
      plotModifier: match[3].trim(),
    };
  }

  function inferNarrativeCommand(messageContent: string, stat: any): XieguTask | null {
    const content = String(messageContent || '');
    const hasPlantingAction = /(下蛊|种蛊|子蛊|蛊虫|蛊入体|植入|渡入|爬了进去|丹田|蛰伏|成了)/.test(content);
    const hasCompletionSignal = /(入体|植入|渡入|爬了进去|丹田|蛰伏|成了|成功|下蛊|种蛊)/.test(content);
    if (!hasPlantingAction || !hasCompletionSignal) {
      return null;
    }

    const targetName = inferTargetName(content, stat);
    const guName = inferGuName(content, stat);
    if (!targetName || !guName || isAlreadyPlanted(stat, targetName)) {
      return null;
    }

    return {
      source: 'narrative',
      targetName,
      guName,
      plotModifier: inferPlotModifier(content),
    };
  }

  function buildTask(messageContent: string, stat: any) {
    return parseExplicitCommand(messageContent) || inferNarrativeCommand(messageContent, stat);
  }

  async function runTask(task: XieguTask | null, vars: any, messageContent: string, messageId: number | 'latest') {
    if (!task || hasActiveGuModal()) {
      return false;
    }

    const stat = cloneData(vars?.stat_data || vars || {});
    normalizeTargetForCheck(stat, task.targetName, messageContent, task.plotModifier);

    const key = `${PATCH_FLAG}:${messageId}:${task.targetName}:${task.guName}:${hashText(String(messageContent || ''))}`;
    try {
      if (sessionStorage.getItem(key)) {
        return false;
      }
    } catch (_error) {
      // Session storage can be unavailable in hardened browser modes.
    }

    const frame = getLatestStatusbarFrame();
    const statusbar = (frame?.win as any)?.__xieguStatusbar;
    if (statusbar?.prepareGuPlanting) {
      try {
        await statusbar.prepareGuPlanting(stat, task.targetName, task.guName, task.plotModifier);
        try {
          sessionStorage.setItem(key, '1');
        } catch (_error) {
          // Ignore storage failures.
        }
        console.info(LOG_PREFIX, `已触发${task.source === 'explicit' ? '显式' : '叙述'}下蛊弹窗`, task);
        return true;
      } catch (error) {
        console.warn(LOG_PREFIX, '调用状态栏下蛊判定失败，改用兜底提示', error);
      }
    }

    const displayed = showFallbackNotice(task.targetName, task.guName);
    if (displayed) {
      try {
        sessionStorage.setItem(key, '1');
      } catch (_error) {
        // Ignore storage failures.
      }
    }
    return displayed;
  }

  async function inspectMessage(vars: any, messageContent: string, messageId: number | 'latest') {
    const stat = vars?.stat_data || vars;
    if (!stat) {
      return false;
    }
    const task = buildTask(messageContent, stat);
    if (!task) {
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, 180));
    if (hasActiveGuModal()) {
      return false;
    }
    return runTask(task, vars, messageContent, messageId);
  }

  async function inspectLatestMessage() {
    const helper = getHelper();
    if (!helper?.getLastMessageId || !helper?.getChatMessages || !helper?.getVariables) {
      return false;
    }

    const messageId = helper.getLastMessageId();
    const message = helper.getChatMessages(messageId)?.[0];
    if (!message?.message || message.is_user) {
      return false;
    }

    const vars = helper.getVariables({ type: 'message', message_id: messageId });
    return inspectMessage(vars, message.message, messageId);
  }

  async function waitForMvuEvents(timeout = 3000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (typeof eventOn === 'function' && (window as any).Mvu?.events?.COMMAND_PARSED) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  async function init() {
    console.info(LOG_PREFIX, '已加载');
    await inspectLatestMessage();

    if (await waitForMvuEvents()) {
      eventOn((window as any).Mvu.events.COMMAND_PARSED, (vars: any, _commands: any, messageContent: string) => {
        const helper = getHelper();
        const messageId = helper?.getLastMessageId?.() ?? 'latest';
        inspectMessage(vars, messageContent, messageId);
      });
    } else {
      console.warn(LOG_PREFIX, '未找到 MVU COMMAND_PARSED 事件，启用轮询兜底');
    }

    setInterval(() => {
      inspectLatestMessage();
    }, 2500);
  }

  const runner = () => {
    const safeInit = typeof errorCatched === 'function' ? errorCatched(init) : init;
    Promise.resolve(safeInit()).catch(error => console.warn(LOG_PREFIX, '初始化失败', error));
  };

  if (typeof $ === 'function') {
    $(runner);
  } else {
    setTimeout(runner, 0);
  }
})();

(() => {
  const ROOT = (() => {
    try {
      return window.top || window.parent || window;
    } catch (_error) {
      return window;
    }
  })() as Window & Record<string, any>;
  const PATCH_FLAG = '__xieguGuAcceptRecovery20260618';
  const PATCH_VERSION = 2;
  if (ROOT[PATCH_FLAG]?.version === PATCH_VERSION && ROOT[PATCH_FLAG]?.installed) {
    return;
  }
  ROOT[PATCH_FLAG] = { version: PATCH_VERSION, installed: false };

  const LOG_PREFIX = '[邪蛊志下蛊裁决修复]';
  const STORAGE_KEY = `${PATCH_FLAG}:pendingTask`;
  const ROLL_FLAG = `${PATCH_FLAG}:rollPatched`;
  const CONFIRM_FLAG = `${PATCH_FLAG}:confirmPatched`;
  const CLICK_FLAG = `${PATCH_FLAG}:clickPatched`;
  const ACCEPT_BUTTON_RE = /接受裁决|确认裁决|应用裁决/;
  const TASK_TTL = 10 * 60 * 1000;
  const readonlyPrepareStatusbars = new WeakSet<object>();

  type PendingTask = {
    targetName?: string;
    guName?: string;
    plotModifier?: string;
    finalRate?: number | string | null;
    roll?: number | string | null;
    isSuccess?: boolean;
    messageId?: number | 'latest';
    guCountBefore?: number | string | null;
    contextLabel?: string;
    resultText?: string;
    updatedAt?: number;
    key?: string;
  };
  type StatusbarFrame = { win: Window & Record<string, any>; doc: Document; iframe: HTMLIFrameElement | null; messageId: number | 'latest' };

  function uniqueWindows(): (Window & Record<string, any>)[] {
    const candidates: (Window & Record<string, any>)[] = [];
    for (const candidate of [window, window.parent, window.top, ROOT]) {
      try {
        if (candidate && !candidates.includes(candidate as Window & Record<string, any>)) {
          candidates.push(candidate as Window & Record<string, any>);
        }
      } catch (_error) {
        // Ignore windows we cannot touch.
      }
    }
    return candidates;
  }

  function getApi<T extends (...args: any[]) => any>(name: string): T | null {
    for (const candidate of uniqueWindows()) {
      try {
        if (typeof candidate[name] === 'function') {
          return candidate[name].bind(candidate);
        }
        if (candidate.TavernHelper && typeof candidate.TavernHelper[name] === 'function') {
          return candidate.TavernHelper[name].bind(candidate.TavernHelper);
        }
      } catch (_error) {
        // Continue with the next visible window.
      }
    }
    return null;
  }

  function toFiniteNumber(value: any, fallback: any = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cloneData<T>(value: T): T {
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch (_error) {
      // Fall through to JSON clone.
    }
    return JSON.parse(JSON.stringify(value));
  }

  function getSharedState() {
    ROOT.__xieguGuAcceptRecoveryState ||= {};
    return ROOT.__xieguGuAcceptRecoveryState;
  }

  function normalizeMessageId(messageId: any): number | 'latest' {
    if (messageId === 'latest') {
      return 'latest';
    }
    const number = toFiniteNumber(messageId);
    return number === null ? 'latest' : number;
  }

  function getMessageOption(messageId: any) {
    return { type: 'message', message_id: normalizeMessageId(messageId) };
  }

  function normalizeTask(task: PendingTask | null | undefined): PendingTask | null {
    if (!task || typeof task !== 'object') {
      return null;
    }
    const next: PendingTask = { ...task };
    next.targetName = typeof next.targetName === 'string' ? next.targetName.trim() : next.targetName;
    next.guName = typeof next.guName === 'string' ? next.guName.trim() : next.guName;
    next.messageId = normalizeMessageId(next.messageId);
    next.finalRate = toFiniteNumber(next.finalRate, next.finalRate);
    next.roll = toFiniteNumber(next.roll, next.roll);
    next.guCountBefore = toFiniteNumber(next.guCountBefore, next.guCountBefore);
    if (!next.targetName && !next.guName && next.roll === undefined && next.finalRate === undefined) {
      return null;
    }
    next.updatedAt = Date.now();
    next.key ||= [next.messageId, next.targetName || '', next.guName || '', next.roll || '', next.finalRate || ''].join('|');
    return next;
  }

  function loadTask(allowStorage = true): PendingTask | null {
    const shared = getSharedState();
    let task = shared.pendingTask as PendingTask | null;
    if (!task && allowStorage) {
      try {
        task = JSON.parse(ROOT.sessionStorage?.getItem(STORAGE_KEY) || 'null');
      } catch (_error) {
        task = null;
      }
    }
    if (!task || (task.updatedAt && Date.now() - task.updatedAt > TASK_TTL)) {
      return null;
    }
    return task;
  }

  function rememberTask(task: PendingTask | null | undefined): PendingTask | null {
    const normalized = normalizeTask(task);
    if (!normalized) {
      return loadTask();
    }
    const previous = loadTask() || {};
    const next = { ...previous, ...normalized, updatedAt: Date.now() };
    getSharedState().pendingTask = next;
    try {
      ROOT.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_error) {
      // Storage can be disabled; in-memory state is enough for this page life.
    }
    return next;
  }

  function getFrameMessageId(iframe: HTMLIFrameElement | null) {
    const id = iframe?.id || '';
    const match = id.match(/TH-message--(-?\d+)--/);
    if (match) {
      return Number(match[1]);
    }
    const getLastMessageId = getApi<() => any>('getLastMessageId');
    return normalizeMessageId(getLastMessageId?.());
  }

  function isXieguStatusbar(win: Window & Record<string, any>, doc: Document) {
    try {
      const title = doc.querySelector('.top-title')?.textContent?.trim();
      return (
        title === '邪蛊志' ||
        Boolean(win.__xieguStatusbar) ||
        Boolean(doc.querySelector('#gu-alert-modal, #gu-result-modal, #gu-result-content'))
      );
    } catch (_error) {
      return false;
    }
  }

  function getStatusbarFrames(): StatusbarFrame[] {
    const frames: StatusbarFrame[] = [];
    const seen = new Set<Window>();
    for (const hostWindow of uniqueWindows()) {
      try {
        const hostDocument = hostWindow.document;
        if (!hostDocument) {
          continue;
        }
        if (isXieguStatusbar(hostWindow, hostDocument) && !seen.has(hostWindow)) {
          seen.add(hostWindow);
          frames.push({
            win: hostWindow,
            doc: hostDocument,
            iframe: null,
            messageId: normalizeMessageId(getApi<() => any>('getLastMessageId')?.()),
          });
        }
        hostDocument.querySelectorAll('iframe').forEach(iframe => {
          try {
            const frameWindow = iframe.contentWindow as (Window & Record<string, any>) | null;
            const frameDocument = iframe.contentDocument;
            if (!frameWindow || !frameDocument || seen.has(frameWindow) || !isXieguStatusbar(frameWindow, frameDocument)) {
              return;
            }
            seen.add(frameWindow);
            frames.push({
              win: frameWindow,
              doc: frameDocument,
              iframe,
              messageId: getFrameMessageId(iframe),
            });
          } catch (_error) {
            // Some iframe may be inaccessible while it is being replaced.
          }
        });
      } catch (_error) {
        // Continue with the next window.
      }
    }
    return frames.sort((left, right) => Number(left.messageId || -1) - Number(right.messageId || -1));
  }

  function getLatestFrame() {
    const frames = getStatusbarFrames();
    return frames[frames.length - 1] || null;
  }

  function cleanText(value: any) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function readText(doc: Document, selector: string) {
    return cleanText(doc.querySelector(selector)?.textContent || '');
  }

  function parsePercent(text: string) {
    return toFiniteNumber(String(text || '').match(/(-?\d+(?:\.\d+)?)\s*%/)?.[1]);
  }

  function readAlertTask(frame: StatusbarFrame | null) {
    const doc = frame?.doc;
    if (!doc) {
      return null;
    }
    const targetName = readText(doc, '#gu-alert-target');
    const guName = readText(doc, '#gu-alert-gu');
    const finalRate = parsePercent(readText(doc, '#gu-alert-rate'));
    const contextLabel = readText(doc, '#gu-alert-context');
    if (!targetName && !guName && finalRate === null && !contextLabel) {
      return null;
    }
    return rememberTask({
      targetName,
      guName,
      finalRate,
      contextLabel,
      messageId: frame.messageId,
    });
  }

  function readResultTask(frame: StatusbarFrame | null, seed = loadTask()) {
    const doc = frame?.doc;
    const resultText = cleanText(doc?.querySelector('#gu-result-content')?.textContent || '');
    if (!resultText) {
      return seed || null;
    }
    const guName =
      resultText.match(/【使用极乐子蛊】：\s*([^（(]+?)\s*(?:[（(]|基础|$)/)?.[1]?.trim() ||
      seed?.guName ||
      readText(doc!, '#gu-alert-gu');
    const finalRate = toFiniteNumber(resultText.match(/最终成功率：\s*(-?\d+(?:\.\d+)?)\s*%/)?.[1], seed?.finalRate);
    const roll = toFiniteNumber(resultText.match(/天机点数：\s*(-?\d+(?:\.\d+)?)/)?.[1], seed?.roll);
    const isSuccess = /种蛊成功/.test(resultText) ? true : /种蛊失败/.test(resultText) ? false : seed?.isSuccess;
    return rememberTask({
      ...seed,
      targetName: seed?.targetName || readText(doc!, '#gu-alert-target'),
      guName,
      finalRate,
      roll,
      isSuccess,
      resultText,
      messageId: seed?.messageId ?? frame!.messageId,
    });
  }

  function parseStatData(raw: any): any {
    if (!raw) {
      return null;
    }
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (_error) {
        return null;
      }
    }
    if (raw.stat_data) {
      return parseStatData(raw.stat_data);
    }
    return raw;
  }

  function readVariables(messageId: any) {
    const getVariables = getApi<(option: any) => any>('getVariables');
    if (!getVariables) {
      return null;
    }
    try {
      return getVariables(getMessageOption(messageId));
    } catch (error) {
      console.warn(LOG_PREFIX, '读取消息变量失败', error);
      return null;
    }
  }

  function readStat(messageId: any) {
    return parseStatData(readVariables(messageId));
  }

  function getGuCount(stat: any, guName: any) {
    return toFiniteNumber(stat?.主角?.蛊?.[guName]?.数量, 0) || 0;
  }

  function findTarget(stat: any, targetName: any) {
    return stat?.绝色群芳?.[targetName] || stat?.额外群芳?.[targetName] || null;
  }

  function withGuCountBefore(task: PendingTask | null) {
    if (!task || task.guCountBefore !== undefined || !task.guName) {
      return task;
    }
    const stat = readStat(task.messageId);
    if (!stat?.主角?.蛊?.[task.guName]) {
      return task;
    }
    return rememberTask({ ...task, guCountBefore: getGuCount(stat, task.guName) });
  }

  function setJileGuStorage(guName: any, count: number) {
    if (!guName) {
      return;
    }
    for (const frame of getStatusbarFrames()) {
      try {
        frame.win.jileGuStorage ||= {};
        frame.win.jileGuStorage[guName] = count;
      } catch (_error) {
        // Best effort only.
      }
    }
  }

  function isTaskFinal(task: PendingTask | null | undefined) {
    return Boolean(
      task?.targetName &&
        task?.guName &&
        typeof task.isSuccess === 'boolean' &&
        toFiniteNumber(task.finalRate) !== null &&
        toFiniteNumber(task.roll) !== null,
    );
  }

  function isTaskApplied(stat: any, task: PendingTask) {
    if (!stat || !task) {
      return false;
    }
    if (task.isSuccess) {
      const target = findTarget(stat, task.targetName);
      return Boolean(target?.已种下极乐子蛊 === true && target?.调教阶段 === '贞洁反抗');
    }
    if (task.guCountBefore !== undefined && task.guName) {
      return getGuCount(stat, task.guName) < Number(task.guCountBefore);
    }
    return false;
  }

  function applyTaskToStat(stat: any, task: PendingTask) {
    const next = cloneData(stat);
    let changed = false;
    const guBag = next.主角?.蛊;
    const guRecord = guBag?.[task.guName as string];
    const currentCount = getGuCount(next, task.guName);
    const beforeCount = toFiniteNumber(task.guCountBefore);
    const shouldDeduct = guRecord && currentCount > 0 && (beforeCount === null || currentCount >= beforeCount);
    if (shouldDeduct) {
      const newCount = Math.max(0, currentCount - 1);
      guRecord.数量 = newCount;
      setJileGuStorage(task.guName, newCount);
      if (newCount === 0) {
        delete guBag[task.guName as string];
      }
      changed = true;
    }
    if (task.isSuccess) {
      const target = findTarget(next, task.targetName);
      if (target) {
        target.已种下极乐子蛊 = true;
        target.归心值 = -50;
        target.淫堕值 = 0;
        target.好感度 = -1;
        target.调教阶段 = '贞洁反抗';
        changed = true;
      }
    }
    return { stat: next, changed };
  }

  async function writeStat(stat: any, messageId: any) {
    const option = getMessageOption(messageId);
    const updateVariablesWith = getApi<(updater: (variables: Record<string, any>) => Record<string, any>, option: any) => any>(
      'updateVariablesWith',
    );
    if (updateVariablesWith) {
      await updateVariablesWith(variables => {
        const next = variables && typeof variables === 'object' ? variables : {};
        next.stat_data = stat;
        return next;
      }, option);
      return true;
    }
    const replaceVariables = getApi<(variables: Record<string, any>, option: any) => void>('replaceVariables');
    if (replaceVariables) {
      const variables = readVariables(messageId) || {};
      variables.stat_data = stat;
      replaceVariables(variables, option);
      return true;
    }
    return false;
  }

  function buildNarrationMessage(task: PendingTask) {
    if (task.isSuccess) {
      return `【系统提示：种蛊大成】\n目标：${task.targetName}\n蛊虫：${task.guName}\n最终成功率：${task.finalRate}%\n骰点：${task.roll}\n\n*(请在回复中准确描写出子蛊入体瞬间她感受到的诡异与不安，以及身体的微小变化，开启【贞洁反抗】阶段。)*`;
    }
    return `【系统提示：种蛊失败】\n目标：${task.targetName}\n蛊虫：${task.guName}\n最终成功率：${task.finalRate}%\n骰点：${task.roll}\n\n*(请在回复中描写出下蛊未果时的场面及她的反应。)*`;
  }

  function hasNarrationMessage(task: PendingTask) {
    const getLastMessageId = getApi<() => any>('getLastMessageId');
    const getChatMessages = getApi<(messageId: number) => any[]>('getChatMessages');
    const lastId = toFiniteNumber(getLastMessageId?.());
    if (!getChatMessages || lastId === null) {
      return false;
    }
    const firstId = Math.max(0, lastId - 8);
    for (let messageId = firstId; messageId <= lastId; messageId += 1) {
      let messages: any[] = [];
      try {
        messages = getChatMessages(messageId) || [];
      } catch (_error) {
        messages = [];
      }
      for (const message of messages) {
        const content = String(message?.message ?? message?.mes ?? message ?? '');
        if (
          content.includes('【系统提示：种蛊') &&
          (!task.targetName || content.includes(task.targetName)) &&
          (!task.guName || content.includes(task.guName))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function findInput(): HTMLTextAreaElement | HTMLInputElement | null {
    const selectors = [
      '#send_textarea',
      'textarea#send_textarea',
      'textarea[name="send_textarea"]',
      '.text_pole textarea',
      'textarea[placeholder*="输入"]',
      'textarea[placeholder*="Send"]',
      'textarea',
    ];
    for (const candidate of uniqueWindows()) {
      try {
        const doc = candidate.document;
        for (const selector of selectors) {
          const input = doc.querySelector(selector);
          if (input instanceof candidate.HTMLTextAreaElement || input instanceof candidate.HTMLInputElement) {
            return input;
          }
        }
      } catch (_error) {
        // Try the next visible document.
      }
    }
    return null;
  }

  function setInputValue(input: HTMLTextAreaElement | HTMLInputElement, value: string) {
    const ownerWindow = input.ownerDocument?.defaultView || window;
    const isTextarea = input.tagName?.toLowerCase() === 'textarea';
    const prototype = isTextarea ? ownerWindow.HTMLTextAreaElement.prototype : ownerWindow.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new ownerWindow.Event('input', { bubbles: true }));
    input.dispatchEvent(new ownerWindow.Event('change', { bubbles: true }));
    input.focus();
  }

  function fillTavernInput(content: string) {
    const input = findInput();
    if (!input) {
      return false;
    }
    const existing = String(input.value || '').trim();
    const nextValue = existing && !existing.includes(content) ? `${existing}\n\n${content}` : content;
    setInputValue(input, nextValue);
    return true;
  }

  function notify(type: 'success' | 'warning', message: string) {
    for (const candidate of uniqueWindows()) {
      try {
        if (candidate.toastr?.[type]) {
          candidate.toastr[type](message, '邪蛊志');
          return;
        }
      } catch (_error) {
        // Ignore notification failures.
      }
    }
  }

  async function ensureAcceptedResultHandled(task: PendingTask | null, frame: StatusbarFrame | null, reason: string) {
    const latestTask = withGuCountBefore(readResultTask(frame || getLatestFrame(), task || loadTask()) || task || loadTask());
    if (!isTaskFinal(latestTask)) {
      return false;
    }
    if (hasNarrationMessage(latestTask!)) {
      return true;
    }

    const stat = readStat(latestTask!.messageId);
    if (stat && !isTaskApplied(stat, latestTask!)) {
      const { stat: nextStat, changed } = applyTaskToStat(stat, latestTask!);
      if (changed) {
        const written = await writeStat(nextStat, latestTask!.messageId);
        if (!written) {
          console.warn(LOG_PREFIX, '变量写回接口不可用，仅填充输入框', latestTask);
        }
      }
    }

    const filled = fillTavernInput(buildNarrationMessage(latestTask!));
    if (filled) {
      console.info(LOG_PREFIX, `已在${reason}后恢复下蛊裁决提示`, latestTask);
      notify('success', '已恢复下蛊裁决提示到输入框');
    } else {
      console.warn(LOG_PREFIX, '未找到酒馆输入框，无法恢复裁决提示', latestTask);
      notify('warning', '未找到酒馆输入框，无法恢复裁决提示');
    }
    return filled;
  }

  function patchPrepare(frame: StatusbarFrame) {
    const statusbar = frame.win.__xieguStatusbar;
    if (
      !statusbar?.prepareGuPlanting ||
      statusbar.__xieguAcceptRecoveryPreparePatched ||
      readonlyPrepareStatusbars.has(statusbar)
    ) {
      return;
    }
    const originalPrepare = statusbar.prepareGuPlanting;
    try {
      statusbar.prepareGuPlanting = async function patchedPrepareGuPlanting(
        this: any,
        stat: any,
        targetName: string,
        guName: string,
        plotModifier: string,
        ...rest: any[]
      ) {
        const guCountBefore = toFiniteNumber(stat?.主角?.蛊?.[guName]?.数量);
        rememberTask({
          targetName,
          guName,
          plotModifier,
          guCountBefore,
          messageId: frame.messageId,
        });
        const result = await originalPrepare.call(this, stat, targetName, guName, plotModifier, ...rest);
        withGuCountBefore(readAlertTask(frame));
        return result;
      };
      statusbar.__xieguAcceptRecoveryPreparePatched = true;
    } catch (error) {
      readonlyPrepareStatusbars.add(statusbar);
      console.warn(LOG_PREFIX, '状态栏 prepareGuPlanting 为只读，跳过该包装并继续监听掷骰/确认按钮', error);
    }
  }

  function patchFrame(frame: StatusbarFrame) {
    if (!frame?.win) {
      return;
    }
    patchPrepare(frame);

    if (typeof frame.win.startGuRoll === 'function' && !frame.win[ROLL_FLAG]) {
      frame.win[ROLL_FLAG] = true;
      const originalRoll = frame.win.startGuRoll;
      frame.win.startGuRoll = function patchedStartGuRoll(this: any, ...args: any[]) {
        const alertTask = withGuCountBefore(readAlertTask(frame));
        const result = originalRoll.apply(this, args);
        setTimeout(() => {
          withGuCountBefore(readResultTask(frame, alertTask));
        }, 0);
        return result;
      };
    }

    if (typeof frame.win.confirmGuResult === 'function' && !frame.win[CONFIRM_FLAG]) {
      frame.win[CONFIRM_FLAG] = true;
      const originalConfirm = frame.win.confirmGuResult;
      frame.win.confirmGuResult = async function patchedConfirmGuResult(this: any, ...args: any[]) {
        const task = withGuCountBefore(readResultTask(frame, loadTask()));
        let result;
        try {
          result = originalConfirm.apply(this, args);
          if (result && typeof result.then === 'function') {
            await result;
          }
        } catch (error) {
          console.warn(LOG_PREFIX, '原确认函数执行异常，启用兜底恢复', error);
        }
        await delay(900);
        await ensureAcceptedResultHandled(task, frame, 'confirmGuResult');
        return result;
      };
    }

    if (frame.win[CLICK_FLAG]) {
      return;
    }
    frame.win[CLICK_FLAG] = true;
    frame.doc.addEventListener(
      'click',
      event => {
        const button = (event.target as HTMLElement | null)?.closest?.('button');
        if (!button || !ACCEPT_BUTTON_RE.test(cleanText(button.textContent))) {
          return;
        }
        const task = withGuCountBefore(readResultTask(frame, loadTask()));
        setTimeout(() => {
          ensureAcceptedResultHandled(task, frame, '接受裁决按钮').catch(error =>
            console.warn(LOG_PREFIX, '接受裁决兜底恢复失败', error),
          );
        }, 1200);
      },
      true,
    );
  }

  function patchAllFrames() {
    getStatusbarFrames().forEach(patchFrame);
  }

  function init() {
    try {
      patchAllFrames();
      setInterval(patchAllFrames, 1500);
      ROOT[PATCH_FLAG] = { version: PATCH_VERSION, installed: true };
      console.info(LOG_PREFIX, '已加载');
    } catch (error) {
      ROOT[PATCH_FLAG] = { version: PATCH_VERSION, installed: false, error: String(error) };
      console.warn(LOG_PREFIX, '初始化失败', error);
    }
  }

  if (typeof $ === 'function') {
    $(init);
  } else {
    setTimeout(init, 0);
  }
})();
