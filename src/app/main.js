/**
 * LAFEA + Empirical/WRC application entry.
 *
 * Two views over the same isolated LAFEA workbench kernel:
 *  - LAFEA      : local finite-element analysis workbench (default standalone stages).
 *  - EMPIRICAL  : EMP1 analytical calculation (WRC 537 / WRC 297 style local stress),
 *                 the same controller in ANALYTICAL_CALC presentation mode.
 *
 * The EMPIRICAL view opens on the plain WRC 537 calculator; the full governed EMP.1
 * workflow stays available as an advanced sub-view.
 *
 * Each view's controller is created lazily on first activation so a hidden
 * root is never laid out by the workbench.
 */
import './app.css';
import '../lafea-app/app.css';
import { LafeaStandaloneController } from '../lafea-app/standalone-controller.js';
import { mountWrcCalculator } from './wrc/wrc-panel.js';
import { mountLafeaView } from './lafea/lafea-view.js';

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
      controllers.set(target.view.id, target.view.id === 'EMPIRICAL'
        ? mountEmpiricalView(target.host)
        : mountLafeaView(target.host, { ...target.view.options }));
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

const EMPIRICAL_SUBVIEW_KEY = 'lafea-emp-app/empirical-subview';

/** Empirical view: WRC 537 calculator first, full EMP.1 workflow as an advanced sub-view. */
export function mountEmpiricalView(host) {
  const doc = host.ownerDocument;
  const options = APP_VIEWS.find((view) => view.id === 'EMPIRICAL').options;
  const tabs = doc.createElement('div');
  tabs.className = 'app-subnav';
  tabs.setAttribute('role', 'tablist');
  const calcHost = doc.createElement('div');
  calcHost.dataset.empiricalSubview = 'WRC';
  const workflowHost = doc.createElement('div');
  workflowHost.dataset.empiricalSubview = 'WORKFLOW';
  host.replaceChildren(tabs, calcHost, workflowHost);

  const calculator = mountWrcCalculator(calcHost);
  let workflow = null;
  const subviews = [
    { id: 'WRC', label: 'WRC 537 calculator', panel: calcHost },
    { id: 'WORKFLOW', label: 'Full EMP.1 workflow (advanced)', panel: workflowHost },
  ];
  const buttons = subviews.map((sub) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'app-subnav__tab';
    button.dataset.empiricalNav = sub.id;
    button.setAttribute('role', 'tab');
    button.textContent = sub.label;
    button.addEventListener('click', () => show(sub.id));
    tabs.append(button);
    return button;
  });

  function show(id) {
    const target = subviews.find((sub) => sub.id === id) ?? subviews[0];
    subviews.forEach((sub, index) => {
      const active = sub === target;
      sub.panel.hidden = !active;
      buttons[index].setAttribute('aria-selected', String(active));
    });
    if (target.id === 'WORKFLOW' && !workflow) {
      workflow = new LafeaStandaloneController(workflowHost, { ...options }).init();
    }
    try { globalThis.localStorage?.setItem(EMPIRICAL_SUBVIEW_KEY, target.id); } catch { /* storage optional */ }
    return target.id;
  }

  let initial = 'WRC';
  try { initial = globalThis.localStorage?.getItem(EMPIRICAL_SUBVIEW_KEY) ?? 'WRC'; } catch { /* storage optional */ }
  show(initial);

  return Object.freeze({
    show,
    calculator,
    getWorkflowController: () => workflow,
    destroy() {
      workflow?.destroy();
      calculator.destroy();
      host.replaceChildren();
    },
  });
}

const app = mountApp(document.getElementById('app-root'));
globalThis.LafeaEmpApp = app;

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.destroy());
}
