<template>
  <div
    v-if="isVisible && hasAnchor"
    class="magic-circle-effect"
    :class="{ active: isActive }"
    :style="effectStyle"
    aria-hidden="true"
  >
    <div class="magic-circle-fallback">
      <span class="magic-circle-ring ring-outer"></span>
      <span class="magic-circle-ring ring-middle"></span>
      <span class="magic-circle-ring ring-inner"></span>
      <span class="magic-circle-star star-one"></span>
      <span class="magic-circle-star star-two"></span>
      <span class="magic-circle-cross"></span>
    </div>
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

type MagicCircleAnchor = {
  x: number;
  y: number;
  size: number;
};

type MagicCircleRendererHandle = {
  start: () => void;
  destroy: () => void;
};

type RenderTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
};

const MAGIC_CIRCLE_TEXTURE_URL = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/168886/tex-magicCircle-01.png';
const FADE_OUT_DURATION_MS = 5_000;
const BRIGHTEN_DURATION_MS = 1_200;

const props = defineProps<{
  active: boolean;
  anchor: MagicCircleAnchor | null;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isVisible = ref(false);
const transitionDurationMs = ref(BRIGHTEN_DURATION_MS);

let hideTimer: number | null = null;
let renderer: MagicCircleRendererHandle | null = null;

const hasAnchor = computed(() => props.anchor !== null);
const isActive = computed(() => props.active && hasAnchor.value);
const effectStyle = computed<Record<string, string>>(() => {
  if (!props.anchor) {
    return {
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      '--magic-circle-transition-ms': `${transitionDurationMs.value}ms`,
    };
  }

  return {
    left: `${props.anchor.x}px`,
    top: `${props.anchor.y}px`,
    width: `${props.anchor.size}px`,
    height: `${props.anchor.size}px`,
    '--magic-circle-transition-ms': `${transitionDurationMs.value}ms`,
  };
});

watch(
  () => props.active,
  active => {
    if (active) {
      void showCircle();
      return;
    }
    hideCircle();
  },
  { immediate: true },
);

watch(
  () => props.anchor,
  anchor => {
    if (props.active && anchor) {
      void showCircle();
    }
  },
);

onBeforeUnmount(() => {
  clearHideTimer();
  destroyRenderer();
});

async function showCircle() {
  clearHideTimer();
  transitionDurationMs.value = BRIGHTEN_DURATION_MS;
  isVisible.value = true;
  await nextTick();
  startRenderer();
}

function hideCircle() {
  clearHideTimer();
  transitionDurationMs.value = FADE_OUT_DURATION_MS;

  if (!isVisible.value) {
    destroyRenderer();
    return;
  }

  hideTimer = window.setTimeout(() => {
    hideTimer = null;
    if (props.active) {
      return;
    }
    isVisible.value = false;
    destroyRenderer();
  }, FADE_OUT_DURATION_MS);
}

function startRenderer() {
  if (!canvasRef.value) {
    return;
  }
  try {
    if (!renderer) {
      renderer = createMagicCircleRenderer(canvasRef.value);
    }
    renderer.start();
  } catch (error) {
    console.warn('[MagicCircleEffect] WebGL renderer failed; CSS fallback remains visible.', error);
    destroyRenderer();
  }
}

function destroyRenderer() {
  renderer?.destroy();
  renderer = null;
}

function clearHideTimer() {
  if (hideTimer === null) {
    return;
  }
  window.clearTimeout(hideTimer);
  hideTimer = null;
}

function createMagicCircleRenderer(canvas: HTMLCanvasElement): MagicCircleRendererHandle {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    console.warn('[MagicCircleEffect] WebGL is unavailable; magic circle rendering was skipped.');
    return {
      start: () => undefined,
      destroy: () => undefined,
    };
  }

  return new WebglMagicCircleRenderer(canvas, gl);
}

class WebglMagicCircleRenderer implements MagicCircleRendererHandle {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly frameProgram: WebGLProgram;
  private readonly feedbackProgram: WebGLProgram;
  private readonly highlightProgram: WebGLProgram;
  private readonly patternTexture: WebGLTexture;
  private frameTarget: RenderTarget | null = null;
  private feedbackTargets: [RenderTarget, RenderTarget] | null = null;
  private feedbackReadIndex = 0;
  private animationFrame: number | null = null;
  private running = false;
  private destroyed = false;
  private width = 0;
  private height = 0;
  private startTime = performance.now();

  constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.vertexBuffer = requireResource(gl.createBuffer(), 'vertex buffer');
    this.frameProgram = createProgram(gl, MAGIC_VERTEX_SHADER, MAGIC_FRAME_FRAGMENT_SHADER);
    this.feedbackProgram = createProgram(gl, MAGIC_VERTEX_SHADER, MAGIC_FEEDBACK_FRAGMENT_SHADER);
    this.highlightProgram = createProgram(gl, MAGIC_VERTEX_SHADER, MAGIC_HIGHLIGHT_FRAGMENT_SHADER);
    this.patternTexture = requireResource(gl.createTexture(), 'pattern texture');

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.uploadPatternSource(createFallbackPatternTextureSource());
    this.loadPatternTexture();
  }

  start() {
    if (this.destroyed || this.running) {
      return;
    }
    this.running = true;
    this.startTime = performance.now();
    this.animationFrame = window.requestAnimationFrame(this.renderFrame);
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.running = false;
    this.destroyed = true;
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.deleteTarget(this.frameTarget);
    this.frameTarget = null;
    if (this.feedbackTargets) {
      this.deleteTarget(this.feedbackTargets[0]);
      this.deleteTarget(this.feedbackTargets[1]);
      this.feedbackTargets = null;
    }

    const gl = this.gl;
    gl.deleteTexture(this.patternTexture);
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteProgram(this.frameProgram);
    gl.deleteProgram(this.feedbackProgram);
    gl.deleteProgram(this.highlightProgram);
  }

  private readonly renderFrame = (timestamp: number) => {
    if (!this.running || this.destroyed) {
      return;
    }

    this.resizeIfNeeded();
    if (this.frameTarget && this.feedbackTargets) {
      const elapsedSeconds = (timestamp - this.startTime) / 1000;
      this.drawFramePass(elapsedSeconds);
      this.drawFeedbackPass(elapsedSeconds);
      this.drawHighlightPass();
    }

    this.animationFrame = window.requestAnimationFrame(this.renderFrame);
  };

  private resizeIfNeeded() {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.max(2, Math.round(rect.width * pixelRatio));
    const nextHeight = Math.max(2, Math.round(rect.height * pixelRatio));

    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;

    this.deleteTarget(this.frameTarget);
    if (this.feedbackTargets) {
      this.deleteTarget(this.feedbackTargets[0]);
      this.deleteTarget(this.feedbackTargets[1]);
    }

    this.frameTarget = this.createRenderTarget(nextWidth, nextHeight);
    this.feedbackTargets = [this.createRenderTarget(nextWidth, nextHeight), this.createRenderTarget(nextWidth, nextHeight)];
    this.feedbackReadIndex = 0;
  }

  private drawFramePass(elapsedSeconds: number) {
    const gl = this.gl;
    if (!this.frameTarget) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameTarget.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.frameProgram);
    this.bindQuad(this.frameProgram);

    gl.uniform2f(gl.getUniformLocation(this.frameProgram, 'resolution'), this.width, this.height);
    gl.uniform1f(gl.getUniformLocation(this.frameProgram, 'time'), elapsedSeconds);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.patternTexture);
    gl.uniform1i(gl.getUniformLocation(this.frameProgram, 'txImage'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawFeedbackPass(elapsedSeconds: number) {
    const gl = this.gl;
    if (!this.frameTarget || !this.feedbackTargets) {
      return;
    }

    const feedbackRead = this.feedbackTargets[this.feedbackReadIndex];
    const feedbackWrite = this.feedbackTargets[1 - this.feedbackReadIndex];

    gl.bindFramebuffer(gl.FRAMEBUFFER, feedbackWrite.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.feedbackProgram);
    this.bindQuad(this.feedbackProgram);

    gl.uniform1f(gl.getUniformLocation(this.feedbackProgram, 'time'), elapsedSeconds);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, feedbackRead.texture);
    gl.uniform1i(gl.getUniformLocation(this.feedbackProgram, 'txFeedback'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTarget.texture);
    gl.uniform1i(gl.getUniformLocation(this.feedbackProgram, 'txFrame'), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.feedbackReadIndex = 1 - this.feedbackReadIndex;
  }

  private drawHighlightPass() {
    const gl = this.gl;
    if (!this.frameTarget || !this.feedbackTargets) {
      return;
    }

    const feedbackRead = this.feedbackTargets[this.feedbackReadIndex];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.highlightProgram);
    this.bindQuad(this.highlightProgram);

    gl.uniform2f(gl.getUniformLocation(this.highlightProgram, 'resolution'), this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, feedbackRead.texture);
    gl.uniform1i(gl.getUniformLocation(this.highlightProgram, 'txFeedback'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTarget.texture);
    gl.uniform1i(gl.getUniformLocation(this.highlightProgram, 'txFrame'), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private bindQuad(program: WebGLProgram) {
    const gl = this.gl;
    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  }

  private createRenderTarget(width: number, height: number): RenderTarget {
    const gl = this.gl;
    const texture = requireResource(gl.createTexture(), 'render texture');
    const framebuffer = requireResource(gl.createFramebuffer(), 'render framebuffer');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('[MagicCircleEffect] Failed to create a complete WebGL framebuffer.');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture, framebuffer };
  }

  private deleteTarget(target: RenderTarget | null) {
    if (!target) {
      return;
    }
    this.gl.deleteTexture(target.texture);
    this.gl.deleteFramebuffer(target.framebuffer);
  }

  private loadPatternTexture() {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (this.destroyed) {
        return;
      }
      this.uploadPatternSource(image);
    };
    image.onerror = () => {
      console.warn('[MagicCircleEffect] Remote magic circle texture failed to load; using the generated fallback pattern.');
    };
    image.src = MAGIC_CIRCLE_TEXTURE_URL;
  }

  private uploadPatternSource(source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.patternTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
}

function requireResource<T>(resource: T | null, name: string): T {
  if (!resource) {
    throw new Error(`[MagicCircleEffect] Failed to create ${name}.`);
  }
  return resource;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = requireResource(gl.createProgram(), 'shader program');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown program link error.';
    gl.deleteProgram(program);
    throw new Error(`[MagicCircleEffect] ${message}`);
  }

  return program;
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = requireResource(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error.';
    gl.deleteShader(shader);
    throw new Error(`[MagicCircleEffect] ${message}`);
  }

  return shader;
}

function createFallbackPatternTextureSource(): HTMLCanvasElement {
  const source = document.createElement('canvas');
  source.width = 512;
  source.height = 512;
  const context = source.getContext('2d');
  if (!context) {
    return source;
  }

  context.clearRect(0, 0, source.width, source.height);
  context.translate(256, 256);
  context.strokeStyle = '#ffffff';
  context.fillStyle = '#ffffff';
  context.lineCap = 'round';
  context.lineJoin = 'round';

  drawCircle(context, 0, 0, 214, 4);
  drawCircle(context, 0, 0, 178, 2);
  drawCircle(context, 0, 0, 126, 2);
  drawCircle(context, 0, 0, 74, 2);

  for (let index = 0; index < 32; index += 1) {
    const angle = (Math.PI * 2 * index) / 32;
    const inner = 146;
    const outer = index % 2 === 0 ? 166 : 158;
    context.beginPath();
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    context.stroke();
  }

  for (let index = 0; index < 3; index += 1) {
    drawTriangle(context, 168, (Math.PI * 2 * index) / 3);
  }

  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    context.save();
    context.rotate(angle);
    context.fillRect(86, -3, 22, 6);
    context.restore();
  }

  return source;
}

function drawCircle(context: CanvasRenderingContext2D, x: number, y: number, radius: number, width: number) {
  context.lineWidth = width;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
}

function drawTriangle(context: CanvasRenderingContext2D, radius: number, rotation: number) {
  context.save();
  context.rotate(rotation);
  context.lineWidth = 3;
  context.beginPath();
  for (let index = 0; index < 3; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 3;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
      continue;
    }
    context.lineTo(x, y);
  }
  context.closePath();
  context.stroke();
  context.restore();
}

const MAGIC_VERTEX_SHADER = `
precision mediump float;
attribute vec2 position;
varying vec2 uv;

void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const MAGIC_FRAME_FRAGMENT_SHADER = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform sampler2D txImage;
varying vec2 uv;

mat2 rot2d(float theta) {
  return mat2(
    cos(theta), -sin(theta),
    sin(theta), cos(theta)
  );
}

mat2 scale2d(float scale) {
  return mat2(
    scale, 0.0,
    0.0, scale
  );
}

void main() {
  vec2 initial = uv;
  initial.x = 0.5 - (initial.x - 0.5) * resolution.x / max(resolution.y, 1.0);

  vec4 col = vec4(
    clamp(initial.x * 1.3, 0.0, 1.0),
    clamp(initial.y * 1.3, 0.0, 1.0),
    0.75,
    1.0
  );

  vec2 pos = scale2d(1.3 - 0.1 * pow(abs(sin(time * 2.0)), 8.0)) * (initial - 0.5);
  float outer = texture2D(txImage, pos + 0.5).g;
  float text = texture2D(txImage, rot2d(-0.2 * time) * pos + 0.5).r;

  float timescale = time + 0.4 * sin(exp(cos(time * 0.5)) * 2.0);
  float tri1 = texture2D(txImage, rot2d(1.0 * timescale) * pos + 0.5).b;
  float tri2 = texture2D(txImage, rot2d(2.0 * timescale) * pos + 0.5).b;
  float tri3 = texture2D(txImage, rot2d(3.0 * timescale) * pos + 0.5).b;
  float mask = clamp(text + 0.7 * outer + tri1 + tri2 + tri3, 0.0, 1.0);

  gl_FragColor = vec4(col.rgb * mask, mask);
}
`;

const MAGIC_FEEDBACK_FRAGMENT_SHADER = `
precision mediump float;
uniform float time;
uniform sampler2D txFeedback;
uniform sampler2D txFrame;
varying vec2 uv;

void main() {
  vec2 distortPos = uv + 0.01 * sin(time) * vec2(0.5 - uv.y, uv.x - 0.5) - 0.01 * (uv - 0.5);
  vec3 feedback = 0.76 * texture2D(txFeedback, distortPos).rgb;
  vec3 frame = texture2D(txFrame, uv).rgb;
  vec3 color = vec3(
    max(feedback.r, frame.r),
    max(feedback.g, frame.g),
    max(feedback.b, frame.b)
  );
  float alpha = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

const MAGIC_HIGHLIGHT_FRAGMENT_SHADER = `
precision mediump float;
uniform vec2 resolution;
uniform sampler2D txFeedback;
uniform sampler2D txFrame;
varying vec2 uv;

vec4 blur9(sampler2D image, vec2 sampleUv, vec2 sampleResolution, vec2 direction) {
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(1.3846153846) * direction;
  vec2 off2 = vec2(3.2307692308) * direction;
  color += texture2D(image, sampleUv) * 0.2270270270;
  color += texture2D(image, sampleUv + (off1 / sampleResolution)) * 0.3162162162;
  color += texture2D(image, sampleUv - (off1 / sampleResolution)) * 0.3162162162;
  color += texture2D(image, sampleUv + (off2 / sampleResolution)) * 0.0702702703;
  color += texture2D(image, sampleUv - (off2 / sampleResolution)) * 0.0702702703;
  return color;
}

void main() {
  vec3 feedback = texture2D(txFeedback, uv).rgb;
  vec3 blurred = blur9(txFrame, uv, max(resolution, vec2(1.0)), vec2(0.0, 1.0)).rgb;
  vec4 frame = texture2D(txFrame, uv);
  vec3 color = vec3(
    1.6 * feedback.r - (1.3 * blurred.r * (1.0 - frame.a)) + 2.7 * frame.r * frame.a,
    1.6 * feedback.g - (1.3 * blurred.g * (1.0 - frame.a)) + 2.7 * frame.g * frame.a,
    1.6 * feedback.b - (1.3 * blurred.b * (1.0 - frame.a)) + 2.7 * frame.b * frame.a
  );
  color = max(color, vec3(0.0));
  float alpha = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;
</script>

<style scoped>
.magic-circle-effect {
  position: absolute;
  z-index: 24;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -50%) scaleY(0.76);
  transform-origin: center;
  mix-blend-mode: screen;
  filter: drop-shadow(0 0 12px rgba(112, 245, 255, 0.72)) drop-shadow(0 0 28px rgba(255, 91, 205, 0.58));
  transition: opacity var(--magic-circle-transition-ms) ease;
  will-change: opacity, left, top;
}

.magic-circle-effect.active {
  opacity: 1;
}

.magic-circle-effect canvas {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: block;
}

.magic-circle-fallback,
.magic-circle-ring,
.magic-circle-star,
.magic-circle-cross {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.magic-circle-fallback {
  z-index: 1;
  background:
    radial-gradient(circle, rgba(255, 255, 255, 0.5) 0 2%, rgba(120, 245, 255, 0.24) 3% 9%, transparent 18%),
    radial-gradient(circle, transparent 36%, rgba(255, 98, 214, 0.34) 37% 38%, transparent 39%),
    radial-gradient(circle, transparent 54%, rgba(108, 245, 255, 0.42) 55% 56%, transparent 57%),
    radial-gradient(circle, rgba(55, 240, 255, 0.08), transparent 68%);
  animation: magicFallbackPulse 2200ms ease-in-out infinite;
}

.magic-circle-ring {
  border: 1px solid rgba(122, 246, 255, 0.78);
  box-shadow:
    0 0 10px rgba(108, 245, 255, 0.52),
    inset 0 0 12px rgba(255, 90, 210, 0.24);
}

.ring-outer {
  inset: 8%;
  animation: magicFallbackRotate 12s linear infinite;
}

.ring-middle {
  inset: 22%;
  border-color: rgba(255, 110, 215, 0.68);
  animation: magicFallbackRotate 8s linear infinite reverse;
}

.ring-inner {
  inset: 36%;
  border-color: rgba(255, 255, 255, 0.72);
  animation: magicFallbackRotate 5.5s linear infinite;
}

.magic-circle-star {
  inset: 18%;
  border-radius: 0;
  opacity: 0.84;
}

.magic-circle-star::before,
.magic-circle-star::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 62%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(140, 248, 255, 0.88), transparent);
  transform-origin: center;
}

.magic-circle-star::before {
  transform: translate(-50%, -50%) rotate(0deg);
}

.magic-circle-star::after {
  transform: translate(-50%, -50%) rotate(60deg);
}

.star-one {
  animation: magicFallbackRotate 10s linear infinite;
}

.star-two {
  transform: rotate(30deg);
  animation: magicFallbackRotate 14s linear infinite reverse;
}

.magic-circle-cross {
  inset: 30%;
  border-radius: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.72);
  border-bottom: 1px solid rgba(255, 255, 255, 0.72);
  transform: rotate(45deg);
  animation: magicFallbackGlow 1800ms ease-in-out infinite alternate;
}

@keyframes magicFallbackRotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes magicFallbackPulse {
  0%,
  100% {
    filter: brightness(0.95);
    transform: scale(0.98);
  }
  50% {
    filter: brightness(1.35);
    transform: scale(1.03);
  }
}

@keyframes magicFallbackGlow {
  from {
    opacity: 0.36;
  }
  to {
    opacity: 0.9;
  }
}
</style>
