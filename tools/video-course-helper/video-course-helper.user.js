// ==UserScript==
// @name         Video Course Helper
// @namespace    local.video-course-helper
// @version      1.0.0
// @description  Real-viewing course helper: opens queued lessons, plays normal-speed videos, and advances only after the video ends.
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE = {
    config: "vch.config.v1",
    state: "vch.state.v1",
    panelVisible: "vch.panelVisible.v1"
  };

  const DEFAULT_CONFIG = {
    version: 1,
    settings: {
      autoPlayWhenArrived: true,
      autoOpenNext: true,
      keepNormalPlaybackRate: true,
      pollIntervalMs: 1000,
      selectors: {
        video: "video",
        nextButton: "",
        catalogItem: "",
        catalogTitle: "",
        catalogUrl: "a",
        blockers: [
          "input[name*='captcha' i]",
          "[id*='captcha' i]",
          "[class*='captcha' i]",
          "[id*='quiz' i]",
          "[class*='quiz' i]",
          "[id*='exam' i]",
          "[class*='exam' i]"
        ]
      }
    },
    chapters: []
  };

  const DEFAULT_STATE = {
    running: false,
    currentId: "",
    completed: {},
    pausedReason: "",
    logs: []
  };

  let config = loadJson(STORAGE.config, DEFAULT_CONFIG);
  let state = loadJson(STORAGE.state, DEFAULT_STATE);
  let panel = null;
  let modal = null;
  let monitorTimer = 0;
  let attachedVideo = null;

  GM_registerMenuCommand("Video Course Helper: show panel", () => {
    GM_setValue(STORAGE.panelVisible, true);
    ensurePanel();
    renderPanel();
  });

  GM_registerMenuCommand("Video Course Helper: pause queue", () => {
    pauseQueue("Paused from Tampermonkey menu.");
  });

  GM_registerMenuCommand("Video Course Helper: export config", () => {
    copyText(JSON.stringify(config, null, 2));
  });

  init();

  function init() {
    config = normalizeConfig(config);
    state = normalizeState(state);
    saveConfig();
    saveState();

    if (GM_getValue(STORAGE.panelVisible, false) || isCurrentPageInQueue()) {
      ensurePanel();
    }

    if (state.running) {
      startMonitor();
    }
  }

  function normalizeConfig(raw) {
    const merged = deepMerge(clone(DEFAULT_CONFIG), raw && typeof raw === "object" ? raw : {});
    if (!Array.isArray(merged.chapters)) {
      merged.chapters = [];
    }
    merged.chapters = merged.chapters
      .filter(chapter => chapter && typeof chapter === "object")
      .map((chapter, index) => ({
        id: String(chapter.id || `chapter-${index + 1}`).trim(),
        title: String(chapter.title || chapter.id || `Chapter ${index + 1}`).trim(),
        type: chapter.type === "app" ? "app" : "web",
        url: chapter.url ? String(chapter.url).trim() : "",
        match: chapter.match,
        appLaunch: chapter.appLaunch ? String(chapter.appLaunch).trim() : "",
        windowTitle: chapter.windowTitle ? String(chapter.windowTitle).trim() : "",
        hotkeys: chapter.hotkeys && typeof chapter.hotkeys === "object" ? chapter.hotkeys : {},
        click: chapter.click && typeof chapter.click === "object" ? chapter.click : {},
        durationSeconds: Number(chapter.durationSeconds || 0),
        selectors: chapter.selectors && typeof chapter.selectors === "object" ? chapter.selectors : {}
      }));
    return merged;
  }

  function normalizeState(raw) {
    const merged = Object.assign(clone(DEFAULT_STATE), raw && typeof raw === "object" ? raw : {});
    if (!merged.completed || typeof merged.completed !== "object") {
      merged.completed = {};
    }
    if (!Array.isArray(merged.logs)) {
      merged.logs = [];
    }
    return merged;
  }

  function loadJson(key, fallback) {
    const raw = GM_getValue(key, "");
    if (!raw) {
      return clone(fallback);
    }
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      console.warn("[Video Course Helper] Failed to read storage:", key, error);
      return clone(fallback);
    }
  }

  function saveConfig() {
    GM_setValue(STORAGE.config, JSON.stringify(config));
  }

  function saveState() {
    GM_setValue(STORAGE.state, JSON.stringify(state));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(target, source) {
    Object.keys(source || {}).forEach(key => {
      const value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        target[key] = deepMerge(target[key] && typeof target[key] === "object" ? target[key] : {}, value);
        return;
      }
      target[key] = value;
    });
    return target;
  }

  function ensurePanel() {
    if (panel) {
      return;
    }

    const root = document.createElement("div");
    root.id = "vch-panel";
    root.innerHTML = `
      <style>
        #vch-panel {
          position: fixed;
          z-index: 2147483647;
          right: 16px;
          bottom: 16px;
          width: min(380px, calc(100vw - 32px));
          color: #e8eef8;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.4;
        }
        #vch-panel .vch-card {
          background: #17202f;
          border: 1px solid #314057;
          border-radius: 8px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
          overflow: hidden;
        }
        #vch-panel .vch-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 12px;
          background: #213049;
          border-bottom: 1px solid #314057;
        }
        #vch-panel .vch-title {
          font-weight: 700;
        }
        #vch-panel .vch-body {
          padding: 12px;
        }
        #vch-panel .vch-status {
          min-height: 38px;
          margin-bottom: 10px;
          color: #d7e2f2;
          word-break: break-word;
        }
        #vch-panel .vch-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        #vch-panel button {
          min-height: 30px;
          padding: 5px 9px;
          color: #eef5ff;
          background: #2c3c58;
          border: 1px solid #48617f;
          border-radius: 6px;
          cursor: pointer;
          font: inherit;
        }
        #vch-panel button:hover {
          background: #385074;
        }
        #vch-panel button[data-kind="primary"] {
          background: #1f6f55;
          border-color: #2f9b78;
        }
        #vch-panel button[data-kind="danger"] {
          background: #74313b;
          border-color: #a34855;
        }
        #vch-panel .vch-log {
          max-height: 118px;
          overflow: auto;
          margin-top: 10px;
          padding: 8px;
          color: #bdc9da;
          background: #101824;
          border: 1px solid #2a3950;
          border-radius: 6px;
          white-space: pre-wrap;
        }
        .vch-modal-backdrop {
          position: fixed;
          z-index: 2147483647;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(7, 12, 20, 0.64);
        }
        .vch-modal {
          width: min(720px, 100%);
          color: #e8eef8;
          background: #17202f;
          border: 1px solid #314057;
          border-radius: 8px;
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.4);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .vch-modal h2 {
          margin: 0;
          padding: 12px 14px;
          font-size: 16px;
          border-bottom: 1px solid #314057;
        }
        .vch-modal textarea {
          box-sizing: border-box;
          display: block;
          width: calc(100% - 28px);
          min-height: 320px;
          margin: 14px;
          padding: 10px;
          color: #edf5ff;
          background: #0f1722;
          border: 1px solid #314057;
          border-radius: 6px;
          font: 12px/1.5 Consolas, "SFMono-Regular", monospace;
        }
        .vch-modal .vch-row {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 0 14px 14px;
        }
        .vch-modal button {
          min-height: 32px;
          padding: 5px 12px;
          color: #eef5ff;
          background: #2c3c58;
          border: 1px solid #48617f;
          border-radius: 6px;
          cursor: pointer;
          font: inherit;
        }
      </style>
      <div class="vch-card">
        <div class="vch-head">
          <div class="vch-title">Video Course Helper</div>
          <button type="button" data-action="hide" title="Hide panel">Hide</button>
        </div>
        <div class="vch-body">
          <div class="vch-status" data-role="status"></div>
          <div class="vch-row">
            <button type="button" data-action="start" data-kind="primary">Start</button>
            <button type="button" data-action="pause">Pause</button>
            <button type="button" data-action="next">Mark done + next</button>
          </div>
          <div class="vch-row">
            <button type="button" data-action="extract">Extract catalog</button>
            <button type="button" data-action="add-current">Add current page</button>
            <button type="button" data-action="import-file">Import file</button>
            <button type="button" data-action="import">Import JSON</button>
            <button type="button" data-action="export">Export JSON</button>
            <button type="button" data-action="reset" data-kind="danger">Reset progress</button>
          </div>
          <input type="file" data-role="file-input" accept="application/json,.json" hidden>
          <div class="vch-log" data-role="log"></div>
        </div>
      </div>
    `;

    root.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }
      handlePanelAction(button.getAttribute("data-action"));
    });

    root.querySelector("[data-role='file-input']").addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) {
        importQueueFile(file);
      }
    });

    document.documentElement.appendChild(root);
    panel = root;
    renderPanel();
  }

  function handlePanelAction(action) {
    switch (action) {
      case "hide":
        GM_setValue(STORAGE.panelVisible, false);
        if (panel) {
          panel.remove();
          panel = null;
        }
        break;
      case "start":
        startQueue();
        break;
      case "pause":
        pauseQueue("Paused by user.");
        break;
      case "next":
        markCurrentDoneAndGoNext("Marked done by user.");
        break;
      case "extract":
        extractCatalogIntoQueue();
        break;
      case "add-current":
        addCurrentPageToQueue();
        break;
      case "import-file":
        panel.querySelector("[data-role='file-input']").click();
        break;
      case "import":
        openImportModal();
        break;
      case "export":
        copyText(JSON.stringify(config, null, 2));
        log("info", "Current queue JSON copied to clipboard or shown in a prompt.");
        break;
      case "reset":
        if (window.confirm("Reset local Video Course Helper progress?")) {
          state = clone(DEFAULT_STATE);
          saveState();
          log("info", "Progress reset.");
          renderPanel();
        }
        break;
      default:
        break;
    }
  }

  function renderPanel() {
    if (!panel) {
      return;
    }

    const status = panel.querySelector("[data-role='status']");
    const logBox = panel.querySelector("[data-role='log']");
    const current = getCurrentChapter();
    const completedCount = Object.keys(state.completed || {}).length;

    status.textContent = [
      state.running ? "Running" : "Paused",
      current ? `Current: ${current.title} (${current.id})` : "Current: not matched",
      `Queue: ${config.chapters.length} chapters, ${completedCount} completed`,
      state.pausedReason ? `Note: ${state.pausedReason}` : ""
    ].filter(Boolean).join("\n");

    logBox.textContent = state.logs
      .slice(-8)
      .map(item => `${item.time} [${item.level}] ${item.message}`)
      .join("\n");
  }

  function openImportModal() {
    closeImportModal();

    const root = document.createElement("div");
    root.className = "vch-modal-backdrop";
    root.innerHTML = `
      <div class="vch-modal" role="dialog" aria-modal="true">
        <h2>Import course-queue JSON</h2>
        <textarea spellcheck="false"></textarea>
        <div class="vch-row">
          <button type="button" data-action="cancel">Cancel</button>
          <button type="button" data-action="save">Save queue</button>
        </div>
      </div>
    `;
    root.querySelector("textarea").value = JSON.stringify(config, null, 2);
    root.addEventListener("click", event => {
      const action = event.target.getAttribute("data-action");
      if (action === "cancel") {
        closeImportModal();
      }
      if (action === "save") {
        const text = root.querySelector("textarea").value;
        try {
          config = normalizeConfig(JSON.parse(text));
          saveConfig();
          closeImportModal();
          log("info", `Imported ${config.chapters.length} chapters.`);
          ensurePanel();
          renderPanel();
        } catch (error) {
          window.alert(`Invalid JSON: ${error.message}`);
        }
      }
    });
    document.documentElement.appendChild(root);
    modal = root;
  }

  function importQueueFile(file) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        config = normalizeConfig(JSON.parse(String(reader.result || "")));
        saveConfig();
        log("info", `Imported ${config.chapters.length} chapters from ${file.name}.`);
        renderPanel();
      } catch (error) {
        window.alert(`Invalid JSON file: ${error.message}`);
      }
    });
    reader.addEventListener("error", () => {
      window.alert(`Cannot read file: ${file.name}`);
    });
    reader.readAsText(file, "utf-8");
  }

  function addCurrentPageToQueue() {
    const url = normalizeUrl(location.href);
    const existing = config.chapters.find(chapter => chapter.type === "web" && chapter.url && normalizeUrl(chapter.url) === url);
    if (existing) {
      state.currentId = existing.id;
      saveState();
      log("info", `Current page is already in queue: ${existing.title}`);
      renderPanel();
      return;
    }

    const title = getPageTitle();
    const chapter = {
      id: `web-${stableHash(url)}`,
      title,
      type: "web",
      url,
      selectors: {
        video: getGlobalSelector("video") || "video"
      }
    };
    config.chapters.push(chapter);
    state.currentId = chapter.id;
    saveConfig();
    saveState();
    log("info", `Added current page: ${title}`);
    renderPanel();
  }

  function closeImportModal() {
    if (modal) {
      modal.remove();
      modal = null;
    }
  }

  function startQueue() {
    state.running = true;
    state.pausedReason = "";
    saveState();
    ensurePanel();
    log("info", "Queue started.");

    const current = getCurrentChapter();
    if (!current) {
      const next = getNextUncompletedChapter();
      if (next) {
        openChapter(next);
        return;
      }
    }

    startMonitor();
    renderPanel();
  }

  function pauseQueue(reason) {
    state.running = false;
    state.pausedReason = reason || "";
    saveState();
    stopMonitor();
    log("info", state.pausedReason || "Queue paused.");
    renderPanel();
  }

  function startMonitor() {
    stopMonitor();
    tick();
    const interval = Math.max(500, Number(config.settings.pollIntervalMs || 1000));
    monitorTimer = window.setInterval(tick, interval);
  }

  function stopMonitor() {
    if (monitorTimer) {
      window.clearInterval(monitorTimer);
      monitorTimer = 0;
    }
    detachVideo();
  }

  function tick() {
    if (!state.running) {
      return;
    }

    const blocker = findVisibleBlocker();
    if (blocker) {
      pauseQueue(`Manual action needed: ${describeElement(blocker)}`);
      return;
    }

    const chapter = getCurrentChapter();
    if (!chapter) {
      renderPanel();
      return;
    }
    if (chapter.type !== "web") {
      pauseQueue("This is an app chapter. Use the AutoHotkey helper for desktop software.");
      return;
    }

    state.currentId = chapter.id;
    saveState();

    const video = findVideo(chapter);
    if (!video) {
      renderPanel();
      return;
    }

    attachVideo(video);

    if (config.settings.keepNormalPlaybackRate && video.playbackRate !== 1) {
      video.playbackRate = 1;
    }

    if (video.ended) {
      markChapterDoneAndGoNext(chapter, "Video already ended.");
      return;
    }

    if (config.settings.autoPlayWhenArrived && video.paused) {
      video.play().catch(error => {
        state.pausedReason = "Browser blocked autoplay. Click the video play button once.";
        saveState();
        console.info("[Video Course Helper] Autoplay was blocked:", error);
        renderPanel();
      });
    }

    renderPanel();
  }

  function attachVideo(video) {
    if (attachedVideo === video) {
      return;
    }
    detachVideo();
    attachedVideo = video;
    attachedVideo.addEventListener("ended", onVideoEnded);
  }

  function detachVideo() {
    if (!attachedVideo) {
      return;
    }
    attachedVideo.removeEventListener("ended", onVideoEnded);
    attachedVideo = null;
  }

  function onVideoEnded() {
    const chapter = getCurrentChapter();
    if (!chapter || chapter.type !== "web") {
      return;
    }
    markChapterDoneAndGoNext(chapter, "Video ended naturally.");
  }

  function markCurrentDoneAndGoNext(reason) {
    const chapter = getCurrentChapter({ allowStateFallback: true });
    if (!chapter) {
      log("warn", "No current chapter is matched on this page.");
      return;
    }
    markChapterDoneAndGoNext(chapter, reason || "Marked done.");
  }

  function markChapterDoneAndGoNext(chapter, reason) {
    state.completed[chapter.id] = {
      completedAt: new Date().toISOString(),
      url: location.href,
      reason
    };
    state.currentId = chapter.id;
    saveState();
    log("info", `${chapter.title} completed. ${reason}`);

    if (!state.running) {
      renderPanel();
      return;
    }

    if (!config.settings.autoOpenNext) {
      pauseQueue(`Completed ${chapter.title}. Auto-open-next is disabled.`);
      return;
    }

    const next = getNextChapterAfter(chapter.id);
    if (!next) {
      pauseQueue("All queued chapters are completed.");
      window.alert("Video Course Helper: all queued chapters are completed.");
      return;
    }

    openChapter(next);
  }

  function openChapter(chapter) {
    if (!chapter) {
      return;
    }

    state.currentId = chapter.id;
    saveState();

    if (chapter.type === "app") {
      pauseQueue(`Next chapter is a desktop app chapter: ${chapter.title}. Switch to the AutoHotkey helper.`);
      window.alert(`Next chapter is a desktop app chapter:\n${chapter.title}\n\nUse video-course-helper.ahk to continue.`);
      return;
    }

    if (chapter.url) {
      log("info", `Opening next web chapter: ${chapter.title}`);
      location.assign(chapter.url);
      return;
    }

    const nextButtonSelector = getGlobalSelector("nextButton");
    const nextButton = nextButtonSelector ? document.querySelector(nextButtonSelector) : null;
    if (nextButton) {
      log("info", "Clicking configured next button.");
      nextButton.click();
      return;
    }

    pauseQueue(`Cannot open next chapter: ${chapter.title}. Add a url or nextButton selector.`);
  }

  function getCurrentChapter(options = {}) {
    const currentUrl = location.href;
    return config.chapters.find(chapter => chapter.type === "web" && urlMatchesChapter(chapter, currentUrl))
      || (options.allowStateFallback ? getChapterById(state.currentId) : null);
  }

  function getChapterById(id) {
    if (!id) {
      return null;
    }
    return config.chapters.find(chapter => chapter.id === id) || null;
  }

  function getNextUncompletedChapter() {
    return config.chapters.find(chapter => !state.completed[chapter.id]) || null;
  }

  function getNextChapterAfter(id) {
    const index = config.chapters.findIndex(chapter => chapter.id === id);
    if (index < 0) {
      return getNextUncompletedChapter();
    }
    for (let offset = 1; offset <= config.chapters.length; offset += 1) {
      const chapter = config.chapters[index + offset];
      if (!chapter) {
        break;
      }
      if (!state.completed[chapter.id]) {
        return chapter;
      }
    }
    return null;
  }

  function isCurrentPageInQueue() {
    return config.chapters.some(chapter => chapter.type === "web" && urlMatchesChapter(chapter, location.href));
  }

  function urlMatchesChapter(chapter, currentUrl) {
    if (chapter.match) {
      const patterns = Array.isArray(chapter.match) ? chapter.match : [chapter.match];
      if (patterns.some(pattern => wildcardMatch(String(pattern), currentUrl))) {
        return true;
      }
    }

    if (!chapter.url) {
      return false;
    }

    return normalizeUrl(chapter.url) === normalizeUrl(currentUrl);
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value, location.href);
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch (_error) {
      return String(value || "").replace(/#.*$/, "").replace(/\/$/, "");
    }
  }

  function getPageTitle() {
    const heading = document.querySelector("h1, [class*='title' i], [id*='title' i]");
    const text = heading && heading.textContent ? heading.textContent.trim().replace(/\s+/g, " ") : "";
    return text || document.title || `Lesson ${config.chapters.length + 1}`;
  }

  function wildcardMatch(pattern, value) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`).test(value);
  }

  function findVideo(chapter) {
    const selector = getChapterSelector(chapter, "video") || "video";
    const videos = Array.from(document.querySelectorAll(selector));
    return videos.find(video => {
      const rect = video.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20 && isVisible(video);
    }) || videos[0] || null;
  }

  function findVisibleBlocker() {
    const selectors = getGlobalSelector("blockers");
    if (!Array.isArray(selectors)) {
      return null;
    }
    for (const selector of selectors) {
      if (!selector) {
        continue;
      }
      try {
        const element = Array.from(document.querySelectorAll(selector)).find(isVisible);
        if (element) {
          return element;
        }
      } catch (error) {
        console.warn("[Video Course Helper] Invalid blocker selector:", selector, error);
      }
    }
    return null;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) !== 0
      && rect.width >= 1
      && rect.height >= 1;
  }

  function describeElement(element) {
    const id = element.id ? `#${element.id}` : "";
    const className = typeof element.className === "string"
      ? `.${element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")}`
      : "";
    return `${element.tagName.toLowerCase()}${id}${className}`;
  }

  function getChapterSelector(chapter, key) {
    return chapter && chapter.selectors && chapter.selectors[key]
      ? chapter.selectors[key]
      : getGlobalSelector(key);
  }

  function getGlobalSelector(key) {
    return config.settings
      && config.settings.selectors
      && config.settings.selectors[key];
  }

  function extractCatalogIntoQueue() {
    const chapters = extractCatalogChapters();
    if (!chapters.length) {
      window.alert("No catalog items found. Fill settings.selectors.catalogItem and catalogUrl first.");
      return;
    }

    const existingByUrl = new Map(
      config.chapters
        .filter(chapter => chapter.url)
        .map(chapter => [normalizeUrl(chapter.url), chapter])
    );
    let added = 0;

    chapters.forEach(chapter => {
      const key = normalizeUrl(chapter.url);
      if (existingByUrl.has(key)) {
        const existing = existingByUrl.get(key);
        existing.title = chapter.title || existing.title;
        return;
      }
      config.chapters.push(chapter);
      existingByUrl.set(key, chapter);
      added += 1;
    });

    saveConfig();
    log("info", `Catalog extracted: ${chapters.length} found, ${added} added.`);
    renderPanel();
  }

  function extractCatalogChapters() {
    const itemSelector = getGlobalSelector("catalogItem");
    const urlSelector = getGlobalSelector("catalogUrl") || "a";
    const titleSelector = getGlobalSelector("catalogTitle") || urlSelector;
    if (!itemSelector) {
      return [];
    }

    const items = Array.from(document.querySelectorAll(itemSelector));
    return items.map((item, index) => {
      const link = findWithinOrSelf(item, urlSelector);
      const titleElement = findWithinOrSelf(item, titleSelector) || link || item;
      const href = link ? link.getAttribute("href") || link.href : "";
      if (!href) {
        return null;
      }
      const url = new URL(href, location.href).href;
      const title = (titleElement.textContent || `Catalog lesson ${index + 1}`).trim().replace(/\s+/g, " ");
      return {
        id: `catalog-${stableHash(url)}`,
        title,
        type: "web",
        url,
        selectors: {
          video: getGlobalSelector("video") || "video"
        }
      };
    }).filter(Boolean);
  }

  function findWithinOrSelf(root, selector) {
    if (!selector) {
      return null;
    }
    try {
      if (root.matches && root.matches(selector)) {
        return root;
      }
      return root.querySelector(selector);
    } catch (error) {
      console.warn("[Video Course Helper] Invalid catalog selector:", selector, error);
      return null;
    }
  }

  function stableHash(text) {
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash) + text.charCodeAt(index);
      hash &= 0xffffffff;
    }
    return Math.abs(hash).toString(36);
  }

  function log(level, message) {
    const entry = {
      level,
      message,
      time: new Date().toLocaleTimeString()
    };
    state.logs.push(entry);
    state.logs = state.logs.slice(-80);
    saveState();
    console[level === "warn" ? "warn" : "info"](`[Video Course Helper] ${message}`);
    renderPanel();
  }

  function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => window.prompt("Copy this JSON:", text));
      return;
    }
    window.prompt("Copy this JSON:", text);
  }
})();
