/**
 * LAFEA + Empirical/WRC application entry.
 *
 * Two views over the same isolated LAFEA workbench kernel:
 *  - LAFEA      : local finite-element analysis workbench (default standalone stages).
 *  - EMPIRICAL  : EMP1 analytical calculation (WRC 537 / WRC 297 style local stress),
 *                 the same controller in ANALYTICAL_CALC presentation mode.
 *
 * Each view's controller is created lazily on first activation so a hidden
 * root is never laid out by the workbench.
 */
import './app.css';
import '../lafea-app/app.css';
import { LafeaStandaloneController } from '../lafea-app/standalone-controller.js';

export const APP_VIEWS = Object.freeze([
  Object.freeze({
    id: 'LAFEA',
    label: 'LAFEA',
    title: 'Local Finite Element Analysis',
    // Same as the original combined app's LAFEA tab: open on the first FE stage.
    options: Object.freeze({ initialStage: 'LAFEA.3' }),
  }),
  Object.freeze({
    id: 'EMPIRICAL',
    label: 'Empirical / WRC',
    title: 'Empirical calculation (EMP1 / WRC local stress)',
    options: Object.freeze({
      presentationMode: 'ANALYTICAL_CALC',
      analyticalOnly: true,
      initialStage: 'LAFEA.1',
    }),
  }),
]);

const STORAGE_KEY = 'lafea-emp-app/active-view';

export function mountApp(root) {
  if (!root) throw new TypeError('App root is required.');
  const doc = root.ownerDocument;
  const controllers = new Map();

  const nav = doc.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Application views');
  const brand = doc.createElement('span');
  brand.className = 'app-nav__brand';
  brand.textContent = 'LAFEA + Empirical/WRC';
  nav.append(brand);

  const views = doc.createElement('div');
  views.className = 'app-views';
  root.replaceChildren(nav, views);

  const entries = APP_VIEWS.map((view) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'app-nav__tab';
    button.dataset.appNav = view.id;
    button.title = view.title;
    button.textContent = view.label;
    button.addEventListener('click', () => activate(view.id));
    nav.append(button);

    const host = doc.createElement('main');
    host.className = 'app-view';
    host.dataset.appView = view.id;
    host.hidden = true;
    views.append(host);
    return { view, button, host };
  });

  function activate(viewId) {
    const target = entries.find((entry) => entry.view.id === viewId) ?? entries[0];
    for (const entry of entries) {
      const active = entry === target;
      entry.host.hidden = !active;
      entry.button.setAttribute('aria-pressed', String(active));
    }
    if (!controllers.has(target.view.id)) {
      controllers.set(
        target.view.id,
        new LafeaStandaloneController(target.host, { ...target.view.options }).init(),
      );
    }
    try { globalThis.localStorage?.setItem(STORAGE_KEY, target.view.id); } catch { /* storage optional */ }
    return target.view.id;
  }

  let initial = null;
  try { initial = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null; } catch { /* storage optional */ }
  const fromHash = (globalThis.location?.hash ?? '').replace(/^#/, '').toUpperCase();
  activate(APP_VIEWS.some((v) => v.id === fromHash) ? fromHash : initial);

  return Object.freeze({
    activate,
    getController: (viewId) => controllers.get(viewId) ?? null,
    getActiveViewId: () => entries.find((e) => !e.host.hidden)?.view.id ?? null,
    destroy() {
      for (const controller of controllers.values()) controller.destroy();
      controllers.clear();
      root.replaceChildren();
    },
  });
}

const app = mountApp(document.getElementById('app-root'));
globalThis.LafeaEmpApp = app;

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.destroy());
}
