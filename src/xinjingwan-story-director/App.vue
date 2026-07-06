<template>
  <div class="director-shell">
    <header class="titlebar">
      <div class="title-main">
        <span class="title">新景湾剧情指导</span>
        <span class="subtitle">{{ modeLabel }}</span>
      </div>
      <div class="window-actions">
        <button type="button" class="ghost-button" @click="closeWindow">关闭</button>
      </div>
    </header>

    <main class="content">
      <section class="status-strip">
        <div>
          <span class="status-label">世界书</span>
          <strong>{{ state.status.targetWorldbookName || '未绑定' }}</strong>
        </div>
        <div>
          <span class="status-label">大纲节点</span>
          <strong>{{ state.status.outlineCurrentNode || 1 }}</strong>
          <span v-if="!state.status.outlineMvuAvailable" class="muted">需要 MVU 支持</span>
        </div>
        <div>
          <span class="status-label">限时计数</span>
          <strong>{{ state.timedEnding.completedReplyCount }}</strong>
          <span class="muted">下一次 {{ state.timedEnding.nextReplyIndex }}</span>
        </div>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          :class="{ active: state.ui.tab === tab.value }"
          @click="setTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="state.ui.tab === 'outline'" class="panel">
        <div class="panel-head">
          <div>
            <h2>大纲模式</h2>
            <p>只同步启用页；未启用页只保存在当前聊天变量。</p>
          </div>
          <button type="button" class="secondary-button" @click="addPage">新增页</button>
        </div>

        <div class="page-tabs">
          <button
            v-for="(page, index) in state.outline.pages"
            :key="page.id"
            type="button"
            :class="{ active: page.id === state.outline.selectedPageId, enabled: page.id === state.outline.enabledPageId }"
            @click="selectPage(page.id)"
          >
            第{{ index + 1 }}页
          </button>
        </div>

        <div v-if="selectedPage" class="outline-editor">
          <div class="row-between">
            <span class="muted">
              非空节点 {{ selectedNonEmptyNodes.length }} 个
              <template v-if="selectedPage.completed"> · 已完成</template>
            </span>
            <button type="button" class="secondary-button" @click="clearPage(selectedPage.id)">清空本页</button>
          </div>

          <div class="node-list">
            <div v-for="(node, index) in selectedPage.nodes" :key="`${selectedPage.id}-${index}`" class="node-row">
              <label :for="`outline-node-${index}`">节点{{ index + 1 }}</label>
              <textarea
                :id="`outline-node-${index}`"
                :value="node"
                rows="3"
                placeholder="输入这一节点要推进的剧情"
                @input="updateNodeFromEvent(selectedPage.id, index, $event)"
              />
              <div class="node-actions">
                <button
                  type="button"
                  class="small-button"
                  :disabled="!canAddNode(selectedPage, index)"
                  @click="addNode(selectedPage.id)"
                >
                  +
                </button>
                <button
                  type="button"
                  class="small-button"
                  :disabled="selectedPage.nodes.length <= 1"
                  @click="removeNode(selectedPage.id, index)"
                >
                  -
                </button>
              </div>
            </div>
          </div>

          <div class="action-row">
            <button
              type="button"
              class="primary-button"
              :disabled="busy || selectedNonEmptyNodes.length === 0"
              @click="runAction('启用大纲模式', () => enableOutlinePage(selectedPage.id))"
            >
              启用本页
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="busy || state.activeMode !== 'outline'"
              @click="runAction('关闭当前大纲页', closeOutlinePage)"
            >
              标记本页完成 / 关闭当前页
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="state.ui.tab === 'endingReference'" class="panel">
        <div class="panel-head">
          <div>
            <h2>弱结局参考</h2>
            <p>作为弱参考同步，不强推剧情，不让角色知晓幕后目标。</p>
          </div>
        </div>

        <textarea
          class="large-textarea"
          :value="state.endingReference.text"
          rows="12"
          placeholder="输入希望在条件合适时靠近的可能结局"
          @input="updateEndingReferenceFromEvent"
        />

        <div class="action-row">
          <button
            type="button"
            class="primary-button"
            :disabled="busy || !state.endingReference.text.trim()"
            @click="runAction('启用弱结局参考', enableEndingReference)"
          >
            启用参考
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || state.activeMode !== 'endingReference'"
            @click="runAction('关闭弱结局参考', disableEndingReference)"
          >
            关闭参考
          </button>
        </div>
      </section>

      <section v-else class="panel">
        <div class="panel-head">
          <div>
            <h2>限时结局</h2>
            <p>按计数会话统计被选中的未隐藏 AI 回复，暂停期间不计数。</p>
          </div>
        </div>

        <label class="field-label" for="timed-goal">目标结局</label>
        <textarea
          id="timed-goal"
          class="large-textarea"
          :value="state.timedEnding.goalText"
          rows="9"
          placeholder="输入需要逐步导向的目标结局"
          @input="updateTimedGoalFromEvent"
        />

        <div class="number-grid">
          <label for="target-index">
            目标完成序号
            <input
              id="target-index"
              type="number"
              min="1"
              max="999"
              :value="state.timedEnding.targetReplyIndex"
              @input="updateTimedTargetFromEvent"
            />
          </label>
          <div class="session-box">
            <span class="status-label">会话 ID</span>
            <strong>{{ state.timedEnding.sessionId || '尚未开始' }}</strong>
          </div>
        </div>

        <div class="action-row wrap">
          <button
            type="button"
            class="primary-button"
            :disabled="busy || !state.timedEnding.goalText.trim()"
            @click="runAction('作为新目标开始', startNewTimedGoal)"
          >
            作为新目标开始
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || !state.timedEnding.goalText.trim()"
            @click="runAction('继续目标', continueTimedGoal)"
          >
            继续目标
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || !state.timedEnding.sessionId"
            @click="runAction('应用到当前目标', applyTimedGoalToCurrentSession)"
          >
            应用到当前目标
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || state.activeMode !== 'timedEnding'"
            @click="runAction('暂停目标', pauseTimedGoal)"
          >
            暂停目标
          </button>
        </div>
      </section>

      <section v-if="state.status.warnings.length > 0 || actionMessage" class="messages">
        <p v-if="actionMessage">{{ actionMessage }}</p>
        <p v-for="warning in state.status.warnings" :key="warning">{{ warning }}</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  addOutlinePage,
  getNonEmptyNodes,
  getSelectedOutlinePage,
  onStateChanged,
  patchState,
  readState,
} from './state';
import type { OutlinePage, StoryDirectorMode } from './types';
import {
  applyTimedGoalToCurrentSession,
  closeOutlinePage,
  continueTimedGoal,
  disableEndingReference,
  enableEndingReference,
  enableOutlinePage,
  pauseTimedGoal,
  queueSync,
  startNewTimedGoal,
} from './sync';

const tabs: Array<{ value: StoryDirectorMode; label: string }> = [
  { value: 'outline', label: '大纲模式' },
  { value: 'endingReference', label: '弱结局参考' },
  { value: 'timedEnding', label: '限时结局' },
];

const state = ref(readState(true));
const busy = ref(false);
const actionMessage = ref('');

let stopStateListener: (() => void) | null = null;

const selectedPage = computed(() => getSelectedOutlinePage(state.value));
const selectedNonEmptyNodes = computed(() => getNonEmptyNodes(selectedPage.value));
const modeLabel = computed(() => {
  if (state.value.activeMode === 'outline') {
    return '大纲启用中';
  }
  if (state.value.activeMode === 'endingReference') {
    return '结局参考启用中';
  }
  if (state.value.activeMode === 'timedEnding') {
    return '限时结局启用中';
  }
  return '未启用';
});

onMounted(() => {
  stopStateListener = onStateChanged(nextState => {
    state.value = nextState;
  });
});

onBeforeUnmount(() => {
  stopStateListener?.();
});

function setTab(tab: StoryDirectorMode) {
  patchState(stateToUpdate => {
    stateToUpdate.ui.tab = tab;
  });
}

function closeWindow() {
  patchState(stateToUpdate => {
    stateToUpdate.ui.visible = false;
  });
}

function queueIfOutlinePageEnabled(pageId: string, reason: string) {
  if (state.value.activeMode === 'outline' && state.value.outline.enabledPageId === pageId) {
    queueSync(reason, false, 450);
  }
}

function selectPage(pageId: string) {
  patchState(stateToUpdate => {
    stateToUpdate.outline.selectedPageId = pageId;
  });
  queueIfOutlinePageEnabled(pageId, '切换大纲页');
}

function addPage() {
  addOutlinePage();
}

function clearPage(pageId: string) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page) {
      return;
    }
    page.nodes = [''];
    page.completed = false;
    page.lastKnownNode = 1;
  });
  queueIfOutlinePageEnabled(pageId, '清空大纲页');
}

function textFromEvent(event: Event) {
  return (event.target as HTMLTextAreaElement | HTMLInputElement).value;
}

function updateNodeFromEvent(pageId: string, index: number, event: Event) {
  updateNode(pageId, index, textFromEvent(event));
}

function updateNode(pageId: string, index: number, value: string) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page) {
      return;
    }
    page.nodes[index] = value;
    page.completed = false;
  });
  queueIfOutlinePageEnabled(pageId, '编辑大纲节点');
}

function canAddNode(page: OutlinePage, index: number) {
  return index === page.nodes.length - 1 && page.nodes.at(-1)?.trim();
}

function addNode(pageId: string) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page || !page.nodes.at(-1)?.trim()) {
      return;
    }
    page.nodes.push('');
  });
}

function removeNode(pageId: string, index: number) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page || page.nodes.length <= 1) {
      return;
    }
    page.nodes.splice(index, 1);
    page.completed = false;
  });
  queueIfOutlinePageEnabled(pageId, '删除大纲节点');
}

function updateEndingReferenceFromEvent(event: Event) {
  updateEndingReference(textFromEvent(event));
}

function updateEndingReference(value: string) {
  patchState(stateToUpdate => {
    stateToUpdate.endingReference.text = value;
  });
  if (state.value.activeMode === 'endingReference') {
    queueSync('编辑弱结局参考', false, 450);
  }
}

function updateTimedGoalFromEvent(event: Event) {
  updateTimedGoal(textFromEvent(event));
}

function updateTimedGoal(value: string) {
  patchState(stateToUpdate => {
    stateToUpdate.timedEnding.goalText = value;
  });
  if (state.value.activeMode === 'timedEnding') {
    queueSync('编辑限时结局目标', false, 450);
  }
}

function updateTimedTargetFromEvent(event: Event) {
  updateTimedTarget(textFromEvent(event));
}

function updateTimedTarget(value: string) {
  const targetReplyIndex = Math.min(Math.max(Math.trunc(Number(value) || 1), 1), 999);
  patchState(stateToUpdate => {
    stateToUpdate.timedEnding.targetReplyIndex = targetReplyIndex;
  });
  if (state.value.activeMode === 'timedEnding') {
    queueSync('修改限时结局序号', false, 450);
  }
}

async function runAction(label: string, action: () => Promise<void>) {
  busy.value = true;
  actionMessage.value = '';
  try {
    await action();
    actionMessage.value = `${label}完成。`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    actionMessage.value = detail;
    toastr.warning(detail, '剧情指导');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.director-shell {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(64, 117, 96, 0.28);
  border-radius: 8px;
  color: #1f302a;
  background: #f7faf8;
  box-shadow: 0 18px 46px rgba(27, 50, 42, 0.22);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 58px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid rgba(64, 117, 96, 0.18);
  background: #edf6f1;
}

.title-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.title {
  overflow: hidden;
  color: #18362d;
  font-size: 15px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle,
.muted {
  color: #687a72;
  font-size: 12px;
}

.window-actions,
.action-row,
.row-between {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content {
  display: flex;
  height: calc(100% - 58px);
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow: auto;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.status-strip > div,
.session-box {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(64, 117, 96, 0.16);
  border-radius: 8px;
  background: #ffffff;
}

.status-label {
  display: block;
  margin-bottom: 3px;
  color: #687a72;
  font-size: 11px;
}

.status-strip strong,
.session-box strong {
  display: block;
  overflow: hidden;
  color: #1f302a;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: 8px;
  background: #e5f0ea;
}

.tabs button,
.page-tabs button,
button {
  min-height: 32px;
  border: 0;
  border-radius: 7px;
  color: #294238;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.tabs button.active,
.page-tabs button.active {
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(38, 76, 60, 0.12);
  font-weight: 700;
}

.panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(64, 117, 96, 0.16);
  border-radius: 8px;
  background: #ffffff;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

h2,
p {
  margin: 0;
}

h2 {
  color: #18362d;
  font-size: 15px;
}

p {
  color: #687a72;
  font-size: 12px;
  line-height: 1.5;
}

.page-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.page-tabs button {
  padding: 0 10px;
  border: 1px solid rgba(64, 117, 96, 0.16);
  background: #f8fbf9;
}

.page-tabs button.enabled {
  border-color: rgba(55, 114, 95, 0.55);
  color: #23634d;
}

.outline-editor,
.node-list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}

.row-between {
  justify-content: space-between;
}

.node-list {
  overflow: auto;
  padding-right: 2px;
}

.node-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 36px;
  gap: 8px;
  align-items: start;
}

.node-row label,
.field-label,
.number-grid label {
  color: #30453c;
  font-size: 12px;
  font-weight: 700;
}

textarea,
input {
  width: 100%;
  border: 1px solid rgba(64, 117, 96, 0.26);
  border-radius: 8px;
  color: #1f302a;
  background: #fbfdfc;
  font: inherit;
  outline: none;
}

textarea {
  min-height: 78px;
  padding: 9px 10px;
  resize: vertical;
  line-height: 1.5;
}

textarea:focus,
input:focus {
  border-color: #408a71;
  box-shadow: 0 0 0 2px rgba(64, 138, 113, 0.14);
}

.large-textarea {
  min-height: 220px;
  flex: 1;
}

.node-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.primary-button,
.secondary-button,
.ghost-button,
.small-button {
  border: 1px solid rgba(64, 117, 96, 0.22);
  padding: 0 12px;
  background: #ffffff;
}

.primary-button {
  border-color: #37725f;
  color: #ffffff;
  background: #37725f;
}

.secondary-button:hover,
.ghost-button:hover,
.small-button:hover {
  background: #eef6f1;
}

.primary-button:hover {
  background: #2f604f;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

button {
  touch-action: manipulation;
}

.small-button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  font-weight: 700;
}

.wrap {
  flex-wrap: wrap;
}

.number-grid {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 10px;
  align-items: end;
}

.number-grid input {
  margin-top: 6px;
  padding: 8px 10px;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(173, 121, 37, 0.22);
  border-radius: 8px;
  background: #fffaf0;
}

.messages p {
  color: #705322;
}

@media (max-width: 560px) {
  .director-shell {
    border-radius: 7px;
    box-shadow: 0 10px 28px rgba(27, 50, 42, 0.18);
  }

  .titlebar {
    height: 52px;
    gap: 8px;
    padding: 8px 9px 8px 12px;
  }

  .title-main {
    gap: 1px;
  }

  .title {
    font-size: 14px;
  }

  .subtitle,
  .muted {
    font-size: 11px;
  }

  .content {
    height: calc(100% - 52px);
    gap: 8px;
    padding: 8px;
  }

  .status-strip,
  .number-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .status-strip > div,
  .session-box,
  .panel,
  .messages {
    border-radius: 7px;
  }

  .tabs {
    gap: 4px;
    padding: 3px;
  }

  .tabs button {
    min-height: 34px;
    padding: 0 4px;
    font-size: 12px;
  }

  .panel {
    gap: 10px;
    padding: 10px;
  }

  .panel-head,
  .row-between {
    flex-wrap: wrap;
  }

  .panel-head > button,
  .row-between > button {
    width: 100%;
  }

  .page-tabs {
    flex-wrap: nowrap;
    margin: 0 -2px;
    padding: 0 2px 2px;
    overflow-x: auto;
  }

  .page-tabs button {
    flex: 0 0 auto;
  }

  textarea {
    min-height: 96px;
    padding: 8px 9px;
  }

  .node-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .node-actions {
    flex-direction: row;
  }

  .small-button {
    flex: 1;
  }

  .action-row {
    align-items: stretch;
    flex-direction: column;
  }

  .action-row button {
    width: 100%;
    min-height: 36px;
  }

  .large-textarea {
    min-height: 180px;
  }
}
</style>
