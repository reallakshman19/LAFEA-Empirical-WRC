/**
 * Web Worker: runs the shell-FE cross-check off the main thread. A round attachment uses the nozzle
 * model (nozzle-shell.js), a rectangular one the lug model (lug-shell.js).
 */
import { crossCheckWrc537 } from './nozzle-shell.js';
import { crossCheckWrc537Rectangular } from './lug-shell.js';

self.onmessage = (event) => {
  try {
    const { wrcResult, options = {} } = event.data;
    const result = wrcResult?.geometry?.rectangular
      ? crossCheckWrc537Rectangular(wrcResult, options)
      : crossCheckWrc537(wrcResult, options);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message ?? error) });
  }
};
