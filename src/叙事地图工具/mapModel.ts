import { uuidv4 } from '@util/common';

export const MAP_STORAGE_KEY = 'tavern-narrative-map-tool.document.v1';

export const POINT_SCHEMA = z.object({
  x: z.number(),
  y: z.number(),
});

export const MAP_THEME_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  background: z.string(),
  grid: z.string(),
  water: z.string(),
  land: z.string(),
  line: z.string(),
  route: z.string(),
  region: z.string(),
  location: z.string(),
  text: z.string(),
  terrain: z.string(),
});

const BASE_ELEMENT_SCHEMA = z.object({
  id: z.string(),
  type: z.enum(['location', 'route', 'region', 'terrain', 'label']),
  name: z.string(),
  note: z.string().default(''),
  layer: z.number().int().default(1),
  visible: z.boolean().default(true),
});

export const LOCATION_ELEMENT_SCHEMA = BASE_ELEMENT_SCHEMA.extend({
  type: z.literal('location'),
  position: POINT_SCHEMA,
  icon: z.enum(['pin', 'city', 'castle', 'camp', 'port', 'star']).default('pin'),
  style: z.object({
    color: z.string(),
    label_color: z.string(),
    size: z.number().min(8).max(80),
  }),
});

export const ROUTE_ELEMENT_SCHEMA = BASE_ELEMENT_SCHEMA.extend({
  type: z.literal('route'),
  points: z.array(POINT_SCHEMA).min(2),
  style: z.object({
    color: z.string(),
    width: z.number().min(1).max(40),
    dash: z.boolean().default(false),
  }),
});

export const REGION_ELEMENT_SCHEMA = BASE_ELEMENT_SCHEMA.extend({
  type: z.literal('region'),
  points: z.array(POINT_SCHEMA).min(3),
  style: z.object({
    fill: z.string(),
    stroke: z.string(),
    opacity: z.number().min(0).max(1),
  }),
});

export const TERRAIN_ELEMENT_SCHEMA = BASE_ELEMENT_SCHEMA.extend({
  type: z.literal('terrain'),
  terrain_type: z.enum(['mountain', 'forest', 'water', 'waste', 'border', 'road']),
  points: z.array(POINT_SCHEMA).min(2),
  style: z.object({
    color: z.string(),
    width: z.number().min(1).max(80),
    opacity: z.number().min(0).max(1),
  }),
});

export const LABEL_ELEMENT_SCHEMA = BASE_ELEMENT_SCHEMA.extend({
  type: z.literal('label'),
  position: POINT_SCHEMA,
  style: z.object({
    color: z.string(),
    size: z.number().min(8).max(80),
  }),
});

export const MAP_ELEMENT_SCHEMA = z.discriminatedUnion('type', [
  LOCATION_ELEMENT_SCHEMA,
  ROUTE_ELEMENT_SCHEMA,
  REGION_ELEMENT_SCHEMA,
  TERRAIN_ELEMENT_SCHEMA,
  LABEL_ELEMENT_SCHEMA,
]);

export const MAP_DOCUMENT_SCHEMA = z.object({
  version: z.literal(1),
  meta: z.object({
    title: z.string(),
    subtitle: z.string(),
    author: z.string(),
  }),
  canvas: z.object({
    width: z.number().min(320).max(4000),
    height: z.number().min(240).max(4000),
    show_grid: z.boolean(),
  }),
  theme: MAP_THEME_SCHEMA,
  elements: z.array(MAP_ELEMENT_SCHEMA),
  created_at: z.string(),
  updated_at: z.string(),
});

export type MapPoint = z.infer<typeof POINT_SCHEMA>;
export type MapTheme = z.infer<typeof MAP_THEME_SCHEMA>;
export type LocationElement = z.infer<typeof LOCATION_ELEMENT_SCHEMA>;
export type RouteElement = z.infer<typeof ROUTE_ELEMENT_SCHEMA>;
export type RegionElement = z.infer<typeof REGION_ELEMENT_SCHEMA>;
export type TerrainElement = z.infer<typeof TERRAIN_ELEMENT_SCHEMA>;
export type LabelElement = z.infer<typeof LABEL_ELEMENT_SCHEMA>;
export type MapElement = z.infer<typeof MAP_ELEMENT_SCHEMA>;
export type MapDocument = z.infer<typeof MAP_DOCUMENT_SCHEMA>;
export type TerrainType = TerrainElement['terrain_type'];

export const THEME_PRESETS: MapTheme[] = [
  {
    id: 'old_parchment',
    name: '古地图',
    background: '#f0dfb6',
    grid: '#c7a66e',
    water: '#88aeb8',
    land: '#e6cf95',
    line: '#5c4525',
    route: '#8b4f2f',
    region: '#c58b43',
    location: '#7a2f26',
    text: '#2d2418',
    terrain: '#6d6437',
  },
  {
    id: 'dark_fantasy',
    name: '暗色幻想',
    background: '#151821',
    grid: '#293041',
    water: '#236178',
    land: '#232733',
    line: '#b7c2d0',
    route: '#e9b44c',
    region: '#7a5cff',
    location: '#ff6b7a',
    text: '#f5f0e8',
    terrain: '#7dd181',
  },
  {
    id: 'clear_atlas',
    name: '清爽区域图',
    background: '#eff7f4',
    grid: '#bdd8cf',
    water: '#6bb7d6',
    land: '#d9ead5',
    line: '#345c67',
    route: '#df7b45',
    region: '#72a96b',
    location: '#226f8f',
    text: '#1d2f35',
    terrain: '#5e8f57',
  },
  {
    id: 'neon_slate',
    name: '赛博地图',
    background: '#11151b',
    grid: '#263342',
    water: '#25c9d7',
    land: '#18222b',
    line: '#d8f8ff',
    route: '#ffca3a',
    region: '#00f5a0',
    location: '#ff3d9a',
    text: '#f2fbff',
    terrain: '#56f0ff',
  },
];

export function cloneDocument<T>(document: T): T {
  return klona(document);
}

export function createDefaultDocument(): MapDocument {
  const now = new Date().toISOString();
  const theme = cloneDocument(THEME_PRESETS[0]);
  return {
    version: 1,
    meta: {
      title: '未命名叙事地图',
      subtitle: '区域、路线与地点草稿',
      author: '',
    },
    canvas: {
      width: 1400,
      height: 900,
      show_grid: true,
    },
    theme,
    elements: [
      {
        id: uuidv4(),
        type: 'region',
        name: '中央地区',
        note: '',
        layer: 1,
        visible: true,
        points: [
          { x: 360, y: 260 },
          { x: 780, y: 190 },
          { x: 1060, y: 430 },
          { x: 930, y: 700 },
          { x: 430, y: 660 },
          { x: 250, y: 440 },
        ],
        style: {
          fill: '#c58b43',
          stroke: '#5c4525',
          opacity: 0.22,
        },
      },
      {
        id: uuidv4(),
        type: 'location',
        name: '起始城镇',
        note: '故事开始的地点。',
        layer: 5,
        visible: true,
        position: { x: 530, y: 450 },
        icon: 'city',
        style: {
          color: '#7a2f26',
          label_color: '#2d2418',
          size: 28,
        },
      },
      {
        id: uuidv4(),
        type: 'label',
        name: '在这里标注地图标题',
        note: '',
        layer: 8,
        visible: true,
        position: { x: 700, y: 120 },
        style: {
          color: '#2d2418',
          size: 30,
        },
      },
    ],
    created_at: now,
    updated_at: now,
  };
}

export function parseMapDocument(input: unknown): MapDocument {
  const parsed = MAP_DOCUMENT_SCHEMA.parse(input);
  return {
    ...parsed,
    elements: [...parsed.elements].sort((lhs, rhs) => lhs.layer - rhs.layer),
  };
}

export function withUpdatedTimestamp(document: MapDocument): MapDocument {
  return {
    ...document,
    updated_at: new Date().toISOString(),
  };
}

export function makeLocation(theme: MapTheme, point: MapPoint): LocationElement {
  return {
    id: uuidv4(),
    type: 'location',
    name: '新地点',
    note: '',
    layer: 5,
    visible: true,
    position: point,
    icon: 'pin',
    style: {
      color: theme.location,
      label_color: theme.text,
      size: 24,
    },
  };
}

export function makeLabel(theme: MapTheme, point: MapPoint): LabelElement {
  return {
    id: uuidv4(),
    type: 'label',
    name: '新标签',
    note: '',
    layer: 6,
    visible: true,
    position: point,
    style: {
      color: theme.text,
      size: 22,
    },
  };
}

export function makeRoute(theme: MapTheme, points: MapPoint[]): RouteElement {
  return {
    id: uuidv4(),
    type: 'route',
    name: '新路线',
    note: '',
    layer: 3,
    visible: true,
    points,
    style: {
      color: theme.route,
      width: 5,
      dash: false,
    },
  };
}

export function makeRegion(theme: MapTheme, points: MapPoint[]): RegionElement {
  return {
    id: uuidv4(),
    type: 'region',
    name: '新区域',
    note: '',
    layer: 1,
    visible: true,
    points,
    style: {
      fill: theme.region,
      stroke: theme.line,
      opacity: 0.25,
    },
  };
}

export function makeTerrain(theme: MapTheme, terrain_type: TerrainType, points: MapPoint[]): TerrainElement {
  return {
    id: uuidv4(),
    type: 'terrain',
    name: terrainName(terrain_type),
    note: '',
    layer: 2,
    visible: true,
    terrain_type,
    points,
    style: {
      color: terrain_type === 'water' ? theme.water : terrain_type === 'road' ? theme.route : theme.terrain,
      width: terrain_type === 'border' ? 4 : terrain_type === 'road' ? 8 : 18,
      opacity: terrain_type === 'water' ? 0.55 : 0.75,
    },
  };
}

export function terrainName(type: TerrainType): string {
  const names: Record<TerrainType, string> = {
    mountain: '山脉',
    forest: '森林',
    water: '水域',
    waste: '荒地',
    border: '边界',
    road: '道路纹理',
  };
  return names[type];
}

export function pointsToPolyline(points: MapPoint[]): string {
  return points.map(point => `${round(point.x)},${round(point.y)}`).join(' ');
}

export function pointsToPath(points: MapPoint[]): string {
  if (points.length === 0) {
    return '';
  }
  const [first, ...rest] = points;
  return [`M ${round(first.x)} ${round(first.y)}`, ...rest.map(point => `L ${round(point.x)} ${round(point.y)}`)].join(' ');
}

export function pointDistance(lhs: MapPoint, rhs: MapPoint): number {
  return Math.hypot(lhs.x - rhs.x, lhs.y - rhs.y);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
