<template>
  <main class="map-tool-root">
    <header class="topbar">
      <div class="title-block">
        <input v-model="map.meta.title" class="title-input" maxlength="40" @change="commitChange" />
        <input v-model="map.meta.subtitle" class="subtitle-input" maxlength="80" @change="commitChange" />
      </div>

      <div class="top-actions">
        <span class="save-state">{{ saveStateText }}</span>
        <button type="button" class="tool-btn" title="新建地图" @click="createNewMap">新建</button>
        <button type="button" class="tool-btn" :disabled="!canUndo" title="撤销" @click="undo">撤销</button>
        <button type="button" class="tool-btn" :disabled="!canRedo" title="重做" @click="redo">重做</button>
        <button type="button" class="tool-btn" title="导入 map.json" @click="openImportFile">导入</button>
        <button type="button" class="tool-btn primary" title="生成自包含 HTML/SVG 代码" @click="openExportPanel">
          导出代码
        </button>
        <button type="button" class="tool-btn" title="关闭地图工具" @click="closeTool">关闭</button>
        <input ref="fileInputRef" type="file" accept="application/json,.json" class="hidden-file" @change="handleImportFile" />
      </div>
    </header>

    <section class="workspace">
      <aside class="left-panel">
        <section class="panel-section">
          <h2>工具</h2>
          <div class="tool-grid">
            <button
              v-for="item in toolOptions"
              :key="item.id"
              type="button"
              class="mode-btn"
              :aria-pressed="activeTool === item.id"
              :title="item.hint"
              @click="setActiveTool(item.id)"
            >
              <span class="mode-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </button>
          </div>
          <p class="hint-line">{{ activeToolHint }}</p>
        </section>

        <section class="panel-section">
          <h2>地图</h2>
          <label class="field">
            <span>宽度</span>
            <input v-model.number="map.canvas.width" type="number" min="320" max="4000" step="50" @change="commitChange" />
          </label>
          <label class="field">
            <span>高度</span>
            <input v-model.number="map.canvas.height" type="number" min="240" max="4000" step="50" @change="commitChange" />
          </label>
          <label class="toggle-line">
            <span>显示网格</span>
            <input v-model="map.canvas.show_grid" type="checkbox" @change="commitChange" />
          </label>
        </section>

        <section class="panel-section">
          <h2>配色</h2>
          <select v-model="selectedThemeId" class="select-input" @change="applyThemePreset">
            <option v-for="theme in themePresets" :key="theme.id" :value="theme.id">{{ theme.name }}</option>
          </select>
          <div class="swatch-grid">
            <label v-for="item in themeColorFields" :key="item.key" class="swatch-field">
              <span>{{ item.label }}</span>
              <input v-model="map.theme[item.key]" type="color" @change="commitChange" />
            </label>
          </div>
        </section>

        <section class="panel-section">
          <h2>地形</h2>
          <select v-model="activeTerrainType" class="select-input">
            <option value="mountain">山脉</option>
            <option value="forest">森林</option>
            <option value="water">水域</option>
            <option value="waste">荒地</option>
            <option value="border">边界</option>
            <option value="road">道路纹理</option>
          </select>
          <label class="field">
            <span>画笔粗细</span>
            <input v-model.number="terrainBrushWidth" type="range" min="2" max="64" step="1" />
          </label>
          <label class="field">
            <span>透明度</span>
            <input v-model.number="terrainBrushOpacity" type="range" min="0.1" max="1" step="0.05" />
          </label>
        </section>
      </aside>

      <section class="stage-panel">
        <div class="stage-toolbar">
          <span>缩放 {{ Math.round(view.zoom * 100) }}%</span>
          <button type="button" class="tool-btn" @click="zoomBy(1.15)">放大</button>
          <button type="button" class="tool-btn" @click="zoomBy(0.85)">缩小</button>
          <button type="button" class="tool-btn" @click="resetView">复位</button>
          <button type="button" class="tool-btn" @click="finishDraftShape">完成形状</button>
          <button type="button" class="tool-btn danger" :disabled="!selectedElement" @click="deleteSelected">删除选中</button>
        </div>

        <div
          ref="viewportRef"
          class="map-viewport"
          @pointerdown="handleViewportPointerDown"
          @pointermove="handleViewportPointerMove"
          @pointerup="handleViewportPointerUp"
          @pointerleave="handleViewportPointerLeave"
          @dblclick="finishDraftShape"
          @wheel.prevent="handleWheel"
        >
          <svg
            ref="svgRef"
            class="map-canvas"
            :viewBox="`${view.x} ${view.y} ${viewWidth} ${viewHeight}`"
            :width="map.canvas.width"
            :height="map.canvas.height"
            role="img"
            :aria-label="map.meta.title"
          >
            <defs>
              <pattern id="editor-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path :stroke="map.theme.grid" d="M 40 0 L 0 0 0 40" fill="none" stroke-width="1" opacity="0.48" />
              </pattern>
              <filter id="label-halo">
                <feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="spread" />
                <feFlood flood-color="rgba(255,255,255,0.72)" result="white" />
                <feComposite in="white" in2="spread" operator="in" result="outline" />
                <feMerge>
                  <feMergeNode in="outline" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect :width="map.canvas.width" :height="map.canvas.height" :fill="map.theme.background" />
            <rect
              v-if="map.canvas.show_grid"
              :width="map.canvas.width"
              :height="map.canvas.height"
              fill="url(#editor-grid)"
            />
            <rect
              x="28"
              y="28"
              :width="map.canvas.width - 56"
              :height="map.canvas.height - 56"
              rx="18"
              fill="none"
              :stroke="map.theme.line"
              stroke-width="3"
              opacity="0.55"
            />

            <g class="element-layer">
              <template v-for="element in sortedVisibleElements" :key="element.id">
                <polygon
                  v-if="element.type === 'region'"
                  :points="pointsToPolyline(element.points)"
                  :fill="element.style.fill"
                  :fill-opacity="element.style.opacity"
                  :stroke="element.style.stroke"
                  :class="elementClass(element)"
                  stroke-width="3"
                  stroke-linejoin="round"
                  @pointerdown.stop="handleElementPointerDown(element, $event)"
                />
                <polyline
                  v-else-if="element.type === 'route'"
                  :points="pointsToPolyline(element.points)"
                  fill="none"
                  :stroke="element.style.color"
                  :stroke-width="element.style.width"
                  :stroke-dasharray="element.style.dash ? `${element.style.width * 2} ${element.style.width * 1.5}` : undefined"
                  :class="elementClass(element)"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  @pointerdown.stop="handleElementPointerDown(element, $event)"
                />
                <path
                  v-else-if="element.type === 'terrain'"
                  :d="pointsToPath(element.points)"
                  fill="none"
                  :stroke="element.style.color"
                  :stroke-width="element.style.width"
                  :stroke-dasharray="element.terrain_type === 'border' ? `${element.style.width * 1.6} ${element.style.width}` : undefined"
                  :opacity="element.style.opacity"
                  :class="elementClass(element)"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  @pointerdown.stop="handleElementPointerDown(element, $event)"
                />
                <g
                  v-else-if="element.type === 'location'"
                  :class="elementClass(element)"
                  @pointerdown.stop="handleElementPointerDown(element, $event)"
                >
                  <path
                    v-if="element.icon === 'pin'"
                    :d="pinPath(element)"
                    :fill="element.style.color"
                    stroke="rgba(0,0,0,0.28)"
                    stroke-width="2"
                  />
                  <g v-else-if="element.icon === 'city'" :fill="element.style.color" stroke="rgba(0,0,0,0.28)" stroke-width="2">
                    <rect
                      :x="element.position.x - element.style.size * 0.62"
                      :y="element.position.y - element.style.size * 0.36"
                      :width="element.style.size * 0.42"
                      :height="element.style.size * 0.72"
                      rx="2"
                    />
                    <rect
                      :x="element.position.x - element.style.size * 0.12"
                      :y="element.position.y - element.style.size * 0.62"
                      :width="element.style.size * 0.46"
                      :height="element.style.size * 0.98"
                      rx="2"
                    />
                    <rect
                      :x="element.position.x + element.style.size * 0.42"
                      :y="element.position.y - element.style.size * 0.26"
                      :width="element.style.size * 0.32"
                      :height="element.style.size * 0.62"
                      rx="2"
                    />
                  </g>
                  <path
                    v-else-if="element.icon === 'castle'"
                    :d="castlePath(element)"
                    :fill="element.style.color"
                    stroke="rgba(0,0,0,0.3)"
                    stroke-width="2"
                  />
                  <path
                    v-else-if="element.icon === 'camp'"
                    :d="campPath(element)"
                    :fill="element.style.color"
                    stroke="rgba(0,0,0,0.3)"
                    stroke-width="2"
                  />
                  <g
                    v-else-if="element.icon === 'port'"
                    fill="none"
                    :stroke="element.style.color"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    :stroke-width="Math.max(3, element.style.size * 0.14)"
                  >
                    <path :d="portMastPath(element)" />
                    <path :d="portCrossPath(element)" />
                    <path :d="portHullPath(element)" />
                  </g>
                  <path
                    v-else
                    :d="starPath(element.position.x, element.position.y, element.style.size * 0.78, element.style.size * 0.34)"
                    :fill="element.style.color"
                    stroke="rgba(0,0,0,0.24)"
                    stroke-width="2"
                  />
                  <text
                    :x="element.position.x"
                    :y="element.position.y + element.style.size + 18"
                    :fill="element.style.label_color"
                    :font-size="Math.max(13, element.style.size * 0.55)"
                    text-anchor="middle"
                    font-weight="700"
                    filter="url(#label-halo)"
                  >
                    {{ element.name }}
                  </text>
                </g>
                <text
                  v-else-if="element.type === 'label'"
                  :x="element.position.x"
                  :y="element.position.y"
                  :fill="element.style.color"
                  :font-size="element.style.size"
                  text-anchor="middle"
                  font-weight="700"
                  filter="url(#label-halo)"
                  :class="elementClass(element)"
                  @pointerdown.stop="handleElementPointerDown(element, $event)"
                >
                  {{ element.name }}
                </text>
              </template>
            </g>

            <polyline
              v-if="draftPoints.length > 0 && activeTool === 'route'"
              :points="pointsToPolyline(draftPoints)"
              fill="none"
              :stroke="map.theme.route"
              stroke-width="5"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.72"
            />
            <polygon
              v-if="draftPoints.length > 1 && activeTool === 'region'"
              :points="pointsToPolyline(draftPoints)"
              :fill="map.theme.region"
              :stroke="map.theme.line"
              fill-opacity="0.18"
              stroke-width="3"
              opacity="0.85"
            />
            <path
              v-if="draftTerrainPoints.length > 1"
              :d="pointsToPath(draftTerrainPoints)"
              fill="none"
              :stroke="terrainPreviewColor"
              :stroke-width="terrainBrushWidth"
              :opacity="terrainBrushOpacity"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </section>

      <aside class="right-panel">
        <section class="panel-section">
          <h2>元素</h2>
          <div class="element-list">
            <button
              v-for="element in sortedElements"
              :key="element.id"
              type="button"
              class="element-row"
              :aria-pressed="selectedElementId === element.id"
              @click="selectElement(element.id)"
            >
              <span>{{ elementTypeName(element) }}</span>
              <strong>{{ element.name }}</strong>
            </button>
          </div>
        </section>

        <section class="panel-section property-panel">
          <h2>属性</h2>
          <template v-if="selectedElement">
            <label class="field">
              <span>名称</span>
              <input v-model="selectedElement.name" maxlength="48" @change="commitChange" />
            </label>
            <label class="field">
              <span>备注</span>
              <textarea v-model="selectedElement.note" rows="4" maxlength="420" @change="commitChange"></textarea>
            </label>
            <div class="inline-grid">
              <label class="field">
                <span>层级</span>
                <input v-model.number="selectedElement.layer" type="number" min="0" max="99" @change="commitChange" />
              </label>
              <label class="toggle-line property-toggle">
                <span>可见</span>
                <input v-model="selectedElement.visible" type="checkbox" @change="commitChange" />
              </label>
            </div>

            <template v-if="selectedElement.type === 'location'">
              <label class="field">
                <span>图标</span>
                <select v-model="selectedElement.icon" @change="commitChange">
                  <option value="pin">标记</option>
                  <option value="city">城镇</option>
                  <option value="castle">城堡</option>
                  <option value="camp">营地</option>
                  <option value="port">港口</option>
                  <option value="star">星标</option>
                </select>
              </label>
              <label class="swatch-field wide">
                <span>图标色</span>
                <input v-model="selectedElement.style.color" type="color" @change="commitChange" />
              </label>
              <label class="swatch-field wide">
                <span>文字色</span>
                <input v-model="selectedElement.style.label_color" type="color" @change="commitChange" />
              </label>
              <label class="field">
                <span>大小</span>
                <input v-model.number="selectedElement.style.size" type="range" min="8" max="80" @change="commitChange" />
              </label>
            </template>

            <template v-else-if="selectedElement.type === 'route'">
              <label class="swatch-field wide">
                <span>路线色</span>
                <input v-model="selectedElement.style.color" type="color" @change="commitChange" />
              </label>
              <label class="field">
                <span>宽度</span>
                <input v-model.number="selectedElement.style.width" type="range" min="1" max="40" @change="commitChange" />
              </label>
              <label class="toggle-line">
                <span>虚线</span>
                <input v-model="selectedElement.style.dash" type="checkbox" @change="commitChange" />
              </label>
            </template>

            <template v-else-if="selectedElement.type === 'region'">
              <label class="swatch-field wide">
                <span>填充</span>
                <input v-model="selectedElement.style.fill" type="color" @change="commitChange" />
              </label>
              <label class="swatch-field wide">
                <span>边线</span>
                <input v-model="selectedElement.style.stroke" type="color" @change="commitChange" />
              </label>
              <label class="field">
                <span>透明度</span>
                <input v-model.number="selectedElement.style.opacity" type="range" min="0" max="1" step="0.05" @change="commitChange" />
              </label>
            </template>

            <template v-else-if="selectedElement.type === 'terrain'">
              <label class="field">
                <span>地形类型</span>
                <select v-model="selectedElement.terrain_type" @change="renameTerrainAndCommit">
                  <option value="mountain">山脉</option>
                  <option value="forest">森林</option>
                  <option value="water">水域</option>
                  <option value="waste">荒地</option>
                  <option value="border">边界</option>
                  <option value="road">道路纹理</option>
                </select>
              </label>
              <label class="swatch-field wide">
                <span>颜色</span>
                <input v-model="selectedElement.style.color" type="color" @change="commitChange" />
              </label>
              <label class="field">
                <span>宽度</span>
                <input v-model.number="selectedElement.style.width" type="range" min="1" max="80" @change="commitChange" />
              </label>
              <label class="field">
                <span>透明度</span>
                <input v-model.number="selectedElement.style.opacity" type="range" min="0.1" max="1" step="0.05" @change="commitChange" />
              </label>
            </template>

            <template v-else-if="selectedElement.type === 'label'">
              <label class="swatch-field wide">
                <span>文字色</span>
                <input v-model="selectedElement.style.color" type="color" @change="commitChange" />
              </label>
              <label class="field">
                <span>字号</span>
                <input v-model.number="selectedElement.style.size" type="range" min="8" max="80" @change="commitChange" />
              </label>
            </template>
          </template>
          <p v-else class="empty-state">选择一个元素，或在地图上新增地点、路线、区域、地形。</p>
        </section>
      </aside>
    </section>

    <section v-if="exportPanelOpen" class="modal-backdrop" @click.self="exportPanelOpen = false">
      <div class="export-modal">
        <header class="modal-head">
          <div>
            <h2>导出地图</h2>
            <p>HTML 可直接展示；JSON 适合交给 AI 编程助手继续编辑；SVG 适合轻量分享。</p>
          </div>
          <button type="button" class="tool-btn" @click="exportPanelOpen = false">关闭</button>
        </header>
        <div class="download-row">
          <button type="button" class="tool-btn primary" @click="downloadHtml">下载 HTML</button>
          <button type="button" class="tool-btn" @click="downloadJson">下载 JSON</button>
          <button type="button" class="tool-btn" @click="downloadSvg">下载 SVG</button>
          <button type="button" class="tool-btn" @click="copyHtmlCode">复制 HTML</button>
        </div>
        <textarea class="export-code" readonly :value="exportBundle.html"></textarea>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { uuidv4 } from '@util/common';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { createExportBundle } from './exportMap';
import {
  MAP_STORAGE_KEY,
  THEME_PRESETS,
  cloneDocument,
  createDefaultDocument,
  makeLabel,
  makeLocation,
  makeRegion,
  makeRoute,
  makeTerrain,
  parseMapDocument,
  pointDistance,
  pointsToPath,
  pointsToPolyline,
  terrainName,
  withUpdatedTimestamp,
  type LabelElement,
  type LocationElement,
  type MapDocument,
  type MapElement,
  type MapPoint,
  type TerrainType,
} from './mapModel';

type ToolMode = 'select' | 'pan' | 'location' | 'route' | 'region' | 'terrain' | 'eraser' | 'label';
type DragState =
  | { type: 'pan'; screen: MapPoint; view: MapPoint }
  | { type: 'move'; element_id: string; start: MapPoint; snapshot: MapElement }
  | { type: 'terrain'; points: MapPoint[] };

const props = defineProps<{ onClose?: () => void }>();

const themePresets = THEME_PRESETS;
const map = ref<MapDocument>(loadInitialDocument());
const selectedElementId = ref<string | null>(map.value.elements[0]?.id ?? null);
const activeTool = ref<ToolMode>('select');
const activeTerrainType = ref<TerrainType>('mountain');
const terrainBrushWidth = ref(18);
const terrainBrushOpacity = ref(0.75);
const draftPoints = ref<MapPoint[]>([]);
const draftTerrainPoints = ref<MapPoint[]>([]);
const dragState = ref<DragState | null>(null);
const exportPanelOpen = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const saveStateText = ref('已保存');
const history = ref<string[]>([]);
const redoHistory = ref<string[]>([]);
const isApplyingHistory = ref(false);
const selectedThemeId = ref(map.value.theme.id);

const view = ref({
  x: 0,
  y: 0,
  zoom: 1,
});

const toolOptions: Array<{ id: ToolMode; label: string; icon: string; hint: string }> = [
  { id: 'select', label: '选择', icon: 'V', hint: '选择并拖动元素' },
  { id: 'pan', label: '平移', icon: 'M', hint: '拖动画布视野' },
  { id: 'location', label: '地点', icon: '+', hint: '点击地图添加地点' },
  { id: 'route', label: '路线', icon: '/', hint: '连续点击添加路线节点，点击完成形状结束' },
  { id: 'region', label: '区域', icon: '□', hint: '连续点击添加区域顶点，点击完成形状结束' },
  { id: 'terrain', label: '地形', icon: '~', hint: '按住拖动绘制地形笔触' },
  { id: 'eraser', label: '橡皮', icon: 'X', hint: '点击元素删除' },
  { id: 'label', label: '标签', icon: 'T', hint: '点击地图添加文字标签' },
];

const themeColorFields: Array<{ key: keyof MapDocument['theme']; label: string }> = [
  { key: 'background', label: '背景' },
  { key: 'grid', label: '网格' },
  { key: 'line', label: '边线' },
  { key: 'route', label: '路线' },
  { key: 'region', label: '区域' },
  { key: 'location', label: '地点' },
  { key: 'text', label: '文字' },
  { key: 'terrain', label: '地形' },
];

const sortedElements = computed(() => [...map.value.elements].sort((lhs, rhs) => lhs.layer - rhs.layer));
const sortedVisibleElements = computed(() => sortedElements.value.filter(element => element.visible));
const selectedElement = computed(() => map.value.elements.find(element => element.id === selectedElementId.value) ?? null);
const viewWidth = computed(() => map.value.canvas.width / view.value.zoom);
const viewHeight = computed(() => map.value.canvas.height / view.value.zoom);
const canUndo = computed(() => history.value.length > 0);
const canRedo = computed(() => redoHistory.value.length > 0);
const terrainPreviewColor = computed(() => {
  if (activeTerrainType.value === 'water') {
    return map.value.theme.water;
  }
  if (activeTerrainType.value === 'road') {
    return map.value.theme.route;
  }
  return map.value.theme.terrain;
});
const exportBundle = computed(() => createExportBundle(map.value));
const activeToolHint = computed(() => toolOptions.find(option => option.id === activeTool.value)?.hint ?? '');

watch(
  map,
  value => {
    if (isApplyingHistory.value) {
      return;
    }
    saveStateText.value = '保存中...';
    window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(value));
    window.setTimeout(() => {
      saveStateText.value = '已保存';
    }, 160);
  },
  { deep: true },
);

onMounted(() => {
  pushHistorySnapshot();
  nextTick(resetView);
});

function loadInitialDocument(): MapDocument {
  const raw = window.localStorage.getItem(MAP_STORAGE_KEY);
  if (!raw) {
    return createDefaultDocument();
  }
  try {
    return parseMapDocument(JSON.parse(raw));
  } catch (error) {
    console.warn('[叙事地图工具] 草稿解析失败，已创建默认地图。', error);
    return createDefaultDocument();
  }
}

function setActiveTool(tool: ToolMode) {
  activeTool.value = tool;
  draftPoints.value = [];
  draftTerrainPoints.value = [];
}

function commitChange() {
  map.value = withUpdatedTimestamp(map.value);
  pushHistorySnapshot();
}

function pushHistorySnapshot() {
  if (isApplyingHistory.value) {
    return;
  }
  const snapshot = JSON.stringify(map.value);
  if (history.value[history.value.length - 1] === snapshot) {
    return;
  }
  history.value.push(snapshot);
  if (history.value.length > 80) {
    history.value.shift();
  }
  redoHistory.value = [];
}

function undo() {
  if (history.value.length <= 1) {
    return;
  }
  const current = history.value.pop();
  if (current) {
    redoHistory.value.push(current);
  }
  applySnapshot(history.value[history.value.length - 1]);
}

function redo() {
  const snapshot = redoHistory.value.pop();
  if (!snapshot) {
    return;
  }
  history.value.push(snapshot);
  applySnapshot(snapshot);
}

function applySnapshot(snapshot: string | undefined) {
  if (!snapshot) {
    return;
  }
  isApplyingHistory.value = true;
  map.value = parseMapDocument(JSON.parse(snapshot));
  selectedThemeId.value = map.value.theme.id;
  window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(map.value));
  nextTick(() => {
    isApplyingHistory.value = false;
  });
}

function createNewMap() {
  if (!confirm('确定要新建地图吗？当前草稿会被新的默认地图替换。')) {
    return;
  }
  map.value = createDefaultDocument();
  selectedElementId.value = map.value.elements[0]?.id ?? null;
  selectedThemeId.value = map.value.theme.id;
  history.value = [];
  redoHistory.value = [];
  pushHistorySnapshot();
  resetView();
}

function resetView() {
  view.value = { x: 0, y: 0, zoom: 1 };
}

function zoomBy(factor: number, center?: MapPoint) {
  const nextZoom = _.clamp(view.value.zoom * factor, 0.35, 4);
  if (center) {
    const oldWidth = viewWidth.value;
    const oldHeight = viewHeight.value;
    const nextWidth = map.value.canvas.width / nextZoom;
    const nextHeight = map.value.canvas.height / nextZoom;
    const ratioX = (center.x - view.value.x) / oldWidth;
    const ratioY = (center.y - view.value.y) / oldHeight;
    view.value.x = _.clamp(center.x - nextWidth * ratioX, 0, Math.max(0, map.value.canvas.width - nextWidth));
    view.value.y = _.clamp(center.y - nextHeight * ratioY, 0, Math.max(0, map.value.canvas.height - nextHeight));
  }
  view.value.zoom = nextZoom;
  clampView();
}

function clampView() {
  view.value.x = _.clamp(view.value.x, 0, Math.max(0, map.value.canvas.width - viewWidth.value));
  view.value.y = _.clamp(view.value.y, 0, Math.max(0, map.value.canvas.height - viewHeight.value));
}

function handleWheel(event: WheelEvent) {
  const point = screenToMapPoint(event);
  zoomBy(event.deltaY > 0 ? 0.9 : 1.1, point);
}

function handleViewportPointerDown(event: PointerEvent) {
  const point = screenToMapPoint(event);
  if (activeTool.value === 'pan') {
    dragState.value = {
      type: 'pan',
      screen: { x: event.clientX, y: event.clientY },
      view: { x: view.value.x, y: view.value.y },
    };
    capturePointer(event);
    return;
  }

  if (activeTool.value === 'location') {
    addElement(makeLocation(map.value.theme, point));
    return;
  }

  if (activeTool.value === 'label') {
    addElement(makeLabel(map.value.theme, point));
    return;
  }

  if (activeTool.value === 'route' || activeTool.value === 'region') {
    draftPoints.value = [...draftPoints.value, point];
    return;
  }

  if (activeTool.value === 'terrain') {
    draftTerrainPoints.value = [point];
    dragState.value = {
      type: 'terrain',
      points: [point],
    };
    capturePointer(event);
  }
}

function handleViewportPointerMove(event: PointerEvent) {
  const state = dragState.value;
  if (!state) {
    return;
  }

  if (state.type === 'pan') {
    const scale = 1 / view.value.zoom;
    view.value.x = state.view.x - (event.clientX - state.screen.x) * scale;
    view.value.y = state.view.y - (event.clientY - state.screen.y) * scale;
    clampView();
    return;
  }

  if (state.type === 'move') {
    const point = screenToMapPoint(event);
    const delta = { x: point.x - state.start.x, y: point.y - state.start.y };
    const element = map.value.elements.find(item => item.id === state.element_id);
    if (element) {
      moveElementFromSnapshot(element, state.snapshot, delta);
    }
    return;
  }

  if (state.type === 'terrain') {
    const point = screenToMapPoint(event);
    const last = state.points[state.points.length - 1];
    if (!last || pointDistance(last, point) >= 8) {
      state.points.push(point);
      draftTerrainPoints.value = [...state.points];
    }
  }
}

function handleViewportPointerUp() {
  finishPointerInteraction();
}

function handleViewportPointerLeave() {
  if (dragState.value?.type === 'terrain') {
    finishPointerInteraction();
  }
}

function finishPointerInteraction() {
  const state = dragState.value;
  if (!state) {
    return;
  }

  if (state.type === 'move') {
    commitChange();
  }

  if (state.type === 'terrain' && state.points.length > 1) {
    addElement(makeTerrain(map.value.theme, activeTerrainType.value, state.points));
    draftTerrainPoints.value = [];
  }

  dragState.value = null;
}

function handleElementPointerDown(element: MapElement, event: PointerEvent) {
  if (activeTool.value === 'eraser') {
    removeElement(element.id);
    return;
  }

  selectedElementId.value = element.id;
  if (activeTool.value !== 'select') {
    return;
  }

  dragState.value = {
    type: 'move',
    element_id: element.id,
    start: screenToMapPoint(event),
    snapshot: cloneDocument(element),
  };
  capturePointer(event);
}

function capturePointer(event: PointerEvent) {
  viewportRef.value?.setPointerCapture?.(event.pointerId);
}

function screenToMapPoint(event: MouseEvent | PointerEvent | WheelEvent): MapPoint {
  const svg = svgRef.value;
  if (!svg) {
    return { x: 0, y: 0 };
  }
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    return { x: 0, y: 0 };
  }
  const transformed = point.matrixTransform(matrix.inverse());
  return {
    x: _.clamp(transformed.x, 0, map.value.canvas.width),
    y: _.clamp(transformed.y, 0, map.value.canvas.height),
  };
}

function moveElementFromSnapshot(element: MapElement, snapshot: MapElement, delta: MapPoint) {
  if ('position' in element && 'position' in snapshot) {
    element.position = {
      x: _.clamp(snapshot.position.x + delta.x, 0, map.value.canvas.width),
      y: _.clamp(snapshot.position.y + delta.y, 0, map.value.canvas.height),
    };
    return;
  }
  if ('points' in element && 'points' in snapshot) {
    element.points = snapshot.points.map(point => ({
      x: _.clamp(point.x + delta.x, 0, map.value.canvas.width),
      y: _.clamp(point.y + delta.y, 0, map.value.canvas.height),
    }));
  }
}

function addElement(element: MapElement) {
  map.value.elements.push(element);
  selectedElementId.value = element.id;
  commitChange();
}

function removeElement(id: string) {
  map.value.elements = map.value.elements.filter(element => element.id !== id);
  if (selectedElementId.value === id) {
    selectedElementId.value = map.value.elements[0]?.id ?? null;
  }
  commitChange();
}

function deleteSelected() {
  if (selectedElementId.value) {
    removeElement(selectedElementId.value);
  }
}

function selectElement(id: string) {
  selectedElementId.value = id;
  activeTool.value = 'select';
}

function finishDraftShape() {
  if (activeTool.value === 'route' && draftPoints.value.length >= 2) {
    addElement(makeRoute(map.value.theme, draftPoints.value));
    draftPoints.value = [];
  }
  if (activeTool.value === 'region' && draftPoints.value.length >= 3) {
    addElement(makeRegion(map.value.theme, draftPoints.value));
    draftPoints.value = [];
  }
}

function applyThemePreset() {
  const theme = themePresets.find(item => item.id === selectedThemeId.value);
  if (!theme) {
    return;
  }
  map.value.theme = cloneDocument(theme);
  commitChange();
}

function renameTerrainAndCommit() {
  if (selectedElement.value?.type === 'terrain') {
    selectedElement.value.name = terrainName(selectedElement.value.terrain_type);
  }
  commitChange();
}

function openImportFile() {
  fileInputRef.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) {
    return;
  }
  try {
    const content = await file.text();
    const parsed = parseMapDocument(JSON.parse(content));
    map.value = parsed;
    selectedElementId.value = parsed.elements[0]?.id ?? null;
    selectedThemeId.value = parsed.theme.id;
    history.value = [];
    redoHistory.value = [];
    pushHistorySnapshot();
    window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(map.value));
    toastr.success('地图 JSON 已导入');
  } catch (error) {
    console.error('[叙事地图工具] 导入失败', error);
    toastr.error('导入失败，请确认文件是 map.json');
  }
}

function openExportPanel() {
  exportPanelOpen.value = true;
}

function downloadHtml() {
  downloadText(`${safeFilename(map.value.meta.title)}.html`, exportBundle.value.html, 'text/html;charset=utf-8');
}

function downloadJson() {
  downloadText(`${safeFilename(map.value.meta.title)}.json`, exportBundle.value.json, 'application/json;charset=utf-8');
}

function downloadSvg() {
  downloadText(`${safeFilename(map.value.meta.title)}.svg`, exportBundle.value.svg, 'image/svg+xml;charset=utf-8');
}

async function copyHtmlCode() {
  try {
    await navigator.clipboard.writeText(exportBundle.value.html);
    toastr.success('HTML 代码已复制');
  } catch {
    toastr.warning('浏览器不允许复制，请在文本框中手动复制');
  }
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function closeTool() {
  props.onClose?.();
}

function safeFilename(value: string): string {
  return (value.trim() || 'map').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
}

function elementClass(element: MapElement) {
  return {
    'map-element': true,
    selected: selectedElementId.value === element.id,
  };
}

function elementTypeName(element: MapElement): string {
  const names: Record<MapElement['type'], string> = {
    location: '地点',
    route: '路线',
    region: '区域',
    terrain: '地形',
    label: '标签',
  };
  return names[element.type];
}

function pinPath(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  return `M ${x} ${y + size * 0.88} C ${x - size * 0.72} ${y - size * 0.02}, ${x - size * 0.58} ${y - size * 0.9}, ${x} ${y - size * 0.9} C ${x + size * 0.58} ${y - size * 0.9}, ${x + size * 0.72} ${y - size * 0.02}, ${x} ${y + size * 0.88} Z`;
}

function castlePath(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  return `M ${x - size * 0.78} ${y + size * 0.45} V ${y - size * 0.45} L ${x - size * 0.52} ${y - size * 0.24} L ${x - size * 0.26} ${y - size * 0.45} L ${x} ${y - size * 0.24} L ${x + size * 0.26} ${y - size * 0.45} L ${x + size * 0.52} ${y - size * 0.24} L ${x + size * 0.78} ${y - size * 0.45} V ${y + size * 0.45} Z`;
}

function campPath(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  return `M ${x} ${y - size * 0.82} L ${x - size * 0.72} ${y + size * 0.62} H ${x + size * 0.72} Z M ${x} ${y - size * 0.82} V ${y + size * 0.62}`;
}

function portMastPath(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  return `M ${x} ${y - size * 0.84} V ${y + size * 0.44}`;
}

function portCrossPath(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  return `M ${x - size * 0.44} ${y - size * 0.36} H ${x + size * 0.44}`;
}

function portHullPath(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  return `M ${x - size * 0.62} ${y + size * 0.08} C ${x - size * 0.34} ${y + size * 0.62}, ${x + size * 0.34} ${y + size * 0.62}, ${x + size * 0.62} ${y + size * 0.08}`;
}

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  });
  return `M ${points.join(' L ')} Z`;
}
</script>

<style lang="scss" scoped>
.map-tool-root {
  width: 100%;
  height: 100dvh;
  min-width: 0;
  color: #1d2730;
  background: #e7edf0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  font-family: 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif;
}

.topbar {
  min-width: 0;
  border-bottom: 1px solid #b9c6ce;
  padding: 10px 12px;
  background: #f8fafb;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.title-block {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.title-input,
.subtitle-input {
  width: 100%;
  border: 0;
  padding: 0;
  color: #16222a;
  background: transparent;
  outline: none;
}

.title-input {
  font-size: 21px;
  font-weight: 800;
}

.subtitle-input {
  color: #596975;
  font-size: 13px;
}

.top-actions,
.stage-toolbar,
.download-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.save-state {
  color: #687782;
  font-size: 12px;
  white-space: nowrap;
}

.tool-btn,
.mode-btn {
  min-height: 32px;
  border: 1px solid #aebec7;
  border-radius: 8px;
  color: #1b2a34;
  background: #ffffff;
  cursor: pointer;
}

.tool-btn {
  padding: 6px 10px;
}

.tool-btn.primary {
  border-color: #2f7d8c;
  color: #ffffff;
  background: #2f7d8c;
}

.tool-btn.danger {
  border-color: #c55353;
  color: #8b2323;
}

.tool-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 280px;
}

.left-panel,
.right-panel {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid #bdc8cf;
  padding: 10px;
  background: #f3f6f7;
  display: grid;
  align-content: start;
  gap: 10px;
}

.right-panel {
  border-right: 0;
  border-left: 1px solid #bdc8cf;
}

.panel-section {
  border: 1px solid #c8d2d8;
  border-radius: 8px;
  padding: 10px;
  background: #ffffff;
  display: grid;
  gap: 10px;
}

.panel-section h2 {
  margin: 0;
  color: #23313a;
  font-size: 14px;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.mode-btn {
  padding: 8px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  text-align: left;
}

.mode-btn[aria-pressed='true'] {
  border-color: #2f7d8c;
  box-shadow: 0 0 0 2px rgba(47, 125, 140, 0.16);
}

.mode-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: #ffffff;
  background: #45606e;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
}

.hint-line,
.empty-state,
.modal-head p {
  margin: 0;
  color: #63727d;
  font-size: 12px;
  line-height: 1.55;
}

.field,
.swatch-field {
  display: grid;
  gap: 6px;
}

.field span,
.swatch-field span,
.toggle-line span {
  color: #60707c;
  font-size: 12px;
}

.field input,
.field textarea,
.field select,
.select-input {
  width: 100%;
  border: 1px solid #b9c6ce;
  border-radius: 8px;
  padding: 7px 8px;
  color: #20313d;
  background: #fbfdfd;
  outline: none;
}

.field textarea {
  resize: vertical;
}

.toggle-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.swatch-field input {
  width: 100%;
  height: 34px;
  border: 1px solid #b9c6ce;
  border-radius: 8px;
  padding: 3px;
  background: #ffffff;
}

.swatch-field.wide {
  grid-template-columns: minmax(0, 1fr) 64px;
  align-items: center;
}

.stage-panel {
  min-width: 0;
  min-height: 0;
  padding: 10px;
  background: #d9e2e6;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
}

.stage-toolbar {
  justify-content: flex-start;
  border: 1px solid #bdc8cf;
  border-radius: 8px;
  padding: 8px;
  background: #f8fafb;
}

.stage-toolbar span {
  color: #596975;
  font-size: 12px;
}

.map-viewport {
  min-height: 0;
  overflow: hidden;
  border: 1px solid #aebec7;
  border-radius: 8px;
  background: #aebec7;
  cursor: crosshair;
  touch-action: none;
}

.map-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.map-element {
  cursor: grab;
  transition: filter 120ms ease, opacity 120ms ease;
}

.map-element:hover {
  filter: drop-shadow(0 0 5px rgba(21, 93, 112, 0.42));
}

.map-element.selected {
  filter: drop-shadow(0 0 7px rgba(229, 106, 53, 0.8));
}

.element-list {
  max-height: 220px;
  overflow: auto;
  display: grid;
  gap: 6px;
}

.element-row {
  width: 100%;
  border: 1px solid #c8d2d8;
  border-radius: 8px;
  padding: 7px 8px;
  color: #20313d;
  background: #fbfdfd;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
  text-align: left;
  cursor: pointer;
}

.element-row span {
  color: #71808b;
  font-size: 12px;
}

.element-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.element-row[aria-pressed='true'] {
  border-color: #2f7d8c;
  background: #eaf6f7;
}

.property-panel {
  align-content: start;
}

.inline-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.property-toggle {
  min-height: 35px;
}

.hidden-file {
  display: none;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  padding: 18px;
  background: rgba(7, 12, 18, 0.58);
  display: grid;
  place-items: center;
}

.export-modal {
  width: min(980px, 100%);
  max-height: min(760px, calc(100dvh - 36px));
  border: 1px solid #c8d2d8;
  border-radius: 8px;
  padding: 14px;
  background: #ffffff;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.modal-head h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.download-row {
  justify-content: flex-start;
}

.export-code {
  width: 100%;
  min-height: 0;
  border: 1px solid #b9c6ce;
  border-radius: 8px;
  padding: 10px;
  color: #dce8ec;
  background: #121922;
  resize: none;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.55;
}

@media (max-width: 980px) {
  .workspace {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .right-panel {
    grid-column: 1 / -1;
    border-top: 1px solid #bdc8cf;
    border-left: 0;
    max-height: 280px;
  }
}

@media (max-width: 720px) {
  .topbar {
    grid-template-columns: 1fr;
  }

  .top-actions {
    justify-content: flex-start;
  }

  .workspace {
    grid-template-columns: 1fr;
  }

  .left-panel {
    max-height: 320px;
  }

  .stage-panel {
    min-height: 520px;
  }
}
</style>
