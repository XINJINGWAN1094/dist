import {
  type LabelElement,
  type LocationElement,
  type MapDocument,
  type MapElement,
  type RegionElement,
  type RouteElement,
  type TerrainElement,
  pointsToPath,
  pointsToPolyline,
  terrainName,
} from './mapModel';

export interface ExportBundle {
  html: string;
  svg: string;
  json: string;
}

export function createExportBundle(document: MapDocument): ExportBundle {
  const normalized = normalizeForExport(document);
  const json = JSON.stringify(normalized, null, 2);
  const svg = renderMapSvg(normalized, { includeData: true });
  const html = renderMapHtml(normalized, svg, json);
  return { html, svg, json };
}

export function renderMapSvg(document: MapDocument, options: { includeData?: boolean } = {}): string {
  const sortedElements = [...document.elements].filter(element => element.visible).sort((lhs, rhs) => lhs.layer - rhs.layer);
  const titleId = `map-title-${escapeAttribute(document.meta.title).replace(/[^\w-]/g, '-').toLowerCase() || 'narrative'}`;
  const dataBlock = options.includeData
    ? `<script type="application/json" id="narrative-map-document">${escapeScriptJson(JSON.stringify(document, null, 2))}</script>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${titleId}" viewBox="0 0 ${document.canvas.width} ${document.canvas.height}" width="${document.canvas.width}" height="${document.canvas.height}" data-map-version="${document.version}">`,
    `<title id="${titleId}">${escapeHtml(document.meta.title)}</title>`,
    `<defs>${renderPatterns(document)}</defs>`,
    `<rect width="100%" height="100%" fill="${escapeAttribute(document.theme.background)}" />`,
    document.canvas.show_grid ? `<rect width="100%" height="100%" fill="url(#map-grid)" opacity="0.65" />` : '',
    `<rect x="28" y="28" width="${document.canvas.width - 56}" height="${document.canvas.height - 56}" rx="18" fill="none" stroke="${escapeAttribute(document.theme.line)}" stroke-width="3" opacity="0.55" />`,
    ...sortedElements.map(renderElement),
    renderLegend(document),
    dataBlock,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function renderMapHtml(document: MapDocument, svg: string, json: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(document.meta.title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --map-page-bg: #10131a;
      --map-shell-bg: rgba(255, 255, 255, 0.96);
      --map-text: #1f2933;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--map-text);
      background: var(--map-page-bg);
      font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    main {
      width: min(1200px, 100%);
      display: grid;
      gap: 14px;
    }
    header {
      color: #f7fafc;
      display: grid;
      gap: 4px;
    }
    h1, p { margin: 0; }
    h1 { font-size: clamp(24px, 4vw, 42px); }
    p { color: rgba(247, 250, 252, 0.72); line-height: 1.6; }
    .map-shell {
      border-radius: 18px;
      overflow: hidden;
      background: var(--map-shell-bg);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    details {
      color: rgba(247, 250, 252, 0.78);
      font-size: 13px;
    }
    pre {
      max-height: 280px;
      overflow: auto;
      padding: 12px;
      border-radius: 10px;
      color: #f8fafc;
      background: #0b0f15;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(document.meta.title)}</h1>
      ${document.meta.subtitle ? `<p>${escapeHtml(document.meta.subtitle)}</p>` : ''}
    </header>
    <section class="map-shell">
${indent(svg, 6)}
    </section>
    <details>
      <summary>MapDocument JSON（可交给 AI 编程助手继续编辑）</summary>
      <pre id="map-json">${escapeHtml(json)}</pre>
    </details>
    <script type="application/json" id="narrative-map-document">${escapeScriptJson(json)}</script>
  </main>
</body>
</html>`;
}

function renderPatterns(document: MapDocument): string {
  return `
    <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${escapeAttribute(document.theme.grid)}" stroke-width="1" opacity="0.42" />
    </pattern>
    <pattern id="terrain-forest" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M14 4 L22 22 H6 Z" fill="none" stroke="currentColor" stroke-width="2" />
    </pattern>
    <pattern id="terrain-waste" width="34" height="18" patternUnits="userSpaceOnUse">
      <path d="M2 10 C8 2 16 18 24 8 C28 4 31 6 33 9" fill="none" stroke="currentColor" stroke-width="2" />
    </pattern>
  `;
}

function renderElement(element: MapElement): string {
  switch (element.type) {
    case 'location':
      return renderLocation(element);
    case 'route':
      return renderRoute(element);
    case 'region':
      return renderRegion(element);
    case 'terrain':
      return renderTerrain(element);
    case 'label':
      return renderLabel(element);
  }
}

function renderLocation(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  const icon = renderLocationIcon(element);
  return `<g data-map-element="${escapeAttribute(element.id)}" data-type="location">
  ${icon}
  <text x="${x}" y="${y + size + 18}" fill="${escapeAttribute(element.style.label_color)}" font-size="${Math.max(13, size * 0.55)}" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="rgba(255,255,255,0.72)" stroke-width="3">${escapeHtml(element.name)}</text>
</g>`;
}

function renderLocationIcon(element: LocationElement): string {
  const { x, y } = element.position;
  const size = element.style.size;
  const color = escapeAttribute(element.style.color);
  switch (element.icon) {
    case 'city':
      return `<g fill="${color}" stroke="rgba(0,0,0,0.28)" stroke-width="2"><rect x="${x - size * 0.62}" y="${y - size * 0.36}" width="${size * 0.42}" height="${size * 0.72}" rx="2" /><rect x="${x - size * 0.12}" y="${y - size * 0.62}" width="${size * 0.46}" height="${size * 0.98}" rx="2" /><rect x="${x + size * 0.42}" y="${y - size * 0.26}" width="${size * 0.32}" height="${size * 0.62}" rx="2" /></g>`;
    case 'castle':
      return `<path d="M ${x - size * 0.78} ${y + size * 0.45} V ${y - size * 0.45} L ${x - size * 0.52} ${y - size * 0.24} L ${x - size * 0.26} ${y - size * 0.45} L ${x} ${y - size * 0.24} L ${x + size * 0.26} ${y - size * 0.45} L ${x + size * 0.52} ${y - size * 0.24} L ${x + size * 0.78} ${y - size * 0.45} V ${y + size * 0.45} Z" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="2" />`;
    case 'camp':
      return `<path d="M ${x} ${y - size * 0.82} L ${x - size * 0.72} ${y + size * 0.62} H ${x + size * 0.72} Z M ${x} ${y - size * 0.82} V ${y + size * 0.62}" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="2" />`;
    case 'port':
      return `<g fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${Math.max(3, size * 0.14)}"><path d="M ${x} ${y - size * 0.84} V ${y + size * 0.44}" /><path d="M ${x - size * 0.44} ${y - size * 0.36} H ${x + size * 0.44}" /><path d="M ${x - size * 0.62} ${y + size * 0.08} C ${x - size * 0.34} ${y + size * 0.62}, ${x + size * 0.34} ${y + size * 0.62}, ${x + size * 0.62} ${y + size * 0.08}" /></g>`;
    case 'star':
      return `<path d="${starPath(x, y, size * 0.78, size * 0.34)}" fill="${color}" stroke="rgba(0,0,0,0.24)" stroke-width="2" />`;
    case 'pin':
    default:
      return `<path d="M ${x} ${y + size * 0.88} C ${x - size * 0.72} ${y - size * 0.02}, ${x - size * 0.58} ${y - size * 0.9}, ${x} ${y - size * 0.9} C ${x + size * 0.58} ${y - size * 0.9}, ${x + size * 0.72} ${y - size * 0.02}, ${x} ${y + size * 0.88} Z" fill="${color}" stroke="rgba(0,0,0,0.28)" stroke-width="2" /><circle cx="${x}" cy="${y - size * 0.22}" r="${size * 0.24}" fill="rgba(255,255,255,0.82)" />`;
  }
}

function renderRoute(element: RouteElement): string {
  return `<polyline data-map-element="${escapeAttribute(element.id)}" data-type="route" points="${pointsToPolyline(element.points)}" fill="none" stroke="${escapeAttribute(element.style.color)}" stroke-width="${element.style.width}" stroke-linecap="round" stroke-linejoin="round" ${element.style.dash ? `stroke-dasharray="${element.style.width * 2} ${element.style.width * 1.5}"` : ''} />`;
}

function renderRegion(element: RegionElement): string {
  return `<polygon data-map-element="${escapeAttribute(element.id)}" data-type="region" points="${pointsToPolyline(element.points)}" fill="${escapeAttribute(element.style.fill)}" fill-opacity="${element.style.opacity}" stroke="${escapeAttribute(element.style.stroke)}" stroke-width="3" stroke-linejoin="round" />`;
}

function renderTerrain(element: TerrainElement): string {
  const path = pointsToPath(element.points);
  const pattern = element.terrain_type === 'forest' ? 'url(#terrain-forest)' : element.terrain_type === 'waste' ? 'url(#terrain-waste)' : 'none';
  const dash = element.terrain_type === 'border' ? `stroke-dasharray="${element.style.width * 1.6} ${element.style.width}"` : '';
  const line = `<path data-map-element="${escapeAttribute(element.id)}" data-type="terrain" data-terrain="${element.terrain_type}" d="${path}" fill="none" stroke="${escapeAttribute(element.style.color)}" stroke-width="${element.style.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${element.style.opacity}" ${dash} />`;
  if (pattern === 'none') {
    return line;
  }
  return `<g color="${escapeAttribute(element.style.color)}">${line}<path d="${path}" fill="none" stroke="${pattern}" stroke-width="${element.style.width * 1.4}" stroke-linecap="round" opacity="${Math.min(1, element.style.opacity + 0.12)}" /></g>`;
}

function renderLabel(element: LabelElement): string {
  return `<text data-map-element="${escapeAttribute(element.id)}" data-type="label" x="${element.position.x}" y="${element.position.y}" fill="${escapeAttribute(element.style.color)}" font-size="${element.style.size}" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="rgba(255,255,255,0.64)" stroke-width="4">${escapeHtml(element.name)}</text>`;
}

function renderLegend(document: MapDocument): string {
  const terrainTypes = _(document.elements)
    .filter((element): element is TerrainElement => element.type === 'terrain' && element.visible)
    .map(element => element.terrain_type)
    .uniq()
    .value();
  if (terrainTypes.length === 0) {
    return '';
  }
  const x = document.canvas.width - 230;
  const y = document.canvas.height - 54 - terrainTypes.length * 28;
  return `<g data-map-legend="terrain" font-size="15">
  <rect x="${x - 16}" y="${y - 22}" width="206" height="${terrainTypes.length * 28 + 34}" rx="12" fill="${escapeAttribute(document.theme.background)}" opacity="0.82" stroke="${escapeAttribute(document.theme.line)}" />
  ${terrainTypes
    .map((type, index) => {
      const itemY = y + index * 28;
      return `<line x1="${x}" y1="${itemY}" x2="${x + 34}" y2="${itemY}" stroke="${escapeAttribute(document.theme.terrain)}" stroke-width="7" stroke-linecap="round" /><text x="${x + 48}" y="${itemY + 5}" fill="${escapeAttribute(document.theme.text)}">${terrainName(type)}</text>`;
    })
    .join('\n  ')}
</g>`;
}

function normalizeForExport(document: MapDocument): MapDocument {
  return {
    ...document,
    elements: [...document.elements].sort((lhs, rhs) => lhs.layer - rhs.layer),
  };
}

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  });
  return `M ${points.join(' L ')} Z`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeScriptJson(value: string): string {
  return value.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');
}

function indent(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map(line => `${prefix}${line}`)
    .join('\n');
}
