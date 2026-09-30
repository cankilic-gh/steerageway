import './ui/styles.css';
import { App } from './app';
import { attachDevtools } from './devtools';

const params = new URLSearchParams(window.location.search);
const testMode = params.get('test') === '1';
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const supportsWebGL2 = (() => {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
})();

if (!supportsWebGL2) {
  uiRoot.innerHTML =
    '<div class="screen"><div class="panel dialog"><h2>WebGL 2 is required</h2><p>Steerageway needs a browser with WebGL 2: current Chrome, Edge, Firefox or Safari on a desktop computer. Check that hardware acceleration is enabled.</p></div></div>';
} else {
  const app = new App(canvas, uiRoot, {
    testMode,
    autopilot: testMode && params.get('autopilot') === '1',
    timeScale: testMode ? Math.max(0.25, Math.min(8, Number(params.get('speed') ?? '1') || 1)) : 1,
  });
  if (testMode) attachDevtools(app);
  void app.init();
}
