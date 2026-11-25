/** Web Worker: runs the shell-FE nozzle cross-check off the main thread. */
import { crossCheckWrc537 } from './nozzle-shell.js';

self.onmessage = (event) => {
  try {
    self.postMessage({ ok: true, result: crossCheckWrc537(event.data.wrcResult, event.data.options ?? {}) });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message ?? error) });
  }
};
