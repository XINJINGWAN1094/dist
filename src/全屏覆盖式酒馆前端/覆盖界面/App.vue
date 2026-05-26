<template>
  <main class="overlay-root" :data-surface="surfaceStyle" :data-glow="glowStyle">
    <section class="panel">
      <aside class="page-nav">
        <p class="nav-title">页面导航</p>
        <button type="button" class="nav-btn" :aria-pressed="activePage === 'info'" @click="switchPage('info')">信息</button>
        <button type="button" class="nav-btn" :aria-pressed="activePage === 'squad'" @click="switchPage('squad')">战队</button>
        <button type="button" class="nav-btn" :aria-pressed="activePage === 'battle'" @click="switchPage('battle')">
          战斗场
        </button>
        <button type="button" class="nav-btn" :aria-pressed="activePage === 'training'" @click="switchPage('training')">
          训练场
        </button>
        <button type="button" class="nav-btn" :aria-pressed="activePage === 'map'" @click="switchPage('map')">
          息界地图
        </button>
        <button type="button" class="nav-btn" :aria-pressed="activePage === 'settings'" @click="switchPage('settings')">
          设置
        </button>
      </aside>

      <section class="page-stage">
        <header class="panel-head">
          <div class="toolbar-strip">
            <p class="toolbar-story-label">剧情日期 · {{ storyTimePeriodText }}</p>
            <button type="button" class="date-trigger" :aria-expanded="calendarOpen" @click="toggleCalendarOpen">
              <strong>{{ storyDate.display_text }}</strong>
            </button>
            <span class="toolbar-clock" :title="liveClockDateText">{{ liveClockTimeText }}</span>
            <button type="button" class="close-btn" @click="closeOverlay">关闭覆盖页</button>
          </div>

          <section v-if="calendarOpen" class="calendar-popover">
            <div class="calendar-summary">
              <div class="calendar-story">
                <p class="calendar-kicker">当前剧情日期</p>
                <h2>{{ storyDate.display_text }}</h2>
                <p class="calendar-meta">{{ storyDate.iso_date }} · {{ storyTimePeriodText }}</p>
              </div>
              <div class="calendar-clock">
                <p class="calendar-kicker">现实时间</p>
                <strong>{{ liveClockTimeText }}</strong>
                <span>{{ liveClockDateText }}</span>
              </div>
            </div>

            <div class="calendar-layout">
              <section class="calendar-panel">
                <div class="calendar-panel-head">
                  <div>
                    <strong>{{ calendarViewLabel }}</strong>
                    <p class="calendar-status">当前查看：{{ calendarSelectedDisplayText }}</p>
                  </div>
                  <span class="calendar-status">{{ dateSyncStatusText }}</span>
                </div>

                <div class="calendar-controls">
                  <div class="calendar-control-group">
                    <button type="button" class="calendar-nav-btn" @click="shiftCalendarViewYear(-1)">上一年</button>
                    <button type="button" class="calendar-nav-btn" @click="shiftCalendarViewMonth(-1)">上月</button>
                  </div>

                  <label class="calendar-picker">
                    <span>年份</span>
                    <input
                      v-model.number="calendarViewYear"
                      type="number"
                      min="1"
                      max="9999"
                      class="calendar-picker-input"
                      @change="commitCalendarView"
                    />
                  </label>

                  <label class="calendar-picker">
                    <span>月份</span>
                    <select v-model.number="calendarViewMonth" class="calendar-picker-input" @change="commitCalendarView">
                      <option v-for="month in calendarMonthOptions" :key="month" :value="month">{{ month }}月</option>
                    </select>
                  </label>

                  <div class="calendar-control-group">
                    <button type="button" class="calendar-nav-btn" @click="shiftCalendarViewMonth(1)">下月</button>
                    <button type="button" class="calendar-nav-btn" @click="shiftCalendarViewYear(1)">下一年</button>
                  </div>

                  <button type="button" class="calendar-jump-btn" @click="jumpCalendarToStoryDate">回到今日</button>
                </div>

                <div class="calendar-weekdays">
                  <span v-for="weekday in calendarWeekdays" :key="weekday">{{ weekday }}</span>
                </div>
                <div class="calendar-days">
                  <button
                    v-for="cell in calendarCells"
                    :key="cell.key"
                    type="button"
                    class="calendar-day"
                    :class="{
                      empty: cell.day == null,
                      active: cell.isCurrentStoryDay,
                      selected: cell.isSelectedDay,
                      scheduled: cell.scheduleCount > 0,
                    }"
                    :disabled="cell.day == null"
                    @click="selectCalendarDay(cell)"
                  >
                    <span class="calendar-day-number">{{ cell.day ?? '' }}</span>
                    <span v-if="cell.scheduleCount > 0" class="calendar-day-badge">{{ cell.scheduleCount }}</span>
                    <span v-if="cell.isCurrentStoryDay" class="calendar-day-mark">今</span>
                  </button>
                </div>
              </section>

              <aside class="schedule-panel">
                <div class="schedule-panel-head">
                  <div>
                    <p class="calendar-kicker">查看日期</p>
                    <h3>{{ calendarSelectedDisplayText }}</h3>
                    <p class="calendar-meta">{{ calendarSelectedIsoDate }} · {{ selectedDateRelationText }}</p>
                  </div>
                  <button v-if="canCreateSchedule" type="button" class="action-btn" @click="openScheduleEditor">
                    标记行程
                  </button>
                </div>

                <p class="schedule-note">{{ scheduleActionHintText }}</p>

                <section v-if="scheduleEditorOpen" class="schedule-editor">
                  <input
                    v-model="scheduleDraft.title"
                    type="text"
                    maxlength="5"
                    class="rule-input"
                    placeholder="标题，最多 5 个字"
                  />
                  <textarea
                    v-model="scheduleDraft.content"
                    class="rule-input schedule-textarea"
                    rows="5"
                    placeholder="到达这一天时，会把这里的内容自动填入输入框，但不会自动发送。"
                  ></textarea>
                  <div class="schedule-editor-actions">
                    <button type="button" class="action-btn" @click="saveSchedule">保存行程</button>
                    <button type="button" class="action-btn" @click="cancelScheduleEditor">取消</button>
                  </div>
                </section>

                <div class="schedule-list">
                  <article v-for="schedule in selectedDateSchedules" :key="schedule.id" class="schedule-item">
                    <div class="schedule-item-head">
                      <strong>{{ schedule.title || '未命名行程' }}</strong>
                      <span class="schedule-state" :data-delivered="schedule.delivered">
                        {{ schedule.delivered ? '已到达' : '未到达' }}
                      </span>
                    </div>
                    <p class="schedule-item-content">{{ schedule.content }}</p>
                    <button type="button" class="action-btn danger schedule-remove-btn" @click="removeSchedule(schedule.id)">
                      删除
                    </button>
                  </article>
                  <p v-if="selectedDateSchedules.length === 0" class="schedule-empty">这一天还没有已标记的行程。</p>
                </div>
              </aside>
            </div>

            <p class="calendar-foot">最近同步：{{ storyDateLastSyncedText }}</p>
          </section>
        </header>

        <section v-if="activePage === 'info'" class="page-view info-view">
          <section ref="chatScrollRef" class="chat-box">
            <article
              v-for="message in chatMessages"
              :key="message.message_id"
              class="message-row"
              :class="[
                `role-${message.role}`,
                {
                  'is-hidden-message': message.is_hidden,
                  'is-editing': editingMessageId === message.message_id,
                  'is-busy': busyMessageId === message.message_id,
                },
              ]"
            >
              <div class="message-head">
                <p class="meta">
                  {{ message.name }} · #{{ message.message_id }}
                  <span v-if="message.is_hidden" class="hidden-tag">· 原生隐藏</span>
                </p>
                <div class="message-actions">
                  <button type="button" class="message-action-btn" :disabled="chatOperationBusy" @click="beginEditMessage(message)">
                    编辑
                  </button>
                  <button
                    v-if="message.message_id > 0"
                    type="button"
                    class="message-action-btn danger"
                    :disabled="chatOperationBusy"
                    @click="withdrawMessage(message)"
                  >
                    撤回
                  </button>
                  <button
                    v-if="message.message_id > 0 && message.role === 'user'"
                    type="button"
                    class="message-action-btn"
                    :disabled="chatOperationBusy"
                    @click="resendUserMessage(message)"
                  >
                    重新发送
                  </button>
                  <button
                    v-if="message.message_id > 0 && message.role === 'assistant'"
                    type="button"
                    class="message-action-btn"
                    :disabled="chatOperationBusy"
                    @click="regenerateAssistantMessage(message)"
                  >
                    重新生成
                  </button>
                </div>
              </div>

              <section v-if="editingMessageId === message.message_id" class="message-editor">
                <textarea
                  v-model="editingMessageText"
                  class="message-edit-box"
                  :data-message-edit-id="message.message_id"
                  rows="6"
                ></textarea>
                <div class="message-editor-actions">
                  <button type="button" class="action-btn" :disabled="chatOperationBusy" @click="saveEditedMessage(message)">
                    保存
                  </button>
                  <button type="button" class="action-btn" :disabled="chatOperationBusy" @click="cancelEditMessage">取消</button>
                </div>
              </section>
              <div v-else class="bubble" v-html="message.renderedHtml"></div>
            </article>
            <p v-if="chatMessages.length === 0" class="placeholder">当前聊天暂无可显示消息。</p>
          </section>

          <div class="composer-row">
            <div class="input-shell">
              <textarea
                v-model="draft"
                class="input-box"
                rows="3"
                placeholder="输入发送前原始文本。发送会走酒馆原生按钮链路。"
              ></textarea>
            </div>
            <button type="button" class="send-btn" @click="requestNativeSend">发送</button>
          </div>
        </section>

        <section v-else-if="activePage === 'squad'" class="page-view simple-view battle-view">
          <SquadRoster />
        </section>

        <section v-else-if="activePage === 'battle'" class="page-view simple-view battle-view">
          <BattleArena mode="story" :ignored-story-battle-session-id="ignoredStoryBattleSessionId" />
        </section>

        <section v-else-if="activePage === 'training'" class="page-view simple-view battle-view">
          <BattleArena mode="training" />
        </section>

        <section v-else-if="activePage === 'map'" class="page-view map-view" :class="{ 'is-expanded': mapExpanded }">
          <button
            type="button"
            class="map-expand-btn"
            :aria-pressed="mapExpanded"
            :aria-label="mapExpanded ? '复原息界地图' : '放大息界地图'"
            :title="mapExpanded ? '复原息界地图' : '放大息界地图'"
            @click="toggleMapExpanded"
          >
            {{ mapExpanded ? '复原' : '放大' }}
          </button>
          <iframe
            v-if="mapLoaded"
            ref="mapFrameRef"
            class="map-frame"
            title="息界地图"
            :srcdoc="earthPageHtml"
            @load="handleMapFrameLoad"
          ></iframe>
        </section>

        <section v-else class="page-view settings-view">
          <article class="settings-card">
            <h2>页面底色</h2>
            <p class="settings-note">切换覆盖层底色，光效颜色可单独选择。</p>
            <div class="theme-switch">
              <button
                type="button"
                class="theme-btn base-black"
                :aria-pressed="surfaceStyle === 'black'"
                @click="setSurfaceStyle('black')"
              >
                黑底
              </button>
              <button
                type="button"
                class="theme-btn base-silver"
                :aria-pressed="surfaceStyle === 'silver'"
                @click="setSurfaceStyle('silver')"
              >
                银底
              </button>
            </div>
          </article>

          <article class="settings-card">
            <h2>页面光效</h2>
            <p class="settings-note">切换边框、按钮和输入区的赛博光效颜色。</p>
            <div class="theme-switch">
              <button
                type="button"
                class="theme-btn glow-blue"
                :aria-pressed="glowStyle === 'cyber_blue'"
                @click="setGlowStyle('cyber_blue')"
              >
                赛博蓝光
              </button>
              <button
                type="button"
                class="theme-btn glow-pink"
                :aria-pressed="glowStyle === 'cyber_pink'"
                @click="setGlowStyle('cyber_pink')"
              >
                赛博粉红
              </button>
              <button
                type="button"
                class="theme-btn glow-green"
                :aria-pressed="glowStyle === 'cyber_green'"
                @click="setGlowStyle('cyber_green')"
              >
                赛博绿光
              </button>
              <button
                type="button"
                class="theme-btn glow-purple"
                :aria-pressed="glowStyle === 'cyber_purple'"
                @click="setGlowStyle('cyber_purple')"
              >
                赛博紫光
              </button>
            </div>
          </article>

          <article class="settings-card">
            <div class="settings-heading">
              <div>
                <h2>显示选项</h2>
                <p class="settings-note">原生消息的显示切换移动到设置页里，方便在覆盖层和酒馆原生楼层之间来回调试。</p>
              </div>
            </div>
            <div class="settings-actions">
              <button type="button" class="action-btn" @click="toggleNativeMessageVisibility">
                {{ nativeMessagesHidden ? '显示原生消息' : '隐藏原生消息' }}
              </button>
            </div>
          </article>

          <article class="settings-card">
            <div class="settings-heading">
              <div>
                <h2>日期同步模型</h2>
                <p class="settings-note">直接改“日期变量同步脚本”的兼容 URL、API Key 和模型，不改它现有变量键结构。</p>
              </div>
              <span class="status-chip" :data-state="dateSyncReady ? 'ready' : 'missing'">{{ dateSyncStatusText }}</span>
            </div>

            <label class="settings-toggle">
              <span>启用日期同步</span>
              <input v-model="dateSyncSettings.enabled" type="checkbox" />
            </label>

            <div class="settings-grid">
              <label class="settings-field">
                <span>兼容 URL</span>
                <input
                  v-model="dateSyncSettings.base_url"
                  type="text"
                  class="rule-input"
                  placeholder="https://example.com/v1 或 .../chat/completions"
                />
              </label>

              <label class="settings-field">
                <span>API Key</span>
                <input v-model="dateSyncSettings.api_key" type="password" class="rule-input" placeholder="sk-..." />
              </label>

              <label class="settings-field">
                <span>模型 ID</span>
                <input
                  v-model="dateSyncSettings.model"
                  type="text"
                  class="rule-input"
                  list="story-date-model-list"
                  placeholder="拉取后选择，或手动填写模型名"
                />
                <datalist id="story-date-model-list">
                  <option v-for="option in modelOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
                </datalist>
              </label>

              <label class="settings-field small">
                <span>超时（ms）</span>
                <input v-model.number="dateSyncSettings.timeout_ms" type="number" min="3000" step="1000" class="rule-input" />
              </label>
            </div>

            <label class="settings-toggle">
              <span>调试日志</span>
              <input v-model="dateSyncSettings.debug" type="checkbox" />
            </label>

            <div class="settings-actions">
              <button type="button" class="action-btn" :disabled="fetchingModels" @click="fetchCompatibleModels">
                {{ fetchingModels ? '拉取中…' : '拉取模型' }}
              </button>
              <button type="button" class="action-btn" @click="loadDateSyncSettings()">重新读取</button>
              <button type="button" class="action-btn" :disabled="savingDateSyncSettings || !dateSyncReady" @click="saveDateSyncSettings">
                {{ savingDateSyncSettings ? '保存中…' : '保存设置' }}
              </button>
            </div>

            <div v-if="modelOptions.length > 0" class="model-pill-list">
              <span v-for="option in modelOptions" :key="option.id" class="model-pill">{{ option.label }}</span>
            </div>

            <p class="file-hint">{{ dateSyncHintText }}</p>
          </article>
        </section>
      </section>
    </section>

    <section v-if="battlePromptOpen" class="battle-prompt-backdrop" role="dialog" aria-modal="true" aria-labelledby="battle-prompt-title">
      <article class="battle-prompt">
        <h2 id="battle-prompt-title">检测到比赛开始</h2>
        <p>检测到比赛开始，你可以前往战斗场控制战斗，也可以选择无视本消息，继续聊天控制战斗走向</p>
        <div class="battle-prompt-actions">
          <button type="button" class="action-btn" @click="goToBattleArenaFromPrompt">前往战斗场</button>
          <button type="button" class="action-btn" @click="ignoreBattlePrompt">无视</button>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BattleArena from './页面预留/BattleArena.vue';
import SquadRoster from './页面预留/SquadRoster.vue';
import earthPageHtml from '../../3D地球星空脚本/earth-page.html';
import {
  OVERLAY_EVENTS,
  type NativeMessageVisibilityPayload,
  type NativeSendResultPayload,
  type OverlayVisibilityPayload,
} from '../共享/协议';
import {
  createDefaultStoryBattleState,
  isStoryBattleActive,
  normalizeStoryBattleState,
  STORY_BATTLE_STATE_KEY,
  type StoryBattleState,
} from '../共享/比赛状态';

type OverlaySurfaceStyle = 'black' | 'silver';
type OverlayGlowStyle = 'cyber_blue' | 'cyber_pink' | 'cyber_green' | 'cyber_purple';
type LegacyOverlayTheme = 'cyber_blue' | 'cyber_pink';
type OverlayPage = 'info' | 'squad' | 'battle' | 'training' | 'map' | 'settings';
type RenderableMessage = {
  message_id: number;
  name: string;
  role: 'system' | 'assistant' | 'user';
  is_hidden: boolean;
  rawText: string;
  renderedHtml: string;
};

type OverlayStoredSettings = {
  version: number;
  nativeMessagesHidden: boolean;
  surfaceStyle: OverlaySurfaceStyle;
  glowStyle: OverlayGlowStyle;
};

type OverlayScheduleItem = {
  id: string;
  dateIso: string;
  title: string;
  content: string;
  delivered: boolean;
  deliveredAt: string;
};

type OverlayChatStoredState = {
  version: number;
  schedules: OverlayScheduleItem[];
};

type StoryDateState = {
  calendar: 'gregorian';
  year: number;
  month: number;
  day: number;
  iso_date: string;
  display_text: string;
  time_period: string;
  last_synced_at: string;
};

type DateSyncSettings = {
  enabled: boolean;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms: number;
  debug: boolean;
};

type ModelOption = {
  id: string;
  label: string;
};

type CalendarCell = {
  key: string;
  day: number | null;
  isoDate: string | null;
  isCurrentStoryDay: boolean;
  isSelectedDay: boolean;
  scheduleCount: number;
};

type ScriptButtonMap = Record<string, Array<{ button_id: string; button_name: string }>>;
type ScriptTreeKind = 'global' | 'preset' | 'character';
type ScriptTreeScriptNode = {
  type: 'script';
  id: string;
  name: string;
  content?: string;
  enabled?: boolean;
};
type ScriptTreeFolderNode = {
  type: 'folder';
  scripts?: ScriptTreeNode[];
};
type ScriptTreeNode = ScriptTreeScriptNode | ScriptTreeFolderNode;
type TavernHelperScriptApi = Window['TavernHelper'] & {
  getAllEnabledScriptButtons?: () => ScriptButtonMap;
  getScriptTrees?: (option: { type: ScriptTreeKind }) => ScriptTreeNode[];
};
type TavernHelperSlashApi = Window['TavernHelper'] & {
  triggerSlash?: (command: string) => Promise<string>;
};

const OVERLAY_SETTINGS_KEY = 'th_fullscreen_overlay.settings.v1';
const OVERLAY_SETTINGS_VERSION = 1;
const OVERLAY_CHAT_STATE_KEY = 'th_fullscreen_overlay_chat_state_v1';
const OVERLAY_CHAT_STATE_VERSION = 1;
const DATE_SYNC_BUTTON_NAME = '重算日期';
const DATE_SYNC_SCRIPT_NAME = '日期变量同步脚本';
const DATE_SYNC_SETTINGS_KEY = 'story_date_settings';
const STORY_DATE_KEY = 'story_date';
const STORY_DATE_DEFAULT = { year: 3197, month: 5, day: 29 } as const;
const DATE_SYNC_TIMEOUT_DEFAULT_MS = 30_000;
const CALENDAR_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const;
const CALENDAR_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MIN_CALENDAR_YEAR = 1;
const MAX_CALENDAR_YEAR = 9999;
const DATE_SYNC_SCRIPT_TREE_TYPES: ScriptTreeKind[] = ['global', 'preset', 'character'];
const TIME_PERIOD_LABELS: Record<string, string> = {
  unknown: '时段未定',
  morning: '上午',
  noon: '中午',
  afternoon: '下午',
  evening: '傍晚',
  night: '夜晚',
};
const NOOP_EVENT_ON_RETURN: EventOnReturn = {
  stop: () => {},
};
const FALLBACK_TAVERN_EVENTS = {
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  GENERATION_ENDED: 'generation_ended',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MORE_MESSAGES_LOADED: 'more_messages_loaded',
  CHAT_CHANGED: 'chat_id_changed',
} as const;

type OverlayTavernEventKey = keyof typeof FALLBACK_TAVERN_EVENTS;
type HostRuntime = Window &
  typeof globalThis & {
    eventOn?: (eventType: string, listener: (...args: any[]) => void) => EventOnReturn;
    eventEmit?: (eventType: string, ...data: any[]) => Promise<void>;
    tavern_events?: Partial<Record<OverlayTavernEventKey, string>>;
    getScriptId?: () => string;
    getAllEnabledScriptButtons?: () => ScriptButtonMap;
    triggerSlash?: (command: string) => Promise<string>;
  };

function resolveHostRuntime(): HostRuntime | null {
  const candidates: Array<Window | null | undefined> = [window, window.parent, window.top];
  const visited = new Set<Window>();

  for (const candidate of candidates) {
    if (!candidate || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    try {
      const runtime = candidate as HostRuntime;
      if (!runtime.TavernHelper) {
        continue;
      }
      if (typeof runtime.eventOn === 'function' && typeof runtime.eventEmit === 'function') {
        return runtime;
      }
      return runtime;
    } catch {
      // ignore cross-origin access failures
    }
  }

  return null;
}

function withTavernHelper<T>(context: string, fallback: T, runner: (helper: Window['TavernHelper']) => T): T {
  const runtime = resolveHostRuntime();
  const helper = runtime?.TavernHelper;
  if (!helper) {
    console.error(`[全屏覆盖式酒馆前端] ${context} 失败：未找到 TavernHelper。`);
    return fallback;
  }

  try {
    return runner(helper);
  } catch (error) {
    console.error(`[全屏覆盖式酒馆前端] ${context} 失败。`, error);
    return fallback;
  }
}

function getRuntimeScriptId(): string | null {
  const runtime = resolveHostRuntime();
  if (!runtime?.getScriptId) {
    return null;
  }

  try {
    const scriptId = runtime.getScriptId();
    return scriptId.trim() ? scriptId : null;
  } catch (error) {
    console.error('[全屏覆盖式酒馆前端] 读取 script_id 失败。', error);
    return null;
  }
}

function emitOverlayEvent(eventType: string, ...payload: unknown[]) {
  const runtime = resolveHostRuntime();
  if (!runtime?.eventEmit) {
    console.error(`[全屏覆盖式酒馆前端] 发送事件失败：${eventType}`);
    return Promise.resolve();
  }

  try {
    return runtime.eventEmit(eventType, ...payload);
  } catch (error) {
    console.error(`[全屏覆盖式酒馆前端] 发送事件失败：${eventType}`, error);
    return Promise.resolve();
  }
}

function onOverlayEvent(eventType: string, listener: (...args: any[]) => void): EventOnReturn {
  const runtime = resolveHostRuntime();
  if (!runtime?.eventOn) {
    console.error(`[全屏覆盖式酒馆前端] 监听事件失败：${eventType}`);
    return NOOP_EVENT_ON_RETURN;
  }

  try {
    return runtime.eventOn(eventType, listener);
  } catch (error) {
    console.error(`[全屏覆盖式酒馆前端] 监听事件失败：${eventType}`, error);
    return NOOP_EVENT_ON_RETURN;
  }
}

async function triggerHostSlash(command: string): Promise<string | undefined> {
  const runtime = resolveHostRuntime();
  const trigger = runtime?.triggerSlash ?? (runtime?.TavernHelper as TavernHelperSlashApi | undefined)?.triggerSlash;
  if (!trigger) {
    console.error(`[全屏覆盖式酒馆前端] 运行命令失败：未找到 triggerSlash。`);
    return undefined;
  }

  try {
    return await trigger(command);
  } catch (error) {
    console.error(`[全屏覆盖式酒馆前端] 运行命令失败：${command}`, error);
    return undefined;
  }
}

function getTavernEventName(key: OverlayTavernEventKey): string {
  const runtime = resolveHostRuntime();
  const eventName = runtime?.tavern_events?.[key];
  return typeof eventName === 'string' && eventName.trim() ? eventName : FALLBACK_TAVERN_EVENTS[key];
}

const draft = ref('');
const surfaceStyle = ref<OverlaySurfaceStyle>('black');
const glowStyle = ref<OverlayGlowStyle>('cyber_blue');
const activePage = ref<OverlayPage>('info');
const mapLoaded = ref(false);
const mapExpanded = ref(false);
const mapFrameRef = ref<HTMLIFrameElement | null>(null);
const chatMessages = ref<RenderableMessage[]>([]);
const chatScrollRef = ref<HTMLElement | null>(null);
const nativeMessagesHidden = ref(true);
const editingMessageId = ref<number | null>(null);
const editingMessageText = ref('');
const busyMessageId = ref<number | null>(null);
const stops: EventOnReturn[] = [];
const calendarOpen = ref(false);
const liveNow = ref(new Date());
const storyDate = ref<StoryDateState>(createDefaultStoryDate());
const storyBattleState = ref<StoryBattleState>(createDefaultStoryBattleState());
const battlePromptOpen = ref(false);
const battlePromptSessionId = ref('');
const ignoredStoryBattleSessionId = ref<string | null>(null);
const lastPromptedStoryBattleSessionId = ref('');
const dateSyncSettings = ref<DateSyncSettings>(createDefaultDateSyncSettings());
const dateSyncScriptId = ref<string | null>(null);
const dateSyncStatusMessage = ref('');
const modelOptions = ref<ModelOption[]>([]);
const fetchingModels = ref(false);
const savingDateSyncSettings = ref(false);
const overlaySchedules = ref<OverlayScheduleItem[]>([]);
const calendarViewYear = ref(STORY_DATE_DEFAULT.year);
const calendarViewMonth = ref(STORY_DATE_DEFAULT.month);
const selectedCalendarDay = ref(STORY_DATE_DEFAULT.day);
const scheduleEditorOpen = ref(false);
const scheduleDraft = ref({
  title: '',
  content: '',
});
let liveClockTimer: number | null = null;
let storyDateTimer: number | null = null;

const chatOperationBusy = computed(() => busyMessageId.value !== null);
const liveClockTimeText = computed(() => formatClockTime(liveNow.value));
const liveClockDateText = computed(() => formatClockDate(liveNow.value));
const storyTimePeriodText = computed(() => TIME_PERIOD_LABELS[storyDate.value.time_period] ?? '时段未定');
const storyDateLastSyncedText = computed(() => formatSyncTimestamp(storyDate.value.last_synced_at));
const calendarWeekdays = CALENDAR_WEEKDAYS;
const calendarMonthOptions = CALENDAR_MONTH_OPTIONS;
const calendarViewParts = computed(() => {
  const year = clampCalendarYear(calendarViewYear.value);
  const month = _.clamp(coerceInteger(calendarViewMonth.value, STORY_DATE_DEFAULT.month), 1, 12);
  const day = _.clamp(coerceInteger(selectedCalendarDay.value, STORY_DATE_DEFAULT.day), 1, getDaysInMonth(year, month));
  return { year, month, day };
});
const calendarViewLabel = computed(() => `${calendarViewParts.value.year}年 ${calendarViewParts.value.month}月`);
const calendarSelectedIsoDate = computed(() => formatIsoDate(calendarViewParts.value));
const calendarSelectedDisplayText = computed(() => formatDisplayDate(calendarViewParts.value));
const selectedDateSchedules = computed(() =>
  overlaySchedules.value
    .filter(schedule => schedule.dateIso === calendarSelectedIsoDate.value)
    .sort((left, right) => Number(left.delivered) - Number(right.delivered)),
);
const canCreateSchedule = computed(() => compareIsoDates(calendarSelectedIsoDate.value, storyDate.value.iso_date) > 0);
const selectedDateRelationText = computed(() => {
  const compared = compareIsoDates(calendarSelectedIsoDate.value, storyDate.value.iso_date);
  if (compared > 0) {
    return '未来日期';
  }
  if (compared < 0) {
    return '已过去';
  }
  return '当前剧情日期';
});
const scheduleActionHintText = computed(() => {
  if (canCreateSchedule.value) {
    return '只有日期变量真正推进到这一天时，行程内容才会自动写入输入框，标题不会被填入。';
  }
  if (calendarSelectedIsoDate.value === storyDate.value.iso_date) {
    return '今天的剧情日期只能由变量控制，这里可以查看行程，但不能手动把今天改成别的日期。';
  }
  return '只能给未来日期标记行程；查看过去日期时不会改动当前剧情日期。';
});
const calendarCells = computed(() =>
  buildCalendarCells(
    calendarViewParts.value.year,
    calendarViewParts.value.month,
    storyDate.value,
    calendarViewParts.value.day,
    overlaySchedules.value,
  ),
);
const dateSyncReady = computed(() => Boolean(dateSyncScriptId.value));
const dateSyncStatusText = computed(() => {
  if (!dateSyncScriptId.value) {
    return '未找到脚本';
  }
  if (!dateSyncSettings.value.enabled) {
    return '已关闭';
  }
  if (!hasDateSyncModelConfig(dateSyncSettings.value)) {
    return '待配置';
  }
  return '已就绪';
});
const dateSyncHintText = computed(() => {
  if (dateSyncStatusMessage.value.trim()) {
    return dateSyncStatusMessage.value;
  }
  if (!dateSyncScriptId.value) {
    return '未找到启用中的“日期变量同步脚本”，请先启用该脚本后再保存。';
  }
  return '设置会写回日期同步脚本自己的 script 变量；story_date 与 story_date_settings 的键结构保持不变。';
});

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
    surfaceStyle: 'black',
    glowStyle: 'cyber_blue',
  };
}

function createDefaultChatStoredState(): OverlayChatStoredState {
  return {
    version: OVERLAY_CHAT_STATE_VERSION,
    schedules: [],
  };
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function coerceInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.trunc(numberValue);
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function formatIsoDate(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatDisplayDate(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

function clampCalendarYear(value: unknown): number {
  return _.clamp(coerceInteger(value, STORY_DATE_DEFAULT.year), MIN_CALENDAR_YEAR, MAX_CALENDAR_YEAR);
}

function compareDateParts(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
): number {
  const leftTime = Date.UTC(left.year, left.month - 1, left.day);
  const rightTime = Date.UTC(right.year, right.month - 1, right.day);
  if (leftTime === rightTime) {
    return 0;
  }
  return leftTime > rightTime ? 1 : -1;
}

function compareIsoDates(leftIso: string, rightIso: string): number {
  const [leftYear, leftMonth, leftDay] = leftIso.split('-').map(part => Number(part));
  const [rightYear, rightMonth, rightDay] = rightIso.split('-').map(part => Number(part));
  return compareDateParts(
    {
      year: coerceInteger(leftYear, STORY_DATE_DEFAULT.year),
      month: _.clamp(coerceInteger(leftMonth, STORY_DATE_DEFAULT.month), 1, 12),
      day: _.clamp(coerceInteger(leftDay, STORY_DATE_DEFAULT.day), 1, 31),
    },
    {
      year: coerceInteger(rightYear, STORY_DATE_DEFAULT.year),
      month: _.clamp(coerceInteger(rightMonth, STORY_DATE_DEFAULT.month), 1, 12),
      day: _.clamp(coerceInteger(rightDay, STORY_DATE_DEFAULT.day), 1, 31),
    },
  );
}

function createDefaultStoryDate(): StoryDateState {
  return {
    calendar: 'gregorian',
    year: STORY_DATE_DEFAULT.year,
    month: STORY_DATE_DEFAULT.month,
    day: STORY_DATE_DEFAULT.day,
    iso_date: formatIsoDate(STORY_DATE_DEFAULT),
    display_text: formatDisplayDate(STORY_DATE_DEFAULT),
    time_period: 'unknown',
    last_synced_at: '',
  };
}

function normalizeStoryDate(raw: unknown): StoryDateState {
  if (!raw || typeof raw !== 'object') {
    return createDefaultStoryDate();
  }

  const record = raw as Record<string, unknown>;
  const year = coerceInteger(record.year, STORY_DATE_DEFAULT.year);
  const month = _.clamp(coerceInteger(record.month, STORY_DATE_DEFAULT.month), 1, 12);
  const day = _.clamp(coerceInteger(record.day, STORY_DATE_DEFAULT.day), 1, getDaysInMonth(year, month));

  return {
    calendar: 'gregorian',
    year,
    month,
    day,
    iso_date: normalizeString(record.iso_date).trim() || formatIsoDate({ year, month, day }),
    display_text: normalizeString(record.display_text).trim() || formatDisplayDate({ year, month, day }),
    time_period: normalizeString(record.time_period, 'unknown').trim() || 'unknown',
    last_synced_at: normalizeString(record.last_synced_at).trim(),
  };
}

function createDefaultDateSyncSettings(): DateSyncSettings {
  return {
    enabled: true,
    base_url: '',
    api_key: '',
    model: '',
    timeout_ms: DATE_SYNC_TIMEOUT_DEFAULT_MS,
    debug: false,
  };
}

function normalizeDateSyncSettings(raw: unknown): DateSyncSettings {
  if (!raw || typeof raw !== 'object') {
    return createDefaultDateSyncSettings();
  }

  const record = raw as Record<string, unknown>;
  return {
    enabled: coerceBoolean(record.enabled, true),
    base_url: normalizeString(record.base_url).trim(),
    api_key: normalizeString(record.api_key).trim(),
    model: normalizeString(record.model).trim(),
    timeout_ms: _.clamp(coerceInteger(record.timeout_ms, DATE_SYNC_TIMEOUT_DEFAULT_MS), 3_000, 120_000),
    debug: coerceBoolean(record.debug, false),
  };
}

function normalizeScheduleItem(raw: unknown, index: number): OverlayScheduleItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = normalizeString(record.title).trim().slice(0, 5);
  const content = normalizeString(record.content).trim();
  const dateIso = normalizeString(record.dateIso, normalizeString(record.date_iso)).trim();
  if (!dateIso || !content) {
    return null;
  }

  return {
    id: normalizeString(record.id) || `schedule_${index}_${Date.now().toString(36)}`,
    dateIso,
    title,
    content,
    delivered: coerceBoolean(record.delivered, false),
    deliveredAt: normalizeString(record.deliveredAt, normalizeString(record.delivered_at)).trim(),
  };
}

function parseStoredChatState(raw: unknown): OverlayChatStoredState {
  const defaults = createDefaultChatStoredState();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const storedSchedules = Array.isArray(record.schedules) ? record.schedules : [];
  const schedules = storedSchedules
    .map((item, index) => normalizeScheduleItem(item, index))
    .filter(Boolean) as OverlayScheduleItem[];

  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version)
        ? Math.floor(record.version)
        : defaults.version,
    schedules,
  };
}

function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatClockDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function formatSyncTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '未记录';
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) {
    return trimmed;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
}

function buildCalendarCells(
  year: number,
  month: number,
  currentStoryDate: Pick<StoryDateState, 'year' | 'month' | 'day'>,
  selectedDay: number,
  schedules: OverlayScheduleItem[],
): CalendarCell[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  const scheduleCountByIso = schedules.reduce<Record<string, number>>((counts, schedule) => {
    counts[schedule.dateIso] = (counts[schedule.dateIso] ?? 0) + 1;
    return counts;
  }, {});

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      key: `empty-start-${index}`,
      day: null,
      isoDate: null,
      isCurrentStoryDay: false,
      isSelectedDay: false,
      scheduleCount: 0,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = formatIsoDate({ year, month, day });
    cells.push({
      key: `day-${day}`,
      day,
      isoDate,
      isCurrentStoryDay:
        year === currentStoryDate.year && month === currentStoryDate.month && day === currentStoryDate.day,
      isSelectedDay: day === selectedDay,
      scheduleCount: scheduleCountByIso[isoDate] ?? 0,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `empty-end-${cells.length}`,
      day: null,
      isoDate: null,
      isCurrentStoryDay: false,
      isSelectedDay: false,
      scheduleCount: 0,
    });
  }

  return cells;
}

function hasDateSyncModelConfig(settings: DateSyncSettings): boolean {
  return Boolean(settings.base_url && settings.api_key && settings.model);
}

function resolveCompatibleModelsEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return '';
  }
  if (/\/models(?:\?.*)?$/i.test(trimmed)) {
    return trimmed;
  }
  if (/(?:\/chat)?\/completions(?:\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/(?:\/chat)?\/completions(?:\?.*)?$/i, '/models');
  }
  return `${trimmed.replace(/\/+$/, '')}/models`;
}

function collectModelOptions(payload: unknown): ModelOption[] {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(_.get(payload, 'data'))
      ? (_.get(payload, 'data') as unknown[])
      : Array.isArray(_.get(payload, 'models'))
        ? (_.get(payload, 'models') as unknown[])
        : [];
  const seen = new Set<string>();

  return candidates
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const id = normalizeString(record.id, normalizeString(record.name)).trim();
      if (!id || seen.has(id)) {
        return null;
      }
      seen.add(id);

      const provider = normalizeString(record.owned_by, normalizeString(record.provider)).trim();
      return {
        id,
        label: provider ? `${id} · ${provider}` : id,
      } satisfies ModelOption;
    })
    .filter(Boolean) as ModelOption[];
}

function isOverlaySurfaceStyle(value: unknown): value is OverlaySurfaceStyle {
  return value === 'black' || value === 'silver';
}

function isOverlayGlowStyle(value: unknown): value is OverlayGlowStyle {
  return value === 'cyber_blue' || value === 'cyber_pink' || value === 'cyber_green' || value === 'cyber_purple';
}

function resolveLegacyTheme(value: unknown): Pick<OverlayStoredSettings, 'surfaceStyle' | 'glowStyle'> | null {
  if (value === ('cyber_blue' satisfies LegacyOverlayTheme)) {
    return { surfaceStyle: 'black', glowStyle: 'cyber_blue' };
  }
  if (value === ('cyber_pink' satisfies LegacyOverlayTheme)) {
    return { surfaceStyle: 'silver', glowStyle: 'cyber_pink' };
  }
  return null;
}

function parseStoredSettings(raw: unknown): OverlayStoredSettings {
  const defaults = createDefaultStoredSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const legacyTheme = resolveLegacyTheme(record.theme);
  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version) ? Math.floor(record.version) : defaults.version,
    nativeMessagesHidden: typeof record.nativeMessagesHidden === 'boolean' ? record.nativeMessagesHidden : defaults.nativeMessagesHidden,
    surfaceStyle: isOverlaySurfaceStyle(record.surfaceStyle)
      ? record.surfaceStyle
      : (legacyTheme?.surfaceStyle ?? defaults.surfaceStyle),
    glowStyle: isOverlayGlowStyle(record.glowStyle) ? record.glowStyle : (legacyTheme?.glowStyle ?? defaults.glowStyle),
  };
}

function readScriptVariables(): Record<string, any> {
  const scriptId = getRuntimeScriptId();
  if (!scriptId) {
    return {};
  }
  return withTavernHelper('读取脚本变量', {}, helper => helper.getVariables({ type: 'script', script_id: scriptId }));
}

function readChatVariables(): Record<string, any> {
  return withTavernHelper('读取聊天变量', {}, helper => helper.getVariables({ type: 'chat' }));
}

function loadSettingsFromVariables() {
  const variables = readScriptVariables();
  const stored = _.get(variables, OVERLAY_SETTINGS_KEY);
  const parsed = parseStoredSettings(stored);
  nativeMessagesHidden.value = parsed.nativeMessagesHidden;
  surfaceStyle.value = parsed.surfaceStyle;
  glowStyle.value = parsed.glowStyle;
}

function loadChatStateFromVariables() {
  const variables = readChatVariables();
  const stored = _.get(variables, OVERLAY_CHAT_STATE_KEY);
  const parsed = parseStoredChatState(stored);
  overlaySchedules.value = parsed.schedules;
}

function persistSettingsToVariables() {
  const scriptId = getRuntimeScriptId();
  if (!scriptId) {
    return;
  }

  const variables = readScriptVariables();
  const payload: OverlayStoredSettings = {
    version: OVERLAY_SETTINGS_VERSION,
    nativeMessagesHidden: nativeMessagesHidden.value,
    surfaceStyle: surfaceStyle.value,
    glowStyle: glowStyle.value,
  };

  _.set(variables, OVERLAY_SETTINGS_KEY, payload);
  void withTavernHelper('写入脚本变量', false, helper => {
    helper.replaceVariables(variables, { type: 'script', script_id: scriptId });
    return true;
  });
}

function persistChatStateToVariables() {
  const variables = readChatVariables();
  const payload: OverlayChatStoredState = {
    version: OVERLAY_CHAT_STATE_VERSION,
    schedules: overlaySchedules.value.map(schedule => ({
      id: schedule.id,
      dateIso: schedule.dateIso,
      title: schedule.title,
      content: schedule.content,
      delivered: schedule.delivered,
      deliveredAt: schedule.deliveredAt,
    })),
  };

  _.set(variables, OVERLAY_CHAT_STATE_KEY, payload);
  void withTavernHelper('写入聊天变量', false, helper => {
    helper.replaceVariables(variables, { type: 'chat' });
    return true;
  });
}

function setSurfaceStyle(next: OverlaySurfaceStyle) {
  surfaceStyle.value = next;
}

function setGlowStyle(next: OverlayGlowStyle) {
  glowStyle.value = next;
}

function handleMapFrameLoad(event: Event) {
  const frame = event.target as HTMLIFrameElement | null;
  mapFrameRef.value = frame;
  notifyMapFrameResize();
}

function notifyMapFrameResize() {
  window.dispatchEvent(new Event('resize'));
  mapFrameRef.value?.contentWindow?.dispatchEvent(new Event('resize'));
}

function toggleMapExpanded() {
  mapExpanded.value = !mapExpanded.value;
  calendarOpen.value = false;
  void nextTick(() => notifyMapFrameResize());
}

function switchPage(next: OverlayPage) {
  activePage.value = next;
  calendarOpen.value = false;
  if (next !== 'map') {
    mapExpanded.value = false;
  }
  if (next === 'map') {
    mapLoaded.value = true;
    void nextTick(() => {
      notifyMapFrameResize();
    });
  }
  if (next === 'settings') {
    loadDateSyncSettings(true);
  }
  if (next !== 'info') {
    return;
  }
  void nextTick(() => scrollChatToBottom());
}

function toggleCalendarOpen() {
  calendarOpen.value = !calendarOpen.value;
  if (calendarOpen.value) {
    jumpCalendarToStoryDate();
    return;
  }
  cancelScheduleEditor();
}

function syncSelectedCalendarDay(preferredDay = selectedCalendarDay.value) {
  selectedCalendarDay.value = _.clamp(
    coerceInteger(preferredDay, STORY_DATE_DEFAULT.day),
    1,
    getDaysInMonth(calendarViewYear.value, calendarViewMonth.value),
  );
}

function setCalendarView(year: number, month: number, preferredDay = selectedCalendarDay.value) {
  calendarViewYear.value = clampCalendarYear(year);
  calendarViewMonth.value = _.clamp(coerceInteger(month, STORY_DATE_DEFAULT.month), 1, 12);
  syncSelectedCalendarDay(preferredDay);
  cancelScheduleEditor();
}

function commitCalendarView() {
  setCalendarView(calendarViewYear.value, calendarViewMonth.value, selectedCalendarDay.value);
}

function shiftCalendarViewMonth(delta: number) {
  const next = new Date(Date.UTC(calendarViewYear.value, calendarViewMonth.value - 1 + delta, 1));
  setCalendarView(next.getUTCFullYear(), next.getUTCMonth() + 1);
}

function shiftCalendarViewYear(delta: number) {
  setCalendarView(calendarViewYear.value + delta, calendarViewMonth.value);
}

function jumpCalendarToStoryDate() {
  setCalendarView(storyDate.value.year, storyDate.value.month, storyDate.value.day);
}

function selectCalendarDay(cell: CalendarCell) {
  if (cell.day == null) {
    return;
  }
  selectedCalendarDay.value = cell.day;
  cancelScheduleEditor();
}

function openScheduleEditor() {
  if (!canCreateSchedule.value) {
    return;
  }

  scheduleDraft.value = {
    title: '',
    content: '',
  };
  scheduleEditorOpen.value = true;
}

function cancelScheduleEditor() {
  scheduleEditorOpen.value = false;
  scheduleDraft.value = {
    title: '',
    content: '',
  };
}

function saveSchedule() {
  if (!canCreateSchedule.value) {
    toastr.warning('只能给未来日期标记行程。', '行程');
    return;
  }

  const title = scheduleDraft.value.title.trim().slice(0, 5);
  const content = scheduleDraft.value.content.trim();
  if (!content) {
    toastr.warning('请填写行程内容。', '行程');
    return;
  }

  overlaySchedules.value = [
    ...overlaySchedules.value,
    {
      id: createRuleId(),
      dateIso: calendarSelectedIsoDate.value,
      title,
      content,
      delivered: false,
      deliveredAt: '',
    },
  ];
  persistChatStateToVariables();
  cancelScheduleEditor();
  toastr.success(`已为 ${calendarSelectedDisplayText.value} 标记行程。`, '行程');
}

function removeSchedule(id: string) {
  overlaySchedules.value = overlaySchedules.value.filter(schedule => schedule.id !== id);
  persistChatStateToVariables();
}

function maybeApplyArrivedSchedules() {
  const currentIsoDate = storyDate.value.iso_date.trim();
  if (!currentIsoDate) {
    return;
  }

  const dueSchedules = overlaySchedules.value.filter(
    schedule => !schedule.delivered && schedule.dateIso === currentIsoDate && schedule.content.trim(),
  );
  if (dueSchedules.length === 0) {
    return;
  }

  const mergedContent = Array.from(new Set(dueSchedules.map(schedule => schedule.content.trim()).filter(Boolean))).join('\n\n');
  if (!mergedContent) {
    return;
  }

  if (!draft.value.trim()) {
    draft.value = mergedContent;
  } else if (!draft.value.includes(mergedContent)) {
    draft.value = `${draft.value.trimEnd()}\n\n${mergedContent}`;
  }

  const deliveredAt = new Date().toISOString();
  const dueIds = new Set(dueSchedules.map(schedule => schedule.id));
  overlaySchedules.value = overlaySchedules.value.map(schedule =>
    dueIds.has(schedule.id)
      ? {
          ...schedule,
          delivered: true,
          deliveredAt,
        }
      : schedule,
  );
  persistChatStateToVariables();
  toastr.info(`已把 ${dueSchedules.length} 条行程内容填入输入框。`, '行程提醒');
}

function flattenScriptTrees(nodes: ScriptTreeNode[]): ScriptTreeScriptNode[] {
  const scripts: ScriptTreeScriptNode[] = [];

  const visit = (node: ScriptTreeNode) => {
    if (node.type === 'script') {
      scripts.push(node);
      return;
    }

    (node.scripts ?? []).forEach(visit);
  };

  nodes.forEach(visit);
  return scripts;
}

function readEnabledScriptButtons(): ScriptButtonMap {
  const runtime = resolveHostRuntime();
  if (runtime?.getAllEnabledScriptButtons) {
    try {
      return runtime.getAllEnabledScriptButtons();
    } catch (error) {
      console.warn('[全屏覆盖式酒馆前端] 读取启用脚本按钮失败，尝试 TavernHelper 回退。', error);
    }
  }

  return withTavernHelper('读取启用脚本按钮', {}, helper => {
    const api = helper as TavernHelperScriptApi;
    return api.getAllEnabledScriptButtons?.() ?? {};
  });
}

function readAllScriptNodes(): ScriptTreeScriptNode[] {
  return withTavernHelper('读取脚本树', [] as ScriptTreeScriptNode[], helper => {
    const api = helper as TavernHelperScriptApi;
    if (!api.getScriptTrees) {
      return [];
    }

    return DATE_SYNC_SCRIPT_TREE_TYPES.flatMap(type => flattenScriptTrees(api.getScriptTrees?.({ type }) ?? []));
  });
}

function locateDateSyncScriptId(force = false): string | null {
  if (dateSyncScriptId.value && !force) {
    return dateSyncScriptId.value;
  }

  const buttonMap = readEnabledScriptButtons();
  const matchedByButton = Object.entries(buttonMap).find(([, buttons]) =>
    buttons.some(button => button.button_name === DATE_SYNC_BUTTON_NAME),
  );
  if (matchedByButton) {
    dateSyncScriptId.value = matchedByButton[0];
    return dateSyncScriptId.value;
  }

  const matchedScript = readAllScriptNodes().find(script => {
    if (script.name?.includes(DATE_SYNC_SCRIPT_NAME)) {
      return true;
    }
    const content = script.content ?? '';
    return content.includes(DATE_SYNC_BUTTON_NAME) || content.includes(DATE_SYNC_SETTINGS_KEY);
  });

  dateSyncScriptId.value = matchedScript?.id ?? null;
  return dateSyncScriptId.value;
}

function resolveStoryBattleSessionId(state: StoryBattleState): string {
  if (state.sessionId.trim()) {
    return state.sessionId.trim();
  }
  return state.lastProcessedMessageId == null ? '' : `story_battle_${state.lastProcessedMessageId}`;
}

function syncBattlePromptState() {
  const sessionId = resolveStoryBattleSessionId(storyBattleState.value);
  if (!isStoryBattleActive(storyBattleState.value) || !sessionId) {
    battlePromptOpen.value = false;
    battlePromptSessionId.value = '';
    ignoredStoryBattleSessionId.value = null;
    return;
  }

  if (ignoredStoryBattleSessionId.value === sessionId) {
    battlePromptOpen.value = false;
    battlePromptSessionId.value = '';
    return;
  }

  if (lastPromptedStoryBattleSessionId.value === sessionId) {
    return;
  }

  battlePromptSessionId.value = sessionId;
  battlePromptOpen.value = true;
  lastPromptedStoryBattleSessionId.value = sessionId;
}

function refreshStoryDateState() {
  const variables = readChatVariables();
  const nextStoryDate = normalizeStoryDate(_.get(variables, STORY_DATE_KEY, {}));
  const nextStoryBattleState = normalizeStoryBattleState(_.get(variables, STORY_BATTLE_STATE_KEY, {}));
  if (!_.isEqual(storyDate.value, nextStoryDate)) {
    storyDate.value = nextStoryDate;
  }
  if (!_.isEqual(storyBattleState.value, nextStoryBattleState)) {
    storyBattleState.value = nextStoryBattleState;
  }
  syncBattlePromptState();
}

function goToBattleArenaFromPrompt() {
  battlePromptOpen.value = false;
  battlePromptSessionId.value = '';
  calendarOpen.value = false;
  switchPage('battle');
}

function ignoreBattlePrompt() {
  const sessionId = battlePromptSessionId.value || resolveStoryBattleSessionId(storyBattleState.value);
  if (sessionId) {
    ignoredStoryBattleSessionId.value = sessionId;
  }
  battlePromptOpen.value = false;
  battlePromptSessionId.value = '';
  if (activePage.value === 'battle') {
    switchPage('info');
  }
}

function loadDateSyncSettings(silent = false): boolean {
  const scriptId = locateDateSyncScriptId();
  if (!scriptId) {
    const defaults = createDefaultDateSyncSettings();
    if (!_.isEqual(dateSyncSettings.value, defaults)) {
      dateSyncSettings.value = defaults;
    }
    if (!silent) {
      dateSyncStatusMessage.value = '未找到启用中的“日期变量同步脚本”，请先启用该脚本。';
    }
    return false;
  }

  const variables = withTavernHelper('读取日期同步脚本变量', {}, helper =>
    helper.getVariables({ type: 'script', script_id: scriptId }),
  );
  const nextSettings = normalizeDateSyncSettings(_.get(variables, DATE_SYNC_SETTINGS_KEY, {}));
  if (!_.isEqual(dateSyncSettings.value, nextSettings)) {
    dateSyncSettings.value = nextSettings;
  }
  if (!silent) {
    dateSyncStatusMessage.value = `已从日期同步脚本读取配置：${scriptId}`;
  }
  return true;
}

async function fetchCompatibleModels() {
  const normalized = normalizeDateSyncSettings(dateSyncSettings.value);
  dateSyncSettings.value = normalized;

  if (!normalized.base_url) {
    toastr.warning('请先填写兼容 URL。', '日期同步');
    return;
  }

  fetchingModels.value = true;
  dateSyncStatusMessage.value = '正在拉取模型列表…';

  try {
    const response = await fetch(resolveCompatibleModelsEndpoint(normalized.base_url), {
      headers: {
        Accept: 'application/json',
        ...(normalized.api_key ? { Authorization: `Bearer ${normalized.api_key}` } : {}),
      },
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`模型接口请求失败 (${response.status})：${responseText.slice(0, 280)}`);
    }

    const payload = responseText ? (JSON.parse(responseText) as unknown) : [];
    const nextModelOptions = collectModelOptions(payload);
    if (nextModelOptions.length === 0) {
      throw new Error('接口返回中未找到可用模型。');
    }

    modelOptions.value = nextModelOptions;
    if (!normalized.model) {
      dateSyncSettings.value.model = nextModelOptions[0].id;
    }
    dateSyncStatusMessage.value = `已拉取 ${nextModelOptions.length} 个模型。`;
    toastr.success(`已拉取 ${nextModelOptions.length} 个模型。`, '日期同步');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    dateSyncStatusMessage.value = `拉取模型失败：${detail}`;
    toastr.error(detail, '日期同步');
  } finally {
    fetchingModels.value = false;
  }
}

function saveDateSyncSettings() {
  const scriptId = locateDateSyncScriptId(true);
  if (!scriptId) {
    dateSyncStatusMessage.value = '未找到启用中的“日期变量同步脚本”，无法保存。';
    toastr.error('未找到启用中的“日期变量同步脚本”，无法保存。', '日期同步');
    return;
  }

  savingDateSyncSettings.value = true;

  try {
    const normalized = normalizeDateSyncSettings(dateSyncSettings.value);
    const variables = withTavernHelper('读取日期同步脚本变量', {}, helper =>
      helper.getVariables({ type: 'script', script_id: scriptId }),
    );

    _.set(variables, DATE_SYNC_SETTINGS_KEY, normalized);
    const saved = withTavernHelper('写入日期同步脚本变量', false, helper => {
      helper.replaceVariables(variables, { type: 'script', script_id: scriptId });
      return true;
    });

    if (!saved) {
      throw new Error('写入日期同步脚本变量失败。');
    }

    dateSyncSettings.value = normalized;
    dateSyncStatusMessage.value = normalized.model
      ? `已保存日期同步配置：${normalized.model}`
      : '已保存日期同步配置。';
    toastr.success('日期同步配置已保存。', '日期同步');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    dateSyncStatusMessage.value = `保存失败：${detail}`;
    toastr.error(detail, '日期同步');
  } finally {
    savingDateSyncSettings.value = false;
  }
}

function closeOverlay() {
  void emitOverlayEvent(OVERLAY_EVENTS.REQUEST_OVERLAY_VISIBILITY, {
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
  void emitOverlayEvent(OVERLAY_EVENTS.REQUEST_NATIVE_MESSAGE_VISIBILITY, {
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
  const $displayed = withTavernHelper('读取原生消息渲染结果', null as JQuery<HTMLElement> | null, helper =>
    helper.retrieveDisplayedMessage(messageId),
  );
  if (!$displayed || $displayed.length === 0) {
    return null;
  }

  const html = $displayed.html();
  if (typeof html !== 'string') {
    return null;
  }

  const trimmed = html.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function renderMessageHtmlFromText(text: string, messageId: number): string {
  try {
    const rendered = withTavernHelper('格式化消息 HTML', '', helper => helper.formatAsDisplayedMessage(text, { message_id: messageId }));
    if (rendered.trim()) {
      return rendered;
    }
  } catch (error) {
    console.warn('[全屏覆盖式酒馆前端] 消息渲染失败，回退为纯文本。', { messageId, error });
  }

  return escapeAsDisplayedParagraph(text);
}

function refreshChatMessages() {
  const lastMessageId = withTavernHelper('读取最后一条消息 ID', -1, helper => helper.getLastMessageId());
  if (lastMessageId < 0) {
    chatMessages.value = [];
    return;
  }

  const chatMessageQueryOptions = {
    hide_state: 'all',
    role: 'all',
  } as const;
  let rawMessages: ChatMessage[] = [];

  try {
    rawMessages = withTavernHelper('读取消息区间 0-lastMessageId', [], helper =>
      helper.getChatMessages(`0-${lastMessageId}`, chatMessageQueryOptions),
    );
  } catch {
    rawMessages = [];
  }

  if (rawMessages.length === 0) {
    try {
      rawMessages = withTavernHelper('读取消息区间 0-{{lastMessageId}}', [], helper =>
        helper.getChatMessages('0-{{lastMessageId}}', chatMessageQueryOptions),
      );
    } catch {
      rawMessages = [];
    }
  }

  if (rawMessages.length === 0) {
    try {
      rawMessages = withTavernHelper('读取消息区间 0-', [], helper => helper.getChatMessages('0-', chatMessageQueryOptions));
    } catch {
      rawMessages = [];
    }
  }

  chatMessages.value = rawMessages
    .filter(message => message.role === 'assistant' || message.role === 'user' || message.role === 'system')
    .map(message => {
      const plainText = message.message ?? '';
      const nativeDisplayedHtml = tryReadNativeDisplayedHtml(message.message_id);
      if (nativeDisplayedHtml) {
        return {
          message_id: message.message_id,
          name: normalizeMessageName(message),
          role: message.role,
          is_hidden: message.is_hidden === true,
          rawText: plainText,
          renderedHtml: nativeDisplayedHtml,
        } satisfies RenderableMessage;
      }

      return {
        message_id: message.message_id,
        name: normalizeMessageName(message),
        role: message.role,
        is_hidden: message.is_hidden === true,
        rawText: plainText,
        renderedHtml: renderMessageHtmlFromText(plainText, message.message_id),
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

  void emitOverlayEvent(OVERLAY_EVENTS.REQUEST_NATIVE_SEND, {
    source: 'overlay_ui',
    inputPreview: inputRaw.slice(0, 80),
    inputRaw,
  });
}

function beginEditMessage(message: RenderableMessage) {
  editingMessageId.value = message.message_id;
  editingMessageText.value = message.rawText;
  void nextTick(() => {
    const selector = `[data-message-edit-id="${message.message_id}"]`;
    const editor = document.querySelector<HTMLTextAreaElement>(selector);
    editor?.focus();
    editor?.setSelectionRange(editor.value.length, editor.value.length);
  });
}

function cancelEditMessage() {
  editingMessageId.value = null;
  editingMessageText.value = '';
}

async function runChatOperation(messageId: number, label: string, operation: () => Promise<void>) {
  if (busyMessageId.value !== null) {
    toastr.info('上一项聊天操作还在执行。', label);
    return;
  }

  busyMessageId.value = messageId;
  try {
    await operation();
    refreshChatMessages();
    await nextTick();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    toastr.error(detail, label);
  } finally {
    busyMessageId.value = null;
  }
}

async function saveEditedMessage(message: RenderableMessage) {
  const nextText = editingMessageText.value.trimEnd();
  await runChatOperation(message.message_id, '编辑消息', async () => {
    const saving = withTavernHelper('编辑聊天消息', null as Promise<void> | null, helper =>
      helper.setChatMessages([{ message_id: message.message_id, message: nextText }], { refresh: 'affected' }),
    );
    if (!saving) {
      throw new Error('未找到 TavernHelper。');
    }
    await saving;
    cancelEditMessage();
    toastr.success('消息已更新。', '编辑消息');
  });
}

async function withdrawMessage(message: RenderableMessage) {
  await runChatOperation(message.message_id, '撤回消息', async () => {
    const deleting = withTavernHelper('撤回聊天消息', null as Promise<void> | null, helper =>
      helper.deleteChatMessages([message.message_id], { refresh: 'all' }),
    );
    if (!deleting) {
      throw new Error('未找到 TavernHelper。');
    }
    await deleting;
    if (editingMessageId.value === message.message_id) {
      cancelEditMessage();
    }
    toastr.success('消息已撤回。', '撤回消息');
  });
}

async function triggerGenerationAfterDeletingTail(message: RenderableMessage, label: string, command = '/trigger') {
  await runChatOperation(message.message_id, label, async () => {
    const lastMessageId = withTavernHelper('读取最后一条消息 ID', -1, helper => helper.getLastMessageId());
    if (lastMessageId < message.message_id) {
      throw new Error('消息位置已经变化，请刷新后重试。');
    }

    const idsToDelete = _.range(message.message_id, lastMessageId + 1);
    const deletingTail = withTavernHelper('删除尾部聊天消息', null as Promise<void> | null, helper =>
      helper.deleteChatMessages(idsToDelete, { refresh: 'all' }),
    );
    if (!deletingTail) {
      throw new Error('未找到 TavernHelper。');
    }
    await deletingTail;
    const result = await triggerHostSlash(command);
    if (result === undefined) {
      throw new Error('酒馆生成命令没有成功执行。');
    }
  });
}

async function resendUserMessage(message: RenderableMessage) {
  const inputRaw = message.rawText.trim();
  if (!inputRaw) {
    toastr.warning('这条用户消息没有可重新发送的文本。', '重新发送');
    return;
  }

  await runChatOperation(message.message_id, '重新发送', async () => {
    const lastMessageId = withTavernHelper('读取最后一条消息 ID', -1, helper => helper.getLastMessageId());
    if (lastMessageId < message.message_id) {
      throw new Error('消息位置已经变化，请刷新后重试。');
    }

    const idsToDelete = _.range(message.message_id, lastMessageId + 1);
    const deletingTail = withTavernHelper('删除尾部聊天消息', null as Promise<void> | null, helper =>
      helper.deleteChatMessages(idsToDelete, { refresh: 'all' }),
    );
    if (!deletingTail) {
      throw new Error('未找到 TavernHelper。');
    }
    await deletingTail;
    void emitOverlayEvent(OVERLAY_EVENTS.REQUEST_NATIVE_SEND, {
      source: 'overlay_ui',
      inputPreview: inputRaw.slice(0, 80),
      inputRaw,
    });
  });
}

async function regenerateAssistantMessage(message: RenderableMessage) {
  await triggerGenerationAfterDeletingTail(message, '重新生成');
}

onMounted(() => {
  loadSettingsFromVariables();
  loadChatStateFromVariables();
  locateDateSyncScriptId(true);
  loadDateSyncSettings(true);
  refreshStoryDateState();
  jumpCalendarToStoryDate();
  maybeApplyArrivedSchedules();
  requestNativeMessageVisibility(nativeMessagesHidden.value, 'script');

  liveClockTimer = window.setInterval(() => {
    liveNow.value = new Date();
  }, 1_000);

  storyDateTimer = window.setInterval(() => {
    const previousScriptId = dateSyncScriptId.value;
    const nextScriptId = locateDateSyncScriptId(true);
    if (!previousScriptId && nextScriptId) {
      loadDateSyncSettings(true);
    }
    refreshStoryDateState();
  }, 1_500);

  const refreshDebounced = _.debounce(() => {
    refreshChatMessages();
    refreshStoryDateState();
  }, 30);
  const refreshAndStickBottom = _.debounce(() => {
    refreshChatMessages();
    refreshStoryDateState();
    void nextTick(() => scrollChatToBottom('smooth'));
  }, 30);

  stops.push(onOverlayEvent(getTavernEventName('MESSAGE_SENT'), refreshAndStickBottom));
  stops.push(onOverlayEvent(getTavernEventName('MESSAGE_RECEIVED'), refreshAndStickBottom));
  stops.push(onOverlayEvent(getTavernEventName('GENERATION_ENDED'), refreshAndStickBottom));
  stops.push(onOverlayEvent(getTavernEventName('MESSAGE_UPDATED'), refreshDebounced));
  stops.push(onOverlayEvent(getTavernEventName('MESSAGE_EDITED'), refreshDebounced));
  stops.push(onOverlayEvent(getTavernEventName('MESSAGE_DELETED'), refreshDebounced));
  stops.push(onOverlayEvent(getTavernEventName('MORE_MESSAGES_LOADED'), refreshDebounced));
  stops.push(
    onOverlayEvent(getTavernEventName('CHAT_CHANGED'), () => {
      draft.value = '';
      loadChatStateFromVariables();
      loadDateSyncSettings(true);
      refreshChatMessages();
      refreshStoryDateState();
      jumpCalendarToStoryDate();
      maybeApplyArrivedSchedules();
      void nextTick(() => scrollChatToBottom('smooth'));
    }),
  );
  stops.push(
    onOverlayEvent(OVERLAY_EVENTS.NATIVE_SEND_RESULT, payload => {
      const result = payload as NativeSendResultPayload;
      if (result.clicked) {
        draft.value = '';
        return;
      }
      toastr.error(result.reason ?? '未知原因', '覆盖层发送失败');
    }),
  );
  stops.push(
    onOverlayEvent(OVERLAY_EVENTS.NATIVE_MESSAGE_VISIBILITY_CHANGED, payload => {
      nativeMessagesHidden.value = normalizeNativeMessageVisibility(payload).hidden;
    }),
  );

  refreshChatMessages();
  refreshStoryDateState();
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
  () => storyDate.value.iso_date,
  () => {
    maybeApplyArrivedSchedules();
  },
);

watch(
  [nativeMessagesHidden, surfaceStyle, glowStyle],
  () => {
    persistSettingsDebounced();
  },
);

onBeforeUnmount(() => {
  persistSettingsDebounced.flush();
  persistSettingsDebounced.cancel();
  if (liveClockTimer !== null) {
    window.clearInterval(liveClockTimer);
    liveClockTimer = null;
  }
  if (storyDateTimer !== null) {
    window.clearInterval(storyDateTimer);
    storyDateTimer = null;
  }
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

.overlay-root[data-surface='black'] {
  --page-bg: radial-gradient(circle at 18% 10%, var(--black-bg-haze, #14263f) 0%, #070b13 52%, #03050a 100%);
  --panel-bg: linear-gradient(155deg, rgba(10, 13, 21, 0.94), rgba(18, 29, 48, 0.92));
  --calendar-bg: linear-gradient(160deg, rgba(5, 10, 18, 0.98), rgba(17, 28, 45, 0.98));
  --shell-bg: rgba(0, 0, 0, 0.1);
  --nav-bg: rgba(3, 9, 18, 0.4);
  --text-color: #dff5ff;
  --sub-color: #9ec9db;
  --input-bg: rgba(4, 8, 16, 0.92);
  --btn-bg: linear-gradient(140deg, #04070d, #0e1728);
  --btn-fg: #dff5ff;
  --assistant-bubble: linear-gradient(150deg, rgba(10, 18, 31, 0.96), rgba(20, 35, 58, 0.88));
  --user-bubble: linear-gradient(145deg, var(--black-user-bubble-start, rgba(7, 41, 68, 0.92)), rgba(6, 26, 48, 0.92));
  --system-bubble: linear-gradient(145deg, rgba(22, 24, 30, 0.92), rgba(17, 19, 24, 0.92));
}

.overlay-root[data-surface='silver'] {
  --page-bg: radial-gradient(circle at 20% 8%, #f3f4f8 0%, #d0d3dd 55%, #b6b9c3 100%);
  --panel-bg: linear-gradient(150deg, rgba(236, 239, 246, 0.97), rgba(202, 206, 216, 0.95));
  --calendar-bg: linear-gradient(160deg, rgba(242, 245, 250, 0.98), rgba(219, 224, 233, 0.98));
  --shell-bg: rgba(255, 255, 255, 0.22);
  --nav-bg: rgba(255, 255, 255, 0.32);
  --text-color: #161922;
  --sub-color: #3f475b;
  --input-bg: rgba(245, 247, 251, 0.94);
  --btn-bg: linear-gradient(150deg, #eceff6, #cfd4df);
  --btn-fg: #1b1f2b;
  --assistant-bubble: linear-gradient(145deg, rgba(232, 236, 244, 0.97), rgba(220, 225, 235, 0.95));
  --user-bubble: linear-gradient(
    145deg,
    var(--silver-user-bubble-start, rgba(255, 225, 245, 0.96)),
    var(--silver-user-bubble-end, rgba(255, 212, 238, 0.96))
  );
  --system-bubble: linear-gradient(145deg, rgba(222, 224, 229, 0.95), rgba(208, 211, 219, 0.94));
}

.overlay-root[data-glow='cyber_blue'] {
  --line-color: rgba(78, 230, 255, 0.55);
  --accent: #45f3ff;
  --accent-soft: rgba(69, 243, 255, 0.24);
  --black-bg-haze: #14263f;
  --black-user-bubble-start: rgba(7, 41, 68, 0.92);
  --silver-user-bubble-start: rgba(225, 250, 255, 0.96);
  --silver-user-bubble-end: rgba(207, 239, 248, 0.96);
}

.overlay-root[data-glow='cyber_pink'] {
  --line-color: rgba(255, 64, 176, 0.55);
  --accent: #ff44c2;
  --accent-soft: rgba(255, 68, 194, 0.22);
  --black-bg-haze: #3f1434;
  --black-user-bubble-start: rgba(68, 7, 48, 0.92);
  --silver-user-bubble-start: rgba(255, 225, 245, 0.96);
  --silver-user-bubble-end: rgba(255, 212, 238, 0.96);
}

.overlay-root[data-glow='cyber_green'] {
  --line-color: rgba(72, 255, 168, 0.55);
  --accent: #4dffa6;
  --accent-soft: rgba(77, 255, 166, 0.23);
  --black-bg-haze: #123b2d;
  --black-user-bubble-start: rgba(8, 58, 38, 0.92);
  --silver-user-bubble-start: rgba(225, 255, 239, 0.96);
  --silver-user-bubble-end: rgba(204, 247, 222, 0.96);
}

.overlay-root[data-glow='cyber_purple'] {
  --line-color: rgba(181, 104, 255, 0.58);
  --accent: #b568ff;
  --accent-soft: rgba(181, 104, 255, 0.24);
  --black-bg-haze: #2a1946;
  --black-user-bubble-start: rgba(43, 20, 76, 0.92);
  --silver-user-bubble-start: rgba(242, 230, 255, 0.96);
  --silver-user-bubble-end: rgba(226, 211, 247, 0.96);
}

.panel {
  width: 100%;
  height: calc(100dvh - 24px);
  border-radius: 18px;
  border: 1px solid var(--line-color);
  padding: 14px;
  background: var(--panel-bg);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 20px 50px rgba(0, 0, 0, 0.25);
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: 12px;
}

.battle-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  padding: 20px;
  background: rgba(0, 0, 0, 0.46);
  display: grid;
  place-items: center;
}

.battle-prompt {
  width: min(480px, 100%);
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 18px;
  color: var(--text-color);
  background: var(--panel-bg);
  box-shadow: 0 24px 54px rgba(0, 0, 0, 0.34);
  display: grid;
  gap: 12px;
}

.battle-prompt h2,
.battle-prompt p {
  margin: 0;
}

.battle-prompt h2 {
  font-size: 18px;
}

.battle-prompt p {
  color: var(--sub-color);
  line-height: 1.6;
}

.battle-prompt-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.page-nav {
  min-height: 0;
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 12px 10px;
  background: var(--nav-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-title {
  margin: 0 4px 2px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--sub-color);
}

.nav-btn {
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 9px 10px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.nav-btn:hover {
  transform: translateX(1px);
}

.nav-btn[aria-pressed='true'] {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft);
}

.page-stage {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 16px;
  background: var(--shell-bg);
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
}

.panel-head {
  position: relative;
  display: grid;
  gap: 12px;
}

.toolbar-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.toolbar-story-label {
  margin: 0;
  color: var(--sub-color);
  font-size: 13px;
  letter-spacing: 0.04em;
}

.toolbar-clock {
  color: var(--sub-color);
  font-size: 13px;
  letter-spacing: 0.04em;
}

.date-trigger {
  min-width: 180px;
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 10px 18px;
  color: var(--text-color);
  background: var(--btn-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 0 1px var(--accent-soft) inset;
}

.calendar-kicker {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--sub-color);
}

.date-trigger strong {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.1;
}

.calendar-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 5;
  width: min(1040px, calc(100vw - 80px));
  max-height: min(78dvh, 820px);
  overflow: auto;
  border: 1px solid var(--line-color);
  border-radius: 22px;
  padding: 18px;
  background: var(--calendar-bg);
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.28);
  display: grid;
  gap: 16px;
}

.calendar-summary {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  gap: 14px;
}

.calendar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.85fr);
  gap: 14px;
}

.calendar-story,
.calendar-clock {
  border: 1px solid var(--line-color);
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  display: grid;
  gap: 6px;
}

.calendar-story h2,
.calendar-clock strong {
  margin: 0;
  font-size: 20px;
}

.calendar-clock span,
.calendar-meta,
.calendar-status,
.calendar-foot {
  color: var(--sub-color);
  font-size: 12px;
}

.calendar-panel {
  border: 1px solid var(--line-color);
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 12px;
}

.calendar-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.calendar-panel-head strong {
  display: block;
  margin-bottom: 4px;
  font-size: 18px;
}

.calendar-controls {
  display: grid;
  grid-template-columns: repeat(5, auto);
  gap: 10px;
  align-items: end;
}

.calendar-control-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.calendar-picker {
  display: grid;
  gap: 6px;
}

.calendar-picker span {
  font-size: 12px;
  color: var(--sub-color);
}

.calendar-picker-input,
.calendar-nav-btn,
.calendar-jump-btn {
  border: 1px solid var(--line-color);
  border-radius: 12px;
  color: var(--text-color);
  background: var(--input-bg);
}

.calendar-picker-input {
  min-width: 104px;
  padding: 9px 10px;
  outline: none;
}

.calendar-nav-btn,
.calendar-jump-btn {
  padding: 9px 12px;
  cursor: pointer;
}

.calendar-weekdays,
.calendar-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.calendar-weekdays span {
  text-align: center;
  font-size: 12px;
  color: var(--sub-color);
}

.calendar-day {
  position: relative;
  min-height: 76px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  display: grid;
  align-content: start;
  justify-items: start;
  padding: 12px 10px;
  color: var(--text-color);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.calendar-day:hover:not(:disabled) {
  transform: translateY(-1px);
}

.calendar-day:disabled {
  cursor: default;
}

.calendar-day.empty {
  opacity: 0.3;
}

.calendar-day.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft) inset;
}

.calendar-day.selected {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  box-shadow: 0 0 0 1px var(--accent-soft), 0 0 18px rgba(0, 0, 0, 0.16);
}

.calendar-day.scheduled {
  border-color: rgba(255, 195, 94, 0.5);
}

.calendar-day-badge,
.calendar-day-mark {
  position: absolute;
  border-radius: 999px;
  font-size: 11px;
  padding: 2px 7px;
}

.calendar-day-badge {
  right: 8px;
  bottom: 8px;
  color: var(--btn-fg);
  background: rgba(255, 195, 94, 0.22);
}

.calendar-day-mark {
  top: 8px;
  right: 8px;
  color: var(--btn-fg);
  background: linear-gradient(160deg, var(--accent-soft), rgba(255, 255, 255, 0.02));
}

.calendar-day-number {
  font-size: 16px;
  font-weight: 600;
}

.calendar-foot {
  margin: 0;
}

.schedule-panel {
  border: 1px solid var(--line-color);
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  display: grid;
  align-content: start;
  gap: 12px;
}

.schedule-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.schedule-panel-head h3 {
  margin: 0;
  font-size: 20px;
}

.schedule-note,
.schedule-empty {
  margin: 0;
  color: var(--sub-color);
  line-height: 1.6;
}

.schedule-editor,
.schedule-list {
  display: grid;
  gap: 10px;
}

.schedule-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.schedule-textarea {
  min-height: 128px;
  resize: vertical;
}

.schedule-item {
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  display: grid;
  gap: 10px;
}

.schedule-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.schedule-state {
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 12px;
  color: var(--sub-color);
  background: rgba(255, 255, 255, 0.08);
}

.schedule-state[data-delivered='true'] {
  color: var(--btn-fg);
  background: rgba(69, 243, 255, 0.18);
}

.schedule-item-content {
  margin: 0;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.schedule-remove-btn {
  justify-self: flex-start;
}

.close-btn,
.native-ui-btn,
.action-btn,
.theme-btn,
.send-btn {
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

.page-view {
  min-height: 0;
}

.info-view {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
}

.simple-view {
  display: grid;
  align-content: start;
}

.battle-view {
  min-height: 0;
  align-content: stretch;
  overflow: hidden;
}

.battle-view > * {
  min-height: 0;
}

.map-view {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line-color);
  border-radius: 14px;
  background: #020611;
}

.map-view.is-expanded {
  position: fixed;
  inset: 0;
  z-index: 50;
  border: 0;
  border-radius: 0;
}

.map-expand-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  border: 1px solid rgba(147, 213, 255, 0.58);
  border-radius: 999px;
  padding: 8px 14px;
  color: #dff7ff;
  background: linear-gradient(120deg, rgba(8, 31, 53, 0.88), rgba(17, 47, 76, 0.9));
  box-shadow: 0 0 0 1px rgba(69, 243, 255, 0.18), 0 8px 22px rgba(0, 0, 0, 0.28);
  cursor: pointer;
}

.map-expand-btn:hover {
  filter: brightness(1.08);
}

.map-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #020611;
}

.placeholder-card {
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.08);
  display: grid;
  gap: 10px;
}

.placeholder-card h2,
.settings-card h2 {
  margin: 0;
  font-size: 18px;
}

.placeholder-card p,
.settings-note {
  margin: 0;
  color: var(--sub-color);
  line-height: 1.6;
}

.settings-view {
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
  display: grid;
  align-content: start;
  gap: 10px;
}

.settings-card {
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 14px;
  background: rgba(0, 0, 0, 0.08);
  display: grid;
  gap: 10px;
}

.settings-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.status-chip {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--sub-color);
  white-space: nowrap;
}

.status-chip[data-state='ready'] {
  color: var(--text-color);
  box-shadow: 0 0 0 1px var(--accent-soft);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settings-field {
  display: grid;
  gap: 6px;
}

.settings-field.small {
  align-content: start;
}

.settings-field > span {
  font-size: 12px;
  color: var(--sub-color);
}

.settings-toggle {
  border: 1px dashed var(--line-color);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.settings-actions,
.model-pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.model-pill {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--sub-color);
  background: rgba(255, 255, 255, 0.06);
}

.theme-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.theme-btn {
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.theme-btn:hover {
  transform: translateY(-1px);
}

.theme-btn[aria-pressed='true'] {
  box-shadow: 0 0 0 1px var(--line-color), 0 0 18px var(--accent-soft);
}

.theme-btn.base-black {
  border: 1px solid rgba(71, 236, 255, 0.65);
  color: #dff7ff;
  background: linear-gradient(150deg, #05080f, #101a2a);
}

.theme-btn.base-silver {
  border: 1px solid rgba(190, 197, 212, 0.88);
  color: #1b1f2b;
  background: linear-gradient(150deg, #f2f4f8, #ccd2df);
}

.theme-btn.glow-blue {
  border: 1px solid rgba(71, 236, 255, 0.65);
  color: #dff7ff;
  background: linear-gradient(150deg, #051017, #0c2934);
}

.theme-btn.glow-pink {
  border: 1px solid rgba(255, 72, 190, 0.62);
  color: #241930;
  background: linear-gradient(150deg, #fff0fa, #ffd4ee);
}

.theme-btn.glow-green {
  border: 1px solid rgba(72, 255, 168, 0.65);
  color: #082316;
  background: linear-gradient(150deg, #e9fff4, #b9ffd7);
}

.theme-btn.glow-purple {
  border: 1px solid rgba(181, 104, 255, 0.68);
  color: #f5edff;
  background: linear-gradient(150deg, #211334, #5f2ba0);
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

.file-hint {
  margin: 0;
  color: var(--sub-color);
  font-size: 12px;
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
  background: var(--shell-bg);
}

.message-row {
  max-width: min(860px, 96%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  opacity: 1;
  transition: opacity 140ms ease;
}

.message-row.is-busy {
  opacity: 0.68;
}

.message-row.role-user {
  align-self: flex-end;
}

.message-row.role-assistant,
.message-row.role-system {
  align-self: flex-start;
}

.message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--sub-color);
}

.message-actions,
.message-editor-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.message-action-btn {
  min-height: 28px;
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 4px 9px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  font-size: 12px;
  cursor: pointer;
}

.message-action-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.message-action-btn.danger {
  border-color: rgba(255, 99, 132, 0.7);
}

.hidden-tag {
  color: #ff9abd;
}

.is-hidden-message .bubble,
.is-hidden-message .message-edit-box {
  box-shadow: 0 0 0 1px rgba(255, 128, 168, 0.42) inset;
}

.bubble,
.message-editor {
  border-radius: 10px;
  border: 1px solid var(--line-color);
}

.bubble {
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

.message-editor {
  padding: 10px;
  background: var(--input-bg);
  display: grid;
  gap: 8px;
}

.message-edit-box {
  width: 100%;
  min-height: 144px;
  resize: vertical;
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text-color);
  background: var(--shell-bg);
  outline: none;
  line-height: 1.55;
}

.placeholder {
  margin: auto 0;
  color: var(--sub-color);
  text-align: center;
}

.input-shell {
  position: relative;
  min-width: 0;
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
  min-height: 72px;
  border: none;
  border-radius: 13px;
  padding: 12px 14px;
  color: var(--text-color);
  background: var(--input-bg);
  outline: none;
  font-size: 14px;
  line-height: 1.55;
}

.input-box::placeholder {
  color: var(--sub-color);
}

.composer-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.send-btn {
  align-self: stretch;
  padding: 9px 20px;
  box-shadow: 0 0 14px var(--accent-soft);
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
  .panel {
    grid-template-columns: 122px minmax(0, 1fr);
  }

  .calendar-layout,
  .calendar-summary,
  .calendar-controls {
    grid-template-columns: 1fr;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .overlay-root {
    padding: 8px;
  }

  .panel {
    height: calc(100dvh - 16px);
    padding: 10px;
    gap: 8px;
    grid-template-columns: 108px minmax(0, 1fr);
  }

  .page-stage {
    padding: 12px;
    gap: 10px;
  }

  h1 {
    font-size: 19px;
  }

  .toolbar-strip {
    width: 100%;
    align-items: stretch;
  }

  .toolbar-story-label,
  .toolbar-clock {
    width: 100%;
  }

  .composer-row,
  .schedule-panel-head,
  .calendar-control-group,
  .calendar-picker {
    width: 100%;
  }

  .date-trigger {
    width: 100%;
    min-width: 0;
  }

  .calendar-popover {
    position: static;
    width: 100%;
    max-height: none;
  }

  .settings-heading,
  .calendar-panel-head,
  .schedule-panel-head {
    grid-template-columns: 1fr;
    display: grid;
  }

  .nav-btn {
    padding: 8px 9px;
    font-size: 13px;
  }
}
</style>
