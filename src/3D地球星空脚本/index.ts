import { createScriptIdIframe } from '@util/script';
import earthPageHtml from './earth-page.html';

const PAGE_SCOPE = '.thCosmicEarthHost';
const FRAME_ID = 'th-cosmic-earth-frame';
const LAUNCHER_ID = 'th-cosmic-earth-launcher';

type MountTarget = {
  doc: Document;
  source: 'current' | 'parent' | 'top' | 'fallback';
};

function getViewportArea(targetWindow: Window, targetDocument: Document) {
  const width = targetWindow.innerWidth || targetDocument.documentElement?.clientWidth || targetDocument.body?.clientWidth || 0;
  const height =
    targetWindow.innerHeight || targetDocument.documentElement?.clientHeight || targetDocument.body?.clientHeight || 0;
  return width * height;
}

function resolveMountDocument(): MountTarget {
  const candidates: Array<{ win: Window | null | undefined; source: MountTarget['source'] }> = [
    // When script runs inside an iframe, parent/top is usually the actual visible host page.
    { win: window.parent, source: 'parent' },
    { win: window.top, source: 'top' },
    { win: window, source: 'current' },
  ];

  let best: MountTarget | null = null;
  let bestArea = -1;

  for (const candidate of candidates) {
    try {
      const candidateWindow = candidate.win;
      const candidateDocument = candidateWindow?.document;
      if (!candidateWindow || !candidateDocument?.body) {
        continue;
      }

      if (candidate.source === 'current' && window.parent !== window) {
        // In iframe runtime, force current to be a last-resort fallback.
        continue;
      }

      const area = getViewportArea(candidateWindow, candidateDocument);
      if (area > bestArea) {
        bestArea = area;
        best = { doc: candidateDocument, source: candidate.source };
      }
    } catch (_error) {
      // Ignore cross-origin access failure and fallback to the next candidate.
    }
  }

  return best ?? { doc: document, source: 'fallback' };
}

function mountCosmicEarthHost() {
  const mountTarget = resolveMountDocument();
  const mountDocument = mountTarget.doc;
  const $mountDocument = $(mountDocument);
  const $mountBody = $(mountDocument.body);

  console.info(`[3D地球星空脚本] 挂载目标: ${mountTarget.source}`);

  $(`#${FRAME_ID}, #${LAUNCHER_ID}`, mountDocument).remove();

  let visible = false;
  let $frame: JQuery<HTMLIFrameElement> | null = null;

  const updateLauncherText = () => {
    $launcher.text(visible ? '关闭3D地球' : '打开3D地球');
  };

  const mountFrame = () => {
    if ($frame) {
      return;
    }

    const $nextFrame = createScriptIdIframe()
      .attr({
        id: FRAME_ID,
        title: '3D地球星空页面',
      })
      .css({
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        border: '0',
        zIndex: '2147483001',
        display: 'block',
        background: '#000',
      })
      .appendTo($mountBody);

    $nextFrame.on(`load${PAGE_SCOPE}`, () => {
      console.info('[3D地球星空脚本] 已打开 3D 地球页面。');
    });

    $nextFrame.attr('srcdoc', earthPageHtml);
    $frame = $nextFrame;
  };

  const unmountFrame = () => {
    if (!$frame) {
      return;
    }
    $frame.off(PAGE_SCOPE);
    $frame.remove();
    $frame = null;
    console.info('[3D地球星空脚本] 已关闭 3D 地球页面。');
  };

  const setVisible = (nextVisible: boolean) => {
    if (nextVisible) {
      mountFrame();
    } else {
      unmountFrame();
    }
    visible = nextVisible;
    updateLauncherText();
  };

  const $launcher = $('<button>')
    .attr({
      id: LAUNCHER_ID,
      type: 'button',
      script_id: getScriptId(),
      title: '打开或关闭 3D 地球星空页面',
    })
    .css({
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483002',
      border: '1px solid rgba(124, 217, 255, 0.72)',
      borderRadius: '999px',
      padding: '8px 14px',
      fontSize: '13px',
      letterSpacing: '0.04em',
      color: '#dff6ff',
      background: 'linear-gradient(150deg, rgba(20, 74, 124, 0.95) 0%, rgba(8, 37, 72, 0.95) 100%)',
      boxShadow: '0 10px 22px rgba(0, 0, 0, 0.35), 0 0 14px rgba(84, 198, 255, 0.25)',
      cursor: 'pointer',
    })
    .appendTo($mountBody);

  $launcher.on(`click${PAGE_SCOPE}`, () => {
    setVisible(!visible);
  });

  $mountDocument.on(`keydown${PAGE_SCOPE}`, event => {
    if (event.key === 'Escape' && visible) {
      setVisible(false);
    }
  });

  setVisible(true);

  $(window).on(`pagehide${PAGE_SCOPE}`, () => {
    setVisible(false);
    $launcher.off(PAGE_SCOPE);
    $launcher.remove();
    $mountDocument.off(PAGE_SCOPE);
    $(window).off(PAGE_SCOPE);
  });
}

$(() => {
  errorCatched(mountCosmicEarthHost)();
});
