const BG_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#253f6a', '#9c6447', '#2c2350'],
  ['#1f4a69', '#8b6d3e', '#1f2b4f'],
  ['#30406a', '#7a4b56', '#2a233f'],
  ['#1f3f58', '#696b42', '#20253c'],
  ['#2c335a', '#7b4d3b', '#24345a'],
  ['#22435f', '#8d5e3d', '#28274a'],
];

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function buildGradientFromName(name: string): string {
  const index = hashText(name || 'default_scene') % BG_PALETTES.length;
  const [colorA, colorB, colorC] = BG_PALETTES[index] ?? BG_PALETTES[0];
  return `linear-gradient(166deg, ${colorA} 0%, ${colorB} 36%, ${colorC} 100%)`;
}
