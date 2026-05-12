<template>
  <main class="overlay-root" :data-theme="theme">
    <section class="panel">
      <header class="panel-head">
        <h1>全屏覆盖式酒馆前端</h1>
        <div class="head-actions">
          <button type="button" class="native-ui-btn" @click="toggleNativeMessageVisibility">
            {{ nativeMessagesHidden ? '显示原生消息' : '隐藏原生消息' }}
          </button>
          <button type="button" class="close-btn" @click="closeOverlay">关闭覆盖页</button>
        </div>
      </header>

      <div class="theme-switch">
        <button
          type="button"
          class="theme-btn blue"
          :aria-pressed="theme === 'cyber_blue'"
          @click="setTheme('cyber_blue')"
        >
          黑底蓝光
        </button>
        <button
          type="button"
          class="theme-btn pink"
          :aria-pressed="theme === 'cyber_pink'"
          @click="setTheme('cyber_pink')"
        >
          银底粉光
        </button>
      </div>

      <details class="regex-panel">
        <summary>正则查找替换（仅覆盖层显示）</summary>
        <div class="regex-body">
          <div class="regex-creator">
            <input v-model="draftRegex.name" type="text" class="rule-input" placeholder="规则名（可选）" />
            <input v-model="draftRegex.find" type="text" class="rule-input" placeholder="查找正则，如：```([\\s\\S]*?)```" />
            <input v-model="draftRegex.flags" type="text" class="rule-input flags" placeholder="标志，如：gim" />
            <textarea
              v-model="draftRegex.replace"
              class="rule-input replace-input"
              rows="2"
              placeholder="替换文本，支持 $1 等捕获组"
            ></textarea>
          </div>

          <div class="regex-actions">
            <button type="button" class="action-btn" @click="appendRegexRule">添加规则</button>
            <button type="button" class="action-btn" @click="refreshChatMessages">应用到当前对话</button>
            <label class="file-picker">
              选择正则文件
              <input type="file" accept=".json,.txt" @change="onRegexFileSelected" />
            </label>
            <button
              type="button"
              class="action-btn"
              :disabled="!selectedRegexFileName"
              @click="importFileAsOverlayRules"
            >
              导入为覆盖规则
            </button>
            <button
              type="button"
              class="action-btn"
              :disabled="!selectedRegexFileName"
              @click="importFileIntoTavernRegex"
            >
              导入到酒馆正则库
            </button>
          </div>

          <p class="file-hint">{{ selectedRegexFileName ? `已选文件：${selectedRegexFileName}` : '未选择文件' }}</p>
          <p v-if="regexCompileError" class="regex-error">{{ regexCompileError }}</p>

          <section class="regex-rule-list">
            <article v-for="rule in regexRules" :key="rule.id" class="regex-rule">
              <div class="regex-rule-top">
                <label class="rule-enable">
                  <input v-model="rule.enabled" type="checkbox" />
                  启用
                </label>
                <input v-model="rule.name" type="text" class="rule-input" placeholder="规则名（可选）" />
                <button type="button" class="action-btn danger" @click="removeRegexRule(rule.id)">删除</button>
              </div>
              <div class="regex-rule-fields">
                <input v-model="rule.find" type="text" class="rule-input" placeholder="查找正则" />
                <input v-model="rule.flags" type="text" class="rule-input flags" placeholder="标志" />
                <textarea v-model="rule.replace" class="rule-input replace-input" rows="2" placeholder="替换文本"></textarea>
              </div>
            </article>
          </section>
        </div>
      </details>

      <section ref="chatScrollRef" class="chat-box">
        <article
          v-for="message in chatMessages"
          :key="message.message_id"
          class="message-row"
          :class="[`role-${message.role}`, { 'is-hidden-message': message.is_hidden }]"
        >
          <p class="meta">
            {{ message.name }} · #{{ message.message_id }}
            <span v-if="message.is_hidden" class="hidden-tag">· 原生隐藏</span>
          </p>
          <div class="bubble" v-html="message.renderedHtml"></div>
        </article>
        <p v-if="chatMessages.length === 0" class="placeholder">当前聊天暂无可显示消息。</p>
      </section>

      <div class="input-shell">
        <textarea
          v-model="draft"
          class="input-box"
          rows="4"
          placeholder="输入发送前原始文本。发送会走酒馆原生按钮链路。"
        ></textarea>
      </div>

      <div class="action-row">
        <button type="button" class="send-btn" @click="requestNativeSend">发送</button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  OVERLAY_EVENTS,
  type NativeMessageVisibilityPayload,
  type NativeSendResultPayload,
  type OverlayVisibilityPayload,
} from '../共享/协议';

type OverlayTheme = 'cyber_blue' | 'cyber_pink';
type RenderableMessage = {
  message_id: number;
  name: string;
  role: 'system' | 'assistant' | 'user';
  is_hidden: boolean;
  renderedHtml: string;
};

type OverlayRegexRule = {
  id: string;
  name: string;
  enabled: boolean;
  find: string;
  flags: string;
  replace: string;
};

type OverlayStoredSettings = {
  version: number;
  nativeMessagesHidden: boolean;
  regexRules: OverlayRegexRule[];
};

type CompiledRegexRule = {
  id: string;
  regex: RegExp;
  replace: string;
};

const OVERLAY_SETTINGS_KEY = 'th_fullscreen_overlay.settings.v1';
const OVERLAY_SETTINGS_VERSION = 1;

const draft = ref('');
const theme = ref<OverlayTheme>('cyber_blue');
const chatMessages = ref<RenderableMessage[]>([]);
const chatScrollRef = ref<HTMLElement | null>(null);
const regexRules = ref<OverlayRegexRule[]>([]);
const regexCompileError = ref('');
const selectedRegexFile = ref<File | null>(null);
const nativeMessagesHidden = ref(true);
const stops: EventOnReturn[] = [];
const draftRegex = ref({
  name: '',
  find: '',
  flags: 'g',
  replace: '',
});

const selectedRegexFileName = computed(() => selectedRegexFile.value?.name ?? '');

const persistSettingsDebounced = _.debounce(() => {
  persistSettingsToVariables();
}, 80);

function createRuleId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultStoredSettings(): OverlayStoredSettings {
  return {
    version: OVERLAY_SETTINGS_VERSION,
    nativeMessagesHidden: true,
    regexRules: [],
  };
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function splitRegexSource(rawPattern: string, rawFlags: string) {
  const trimmed = rawPattern.trim();
  if (rawFlags.trim()) {
    return { find: trimmed, flags: rawFlags.trim() };
  }

  if (!trimmed.startsWith('/')) {
    return { find: trimmed, flags: 'g' };
  }

  const closingSlashIndex = trimmed.lastIndexOf('/');
  if (closingSlashIndex <= 0) {
    return { find: trimmed, flags: 'g' };
  }

  const extractedFind = trimmed.slice(1, closingSlashIndex);
  const extractedFlags = trimmed.slice(closingSlashIndex + 1) || 'g';
  return { find: extractedFind, flags: extractedFlags };
}

function parseRuleFromUnknown(raw: unknown, index: number): OverlayRegexRule | null {
  if (!raw || typeof raw !== 'object') {
    if (typeof raw === 'string' && raw.trim()) {
      return {
        id: createRuleId(),
        name: `导入规则${index + 1}`,
        enabled: true,
        find: raw.trim(),
        flags: 'g',
        replace: '',
      };
    }
    return null;
  }

  const record = raw as Record<string, unknown>;
  const findRaw = normalizeString(record.find_regex, normalizeString(record.find, normalizeString(record.pattern)));
  if (!findRaw.trim()) {
    return null;
  }

  const flagsRaw = normalizeString(record.flags);
  const split = splitRegexSource(findRaw, flagsRaw);

  return {
    id: normalizeString(record.id) || createRuleId(),
    name: normalizeString(record.script_name, normalizeString(record.name, `导入规则${index + 1}`)),
    enabled: record.enabled !== false,
    find: split.find,
    flags: split.flags || 'g',
    replace: normalizeString(record.replace_string, normalizeString(record.replace, normalizeString(record.replacement))),
  };
}

function parseStoredSettings(raw: unknown): OverlayStoredSettings {
  const defaults = createDefaultStoredSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const storedRules = Array.isArray(record.regexRules) ? record.regexRules : [];
  const parsedRules = storedRules.map((item, index) => parseRuleFromUnknown(item, index)).filter(Boolean) as OverlayRegexRule[];

  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version) ? Math.floor(record.version) : defaults.version,
    nativeMessagesHidden: typeof record.nativeMessagesHidden === 'boolean' ? record.nativeMessagesHidden : defaults.nativeMessagesHidden,
    regexRules: parsedRules,
  };
}

function readScriptVariables(): Record<string, any> {
  return getVariables({ type: 'script', script_id: getScriptId() });
}

function loadSettingsFromVariables() {
  const variables = readScriptVariables();
  const stored = _.get(variables, OVERLAY_SETTINGS_KEY);
  const parsed = parseStoredSettings(stored);
  nativeMessagesHidden.value = parsed.nativeMessagesHidden;
  regexRules.value = parsed.regexRules;
}

function persistSettingsToVariables() {
  const variables = readScriptVariables();
  const payload: OverlayStoredSettings = {
    version: OVERLAY_SETTINGS_VERSION,
    nativeMessagesHidden: nativeMessagesHidden.value,
    regexRules: regexRules.value.map(rule => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      find: rule.find,
      flags: rule.flags,
      replace: rule.replace,
    })),
  };

  _.set(variables, OVERLAY_SETTINGS_KEY, payload);
  replaceVariables(variables, { type: 'script', script_id: getScriptId() });
}

function setTheme(next: OverlayTheme) {
  theme.value = next;
}

function closeOverlay() {
  void eventEmit(OVERLAY_EVENTS.REQUEST_OVERLAY_VISIBILITY, {
    visible: false,
    source: 'overlay_ui',
  } satisfies OverlayVisibilityPayload);
}

function normalizeNativeMessageVisibility(payload: unknown): NativeMessageVisibilityPayload {
  if (!payload || typeof payload !== 'object') {
    return { hidden: true, source: 'unknown' };
  }

  const record = payload as Record<string, unknown>;
  const source =
    record.source === 'overlay_ui' || record.source === 'launcher' || record.source === 'script' || record.source === 'unknown'
      ? record.source
      : 'unknown';
  return {
    hidden: record.hidden !== false,
    source,
  };
}

function requestNativeMessageVisibility(hidden: boolean, source: NativeMessageVisibilityPayload['source']) {
  nativeMessagesHidden.value = hidden;
  void eventEmit(OVERLAY_EVENTS.REQUEST_NATIVE_MESSAGE_VISIBILITY, {
    hidden,
    source,
  } satisfies NativeMessageVisibilityPayload);
}

function toggleNativeMessageVisibility() {
  requestNativeMessageVisibility(!nativeMessagesHidden.value, 'overlay_ui');
}

function normalizeMessageName(message: Pick<ChatMessage, 'name' | 'role'>): string {
  if (message.name?.trim()) {
    return message.name;
  }

  if (message.role === 'user') {
    return '用户';
  }
  if (message.role === 'assistant') {
    return 'AI';
  }
  return '系统';
}

function escapeAsDisplayedParagraph(text: string): string {
  if (!text.trim()) {
    return '<p></p>';
  }
  return `<p>${_.escape(text).replace(/\r?\n/g, '<br>')}</p>`;
}

function tryReadNativeDisplayedHtml(messageId: number): string | null {
  const $displayed = retrieveDisplayedMessage(messageId);
  if ($displayed.length === 0) {
    return null;
  }

  const html = $displayed.html();
  if (typeof html !== 'string') {
    return null;
  }

  const trimmed = html.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildCompiledRegexRules(): CompiledRegexRule[] {
  regexCompileError.value = '';
  const compiled: CompiledRegexRule[] = [];

  for (const rule of regexRules.value) {
    if (!rule.enabled) {
      continue;
    }
    const find = rule.find.trim();
    if (!find) {
      continue;
    }
    const flags = rule.flags.trim() || 'g';

    try {
      compiled.push({
        id: rule.id,
        regex: new RegExp(find, flags),
        replace: rule.replace ?? '',
      });
    } catch (error) {
      if (!regexCompileError.value) {
        regexCompileError.value = `规则「${rule.name || rule.id}」编译失败：${String(error)}`;
      }
    }
  }

  return compiled;
}

function applyRegexRulesToText(text: string, rules: CompiledRegexRule[]): string {
  return rules.reduce((result, item) => result.replace(item.regex, item.replace), text);
}

function renderMessageHtmlFromText(text: string, messageId: number): string {
  try {
    const rendered = formatAsDisplayedMessage(text, { message_id: messageId });
    if (rendered.trim()) {
      return rendered;
    }
  } catch (error) {
    console.warn('[全屏覆盖式酒馆前端] 消息渲染失败，回退为纯文本。', { messageId, error });
  }

  return escapeAsDisplayedParagraph(text);
}

function refreshChatMessages() {
  const lastMessageId = getLastMessageId();
  if (lastMessageId < 0) {
    chatMessages.value = [];
    return;
  }

  const compiledRegexRules = buildCompiledRegexRules();
  const hasRegexOverrides = compiledRegexRules.length > 0;
  const chatMessageQueryOptions = {
    hide_state: 'all',
    role: 'all',
  } as const;
  let rawMessages: ChatMessage[] = [];

  try {
    rawMessages = getChatMessages(`0-${lastMessageId}`, chatMessageQueryOptions);
  } catch {
    rawMessages = [];
  }

  if (rawMessages.length === 0) {
    try {
      rawMessages = getChatMessages('0-{{lastMessageId}}', chatMessageQueryOptions);
    } catch {
      rawMessages = [];
    }
  }

  if (rawMessages.length === 0) {
    try {
      rawMessages = getChatMessages('0-', chatMessageQueryOptions);
    } catch {
      rawMessages = [];
    }
  }

  chatMessages.value = rawMessages
    .filter(message => message.role === 'assistant' || message.role === 'user' || message.role === 'system')
    .map(message => {
      const plainText = message.message ?? '';
      const afterRegex = applyRegexRulesToText(plainText, compiledRegexRules);

      if (!hasRegexOverrides) {
        const nativeDisplayedHtml = tryReadNativeDisplayedHtml(message.message_id);
        if (nativeDisplayedHtml) {
          return {
            message_id: message.message_id,
            name: normalizeMessageName(message),
            role: message.role,
            is_hidden: message.is_hidden === true,
            renderedHtml: nativeDisplayedHtml,
          } satisfies RenderableMessage;
        }
      }

      return {
        message_id: message.message_id,
        name: normalizeMessageName(message),
        role: message.role,
        is_hidden: message.is_hidden === true,
        renderedHtml: renderMessageHtmlFromText(afterRegex, message.message_id),
      } satisfies RenderableMessage;
    });
}

function scrollChatToBottom(behavior: ScrollBehavior = 'auto') {
  const element = chatScrollRef.value;
  if (!element) {
    return;
  }

  element.scrollTo({
    top: element.scrollHeight,
    behavior,
  });
}

function requestNativeSend() {
  const inputRaw = draft.value.trim();
  if (!inputRaw) {
    toastr.warning('请输入要发送的文本。', '覆盖层发送');
    return;
  }

  void eventEmit(OVERLAY_EVENTS.REQUEST_NATIVE_SEND, {
    source: 'overlay_ui',
    inputPreview: inputRaw.slice(0, 80),
    inputRaw,
  });
}

function appendRegexRule() {
  const find = draftRegex.value.find.trim();
  if (!find) {
    toastr.warning('请填写查找正则。', '正则规则');
    return;
  }

  const flags = draftRegex.value.flags.trim() || 'g';
  try {
    new RegExp(find, flags);
  } catch (error) {
    toastr.error(`正则编译失败：${String(error)}`, '正则规则');
    return;
  }

  regexRules.value.push({
    id: createRuleId(),
    name: draftRegex.value.name.trim() || `规则${regexRules.value.length + 1}`,
    enabled: true,
    find,
    flags,
    replace: draftRegex.value.replace,
  });

  draftRegex.value = {
    name: '',
    find: '',
    flags: 'g',
    replace: '',
  };

  refreshChatMessages();
}

function removeRegexRule(id: string) {
  regexRules.value = regexRules.value.filter(rule => rule.id !== id);
  refreshChatMessages();
}

function onRegexFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedRegexFile.value = input.files?.[0] ?? null;
}

async function readSelectedFileText() {
  const file = selectedRegexFile.value;
  if (!file) {
    toastr.warning('请先选择一个正则文件。', '正则导入');
    return null;
  }

  try {
    return await file.text();
  } catch (error) {
    toastr.error(`读取文件失败：${String(error)}`, '正则导入');
    return null;
  }
}

function collectRuleCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const arrayKeys = ['regexes', 'items', 'data', 'rules'] as const;
  for (const key of arrayKeys) {
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }

  return [payload];
}

async function importFileAsOverlayRules() {
  const text = await readSelectedFileText();
  if (!text) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    toastr.error(`仅支持 JSON 格式导入：${String(error)}`, '正则导入');
    return;
  }

  const candidates = collectRuleCandidates(parsed);
  const importedRules = candidates
    .map((candidate, index) => parseRuleFromUnknown(candidate, index))
    .filter(Boolean) as OverlayRegexRule[];

  if (importedRules.length === 0) {
    toastr.warning('未识别到可用正则规则。', '正则导入');
    return;
  }

  regexRules.value = [...regexRules.value, ...importedRules];
  refreshChatMessages();
  toastr.success(`已导入 ${importedRules.length} 条规则。`, '正则导入');
}

async function importFileIntoTavernRegex() {
  const file = selectedRegexFile.value;
  const text = await readSelectedFileText();
  if (!file || !text) {
    return;
  }

  try {
    const imported = importRawTavernRegex(file.name, text);
    if (!imported) {
      toastr.error('酒馆正则导入失败。', '正则导入');
      return;
    }

    refreshChatMessages();
    toastr.success('已导入到酒馆正则库。', '正则导入');
  } catch (error) {
    toastr.error(`导入失败：${String(error)}`, '正则导入');
  }
}

onMounted(() => {
  loadSettingsFromVariables();
  requestNativeMessageVisibility(nativeMessagesHidden.value, 'script');

  const refreshDebounced = _.debounce(refreshChatMessages, 30);
  const refreshAndStickBottom = _.debounce(() => {
    refreshChatMessages();
    void nextTick(() => scrollChatToBottom('smooth'));
  }, 30);

  stops.push(eventOn(tavern_events.MESSAGE_SENT, refreshAndStickBottom));
  stops.push(eventOn(tavern_events.MESSAGE_RECEIVED, refreshAndStickBottom));
  stops.push(eventOn(tavern_events.GENERATION_ENDED, refreshAndStickBottom));
  stops.push(eventOn(tavern_events.MESSAGE_UPDATED, refreshDebounced));
  stops.push(eventOn(tavern_events.MESSAGE_EDITED, refreshDebounced));
  stops.push(eventOn(tavern_events.MESSAGE_DELETED, refreshDebounced));
  stops.push(eventOn(tavern_events.MORE_MESSAGES_LOADED, refreshDebounced));
  stops.push(
    eventOn(tavern_events.CHAT_CHANGED, () => {
      draft.value = '';
      refreshAndStickBottom();
    }),
  );
  stops.push(
    eventOn(OVERLAY_EVENTS.NATIVE_SEND_RESULT, payload => {
      const result = payload as NativeSendResultPayload;
      if (result.clicked) {
        draft.value = '';
        return;
      }
      toastr.error(result.reason ?? '未知原因', '覆盖层发送失败');
    }),
  );
  stops.push(
    eventOn(OVERLAY_EVENTS.NATIVE_MESSAGE_VISIBILITY_CHANGED, payload => {
      nativeMessagesHidden.value = normalizeNativeMessageVisibility(payload).hidden;
    }),
  );

  refreshChatMessages();
  void nextTick(() => scrollChatToBottom());
});

watch(
  () => chatMessages.value.length,
  async (next, previous) => {
    if (next <= previous) {
      return;
    }
    await nextTick();
    scrollChatToBottom('smooth');
  },
);

watch(
  [nativeMessagesHidden, regexRules],
  () => {
    persistSettingsDebounced();
    refreshChatMessages();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  persistSettingsDebounced.flush();
  persistSettingsDebounced.cancel();
  stops.forEach(handle => handle.stop());
});
</script>

<style scoped>
.overlay-root {
  width: 100vw;
  height: 100dvh;
  margin: 0;
  padding: 12px;
  color: var(--text-color);
  background: var(--page-bg);
  font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}

.overlay-root[data-theme='cyber_blue'] {
  --page-bg: radial-gradient(circle at 18% 10%, #14263f 0%, #070b13 52%, #03050a 100%);
  --panel-bg: linear-gradient(155deg, rgba(10, 13, 21, 0.94), rgba(18, 29, 48, 0.92));
  --line-color: rgba(78, 230, 255, 0.55);
  --text-color: #dff5ff;
  --sub-color: #9ec9db;
  --accent: #45f3ff;
  --accent-soft: rgba(69, 243, 255, 0.24);
  --input-bg: rgba(4, 8, 16, 0.92);
  --btn-bg: linear-gradient(140deg, #04070d, #0e1728);
  --btn-fg: #dff5ff;
  --assistant-bubble: linear-gradient(150deg, rgba(10, 18, 31, 0.96), rgba(20, 35, 58, 0.88));
  --user-bubble: linear-gradient(145deg, rgba(7, 41, 68, 0.92), rgba(6, 26, 48, 0.92));
  --system-bubble: linear-gradient(145deg, rgba(22, 24, 30, 0.92), rgba(17, 19, 24, 0.92));
}

.overlay-root[data-theme='cyber_pink'] {
  --page-bg: radial-gradient(circle at 20% 8%, #f3f4f8 0%, #d0d3dd 55%, #b6b9c3 100%);
  --panel-bg: linear-gradient(150deg, rgba(236, 239, 246, 0.97), rgba(202, 206, 216, 0.95));
  --line-color: rgba(255, 64, 176, 0.55);
  --text-color: #161922;
  --sub-color: #3f475b;
  --accent: #ff44c2;
  --accent-soft: rgba(255, 68, 194, 0.22);
  --input-bg: rgba(245, 247, 251, 0.94);
  --btn-bg: linear-gradient(150deg, #eceff6, #cfd4df);
  --btn-fg: #1b1f2b;
  --assistant-bubble: linear-gradient(145deg, rgba(232, 236, 244, 0.97), rgba(220, 225, 235, 0.95));
  --user-bubble: linear-gradient(145deg, rgba(255, 225, 245, 0.96), rgba(255, 212, 238, 0.96));
  --system-bubble: linear-gradient(145deg, rgba(222, 224, 229, 0.95), rgba(208, 211, 219, 0.94));
}

.panel {
  width: 100%;
  height: calc(100dvh - 24px);
  border-radius: 18px;
  border: 1px solid var(--line-color);
  padding: 20px;
  background: var(--panel-bg);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 20px 50px rgba(0, 0, 0, 0.25);
  display: grid;
  grid-template-rows: auto auto auto 1fr auto auto;
  gap: 12px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.close-btn,
.native-ui-btn,
.action-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 8px 14px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.action-btn.danger {
  border-color: rgba(255, 99, 132, 0.7);
}

.theme-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.theme-btn {
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.theme-btn:hover {
  transform: translateY(-1px);
}

.theme-btn[aria-pressed='true'] {
  box-shadow: 0 0 0 1px var(--line-color), 0 0 18px var(--accent-soft);
}

.theme-btn.blue {
  border: 1px solid rgba(71, 236, 255, 0.65);
  color: #dff7ff;
  background: linear-gradient(150deg, #05080f, #101a2a);
}

.theme-btn.pink {
  border: 1px solid rgba(255, 72, 190, 0.62);
  color: #241930;
  background: linear-gradient(150deg, #edeff5, #d8dce8);
}

.regex-panel {
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.08);
}

.regex-panel > summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-color);
}

.regex-body {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}

.regex-creator,
.regex-rule-top,
.regex-rule-fields,
.regex-actions {
  display: grid;
  gap: 8px;
}

.regex-creator {
  grid-template-columns: 1fr 1.6fr 92px;
}

.regex-rule-top {
  grid-template-columns: auto 1fr auto;
}

.regex-rule-fields {
  grid-template-columns: 1.6fr 92px;
}

.regex-actions {
  grid-template-columns: repeat(auto-fit, minmax(132px, max-content));
  align-items: center;
}

.replace-input {
  grid-column: 1 / -1;
}

.rule-input {
  width: 100%;
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 7px 10px;
  color: var(--text-color);
  background: var(--input-bg);
  outline: none;
}

.rule-input.flags {
  text-align: center;
}

.file-picker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--line-color);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}

.file-picker input {
  display: none;
}

.file-hint {
  margin: 0;
  color: var(--sub-color);
  font-size: 12px;
}

.regex-error {
  margin: 0;
  color: #ff7fa2;
  font-size: 12px;
}

.regex-rule-list {
  display: grid;
  gap: 8px;
}

.regex-rule {
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.rule-enable {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sub-color);
  font-size: 13px;
}

.chat-box {
  min-height: 0;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid var(--line-color);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(0, 0, 0, 0.1);
}

.message-row {
  max-width: min(860px, 96%);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-row.role-user {
  align-self: flex-end;
}

.message-row.role-assistant,
.message-row.role-system {
  align-self: flex-start;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--sub-color);
}

.hidden-tag {
  color: #ff9abd;
}

.is-hidden-message .bubble {
  box-shadow: 0 0 0 1px rgba(255, 128, 168, 0.42) inset;
}

.bubble {
  border-radius: 10px;
  border: 1px solid var(--line-color);
  padding: 10px 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.role-assistant .bubble {
  background: var(--assistant-bubble);
}

.role-user .bubble {
  background: var(--user-bubble);
}

.role-system .bubble {
  background: var(--system-bubble);
}

.placeholder {
  margin: auto 0;
  color: var(--sub-color);
  text-align: center;
}

.input-shell {
  position: relative;
  border-radius: 14px;
  padding: 1px;
  background: linear-gradient(120deg, transparent 0%, var(--accent) 45%, transparent 100%);
  background-size: 220% 100%;
  animation: borderScan 2s linear infinite;
}

.input-shell::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 16px;
  pointer-events: none;
  box-shadow: 0 0 18px var(--accent-soft);
  animation: borderPulse 2.2s ease-in-out infinite;
}

.input-box {
  position: relative;
  z-index: 1;
  width: 100%;
  resize: none;
  min-height: 96px;
  border: none;
  border-radius: 13px;
  padding: 14px;
  color: var(--text-color);
  background: var(--input-bg);
  outline: none;
  font-size: 14px;
  line-height: 1.55;
}

.input-box::placeholder {
  color: var(--sub-color);
}

.action-row {
  display: flex;
  justify-content: flex-end;
}

.send-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 9px 18px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  box-shadow: 0 0 14px var(--accent-soft);
  cursor: pointer;
}

@keyframes borderPulse {
  0%,
  100% {
    opacity: 0.48;
  }
  50% {
    opacity: 1;
  }
}

@keyframes borderScan {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

@media (max-width: 900px) {
  .regex-creator,
  .regex-rule-top,
  .regex-rule-fields {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .overlay-root {
    padding: 8px;
  }

  .panel {
    height: calc(100dvh - 16px);
    padding: 14px;
    gap: 10px;
  }

  h1 {
    font-size: 20px;
  }

  .panel-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .head-actions {
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}
</style>
