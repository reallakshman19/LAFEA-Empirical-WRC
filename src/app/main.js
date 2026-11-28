/**
 * LAFEA + Empirical/WRC application entry.
 *
 * Two views over the same isolated LAFEA workbench kernel, plus a status page:
 *  - LAFEA      : local finite-element analysis workbench (default standalone stages).
 *  - EMPIRICAL  : EMP1 analytical calculation (WRC 537 local stress),
 *                 the same controller in ANALYTICAL_CALC presentation mode.
 *  - STATUS     : known issues, planned improvements and the roadmap (src/app/status/).
 *
 * The EMPIRICAL view opens on the plain WRC 537 calculator; the full governed EMP.1
 * workflow stays available as an advanced sub-view.
 *
 * Each view's controller is created lazily on first activation so a hidden
 * root is never laid out by the workbench.
 *
 * Fast first load: the LAFEA workbench (standalone controller, about 1.9 MB) and the LAFEA view
 * are fetched with a cached dynamic import() the first time the LAFEA tab or the
 * "Full EMP.1 workflow (advanced)" sub-tab opens. The WRC calculator stays in the first load.
 * scripts/bundle-size-check.mjs keeps the first-load JS under 500 kB.
 */
import './theme.css';
import './app.css';
import '../lafea-app/app.css';
import { mountWrcCalculator } from './wrc/wrc-panel.js';
import { mountStatusView } from './status/status-panel.js';
import { markSelectedTab, wireTabKeys } from './ui-tabs.js';
import { createTechSwitch } from './lafea/tech-details.js';

const APP_TITLE = 'LAFEA + Empirical/WRC';

let lafeaModulesPromise = null;

/** Loads the LAFEA workbench modules once; a failed load is forgotten so it can be retried. */
export function loadLafeaModules() {
  lafeaModulesPromise ??= Promise.all([
    import('../lafea-app/standalone-controller.js'),
    import('./lafea/lafea-view.js'),
  ]).then(([controllerModule, viewModule]) => Object.freeze({
    LafeaStandaloneController: controllerModule.LafeaStandaloneController,
    mountLafeaView: viewModule.mountLafeaView,
  })).catch((error) => {
    lafeaModulesPromise = null;
    throw error;
  });
  return lafeaModulesPromise;
}

function isShown(element) {
  for (let node = element; node; node = node.parentElement) {
    if (node.hidden) return false;
  }
  return element.isConnected;
}

/**
 * Shows "Loading LAFEA…" in `host`, loads the LAFEA modules, then calls `mount(modules)` once the
 * host is visible (so the workbench never lays out inside a hidden root). `refresh()` retries the
 * mount after the host becomes visible. `whenReady()` resolves with the mounted instance.
 */
function deferLafeaMount(host, mount) {
  const doc = host.ownerDocument;
  let modules = null;
  let instance = null;
  let destroyed = false;
  let waiters = [];

  function settle(method, value) {
    const pending = waiters;
    waiters = [];
    for (const waiter of pending) waiter[method](value);
  }

  function tryMount() {
    if (destroyed || instance || !modules || !isShown(host)) return;
    // The EMP.1 workbench adds itself to the host, so take the loading message out first.
    host.querySelector(':scope > [data-role="lafea-loading"]')?.remove();
    try {
      instance = mount(modules);
      settle('resolve', instance);
    } catch (error) {
      showError(error);
    }
  }

  function showError(error) {
    const box = doc.createElement('div');
    box.className = 'app-loading app-loading--error';
    box.dataset.role = 'lafea-loading';
    box.setAttribute('role', 'alert');
    const text = doc.createElement('p');
    text.textContent = `Could not load LAFEA: ${error?.message ?? error}. Check the connection, then try again or reload the page.`;
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', start);
    box.append(text, retry);
    host.replaceChildren(box);
    settle('reject', error);
  }

  function start() {
    const loading = doc.createElement('p');
    loading.className = 'app-loading';
    loading.dataset.role = 'lafea-loading';
    loading.setAttribute('role', 'status');
    loading.textContent = 'Loading LAFEA…';
    host.replaceChildren(loading);
    loadLafeaModules().then((loaded) => {
      modules = loaded;
      tryMount();
    }, (error) => {
      if (!destroyed) showError(error);
    });
  }

  start();

  return Object.freeze({
    refresh: tryMount,
    getInstance: () => instance,
    whenReady() {
      if (instance) return Promise.resolve(instance);
      if (destroyed) return Promise.reject(new Error('The view was destroyed.'));
      return new Promise((resolve, reject) => { waiters.push({ resolve, reject }); });
    },
    destroy() {
      destroyed = true;
      instance?.destroy();
      instance = null;
      settle('reject', new Error('The view was destroyed.'));
      host.replaceChildren();
    },
  });
}

/**
 * LAFEA tab: the workbench and example bar, mounted after the lazy load.
 * The example methods are async because they wait for the load.
 */
function mountLazyLafeaView(host, options) {
  const deferred = deferLafeaMount(host, ({ mountLafeaView }) => mountLafeaView(host, options));
  return Object.freeze({
    whenReady: () => deferred.whenReady(),
    refresh: deferred.refresh,
    isLoaded: () => deferred.getInstance() !== null,
    getController: () => deferred.getInstance()?.getController() ?? null,
    loadExample: async () => (await deferred.whenReady()).loadExample(),
    solveExample: async () => (await deferred.whenReady()).solveExample(),
    /** Build the plate form's model (optionally from new raw form values). */
    loadPlate: async (raw) => (await deferred.whenReady()).loadPlate(raw),
    solvePlate: async () => (await deferred.whenReady()).solvePlate(),
    getPlateInput: async () => (await deferred.whenReady()).getPlateInput(),
    getState: async () => (await deferred.whenReady()).getState(),
    destroy: deferred.destroy,
  });
}

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
  Object.freeze({
    id: 'STATUS',
    label: 'Status & roadmap',
    title: 'Known issues, planned improvements and the future roadmap',
    options: Object.freeze({}),
  }),
]);

const VIEW_MOUNTERS = Object.freeze({
  EMPIRICAL: (host) => mountEmpiricalView(host),
  STATUS: (host) => mountStatusView(host),
});

const STORAGE_KEY = 'lafea-emp-app/active-view';

export function mountApp(root) {
  if (!root) throw new TypeError('App root is required.');
  const doc = root.ownerDocument;
  const controllers = new Map();

  // Keyboard users can jump past the tabs to the open view.
  const skip = doc.createElement('a');
  skip.className = 'app-skip';
  skip.href = '#';
  skip.textContent = 'Skip to content';
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    entries.find((entry) => !entry.host.hidden)?.host.focus();
  });

  const nav = doc.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Application');
  const brand = doc.createElement('span');
  brand.className = 'app-nav__brand';
  brand.textContent = APP_TITLE;
  const tablist = doc.createElement('div');
  tablist.className = 'app-nav__tabs';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Application views');
  nav.append(brand, tablist);

  const views = doc.createElement('div');
  views.className = 'app-views';
  root.replaceChildren(skip, nav, views);

  // Each view is a tab (Left/Right between them, Enter to open) and a link: #LAFEA, #EMPIRICAL, #STATUS.
  const entries = APP_VIEWS.map((view) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'app-nav__tab';
    button.id = `app-tab-${view.id}`;
    button.dataset.appNav = view.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `app-view-${view.id}`);
    button.title = view.title;
    button.textContent = view.label;
    button.addEventListener('click', () => activate(view.id));
    tablist.append(button);

    const host = doc.createElement('main');
    host.className = 'app-view';
    host.id = `app-view-${view.id}`;
    host.dataset.appView = view.id;
    host.setAttribute('aria-labelledby', button.id);
    host.tabIndex = -1;
    host.hidden = true;
    views.append(host);
    return { view, button, host };
  });
  wireTabKeys(tablist, () => entries.map((entry) => entry.button));

  function activate(viewId) {
    const target = entries.find((entry) => entry.view.id === viewId) ?? entries[0];
    for (const entry of entries) entry.host.hidden = entry !== target;
    markSelectedTab(entries.map((entry) => entry.button), target.button);
    doc.title = `${target.view.label} · ${APP_TITLE}`;
    if (hashView() !== target.view.id) {
      try { globalThis.history?.replaceState(null, '', `#${target.view.id}`); } catch { /* address bar optional */ }
    }
    if (!controllers.has(target.view.id)) {
      const mount = VIEW_MOUNTERS[target.view.id];
      controllers.set(target.view.id, mount
        ? mount(target.host)
        : mountLazyLafeaView(target.host, { ...target.view.options }));
    } else {
      // A lazy mount that finished loading while its view was hidden mounts now.
      controllers.get(target.view.id).refresh?.();
    }
    try { globalThis.localStorage?.setItem(STORAGE_KEY, target.view.id); } catch { /* storage optional */ }
    return target.view.id;
  }

  let initial = null;
  try { initial = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null; } catch { /* storage optional */ }
  activate(hashView() ?? initial);

  // A link or the address bar can switch views without a reload.
  const onHashChange = () => {
    const id = hashView();
    if (id && entries.find((entry) => entry.view.id === id)?.host.hidden) activate(id);
  };
  globalThis.addEventListener?.('hashchange', onHashChange);

  return Object.freeze({
    activate,
    getController: (viewId) => controllers.get(viewId) ?? null,
    /** Resolves when the view's lazy-loaded part (if any) has mounted. */
    whenReady: async (viewId) => {
      const controller = controllers.get(viewId) ?? null;
      if (controller?.whenReady) await controller.whenReady();
      return controller;
    },
    getActiveViewId: () => entries.find((e) => !e.host.hidden)?.view.id ?? null,
    destroy() {
      globalThis.removeEventListener?.('hashchange', onHashChange);
      for (const controller of controllers.values()) controller.destroy();
      controllers.clear();
      root.replaceChildren();
    },
  });
}

/** The view named by the address bar's #fragment (any case), or null. */
function hashView() {
  const id = (globalThis.location?.hash ?? '').replace(/^#/, '').toUpperCase();
  return APP_VIEWS.some((view) => view.id === id) ? id : null;
}

const EMPIRICAL_SUBVIEW_KEY = 'lafea-emp-app/empirical-subview';

/** Empirical view: WRC 537 calculator first, full EMP.1 workflow as an advanced sub-view. */
export function mountEmpiricalView(host) {
  const doc = host.ownerDocument;
  const options = APP_VIEWS.find((view) => view.id === 'EMPIRICAL').options;
  const tabs = doc.createElement('div');
  tabs.className = 'app-subnav';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Empirical views');
  const calcHost = doc.createElement('div');
  calcHost.dataset.empiricalSubview = 'WRC';
  // The workflow panel: the "Technical details" switch, then the EMP.1 workbench (mounted on first use).
  const workflowPanel = doc.createElement('div');
  workflowPanel.dataset.empiricalSubview = 'WORKFLOW';
  const techBar = doc.createElement('div');
  techBar.className = 'app-techbar';
  techBar.append(createTechSwitch(doc));
  const workflowHost = doc.createElement('div');
  workflowPanel.append(techBar, workflowHost);
  host.replaceChildren(tabs, calcHost, workflowPanel);

  const calculator = mountWrcCalculator(calcHost);
  let workflow = null;
  const subviews = [
    { id: 'WRC', label: 'WRC 537 calculator', panel: calcHost },
    { id: 'WORKFLOW', label: 'Full EMP.1 workflow (advanced)', panel: workflowPanel },
  ];
  const buttons = subviews.map((sub) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'app-subnav__tab';
    button.id = `empirical-tab-${sub.id}`;
    button.dataset.empiricalNav = sub.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `empirical-panel-${sub.id}`);
    button.textContent = sub.label;
    button.addEventListener('click', () => show(sub.id));
    tabs.append(button);
    sub.panel.id = `empirical-panel-${sub.id}`;
    sub.panel.setAttribute('role', 'tabpanel');
    sub.panel.setAttribute('aria-labelledby', button.id);
    return button;
  });
  wireTabKeys(tabs, () => buttons);

  function show(id) {
    const target = subviews.find((sub) => sub.id === id) ?? subviews[0];
    subviews.forEach((sub) => { sub.panel.hidden = sub !== target; });
    markSelectedTab(buttons, buttons[subviews.indexOf(target)]);
    if (target.id === 'WORKFLOW') {
      workflow ??= deferLafeaMount(workflowHost,
        ({ LafeaStandaloneController }) => new LafeaStandaloneController(workflowHost, { ...options }).init());
      workflow.refresh();
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
    /** The EMP.1 workbench controller, or null until the advanced sub-tab has loaded and mounted. */
    getWorkflowController: () => workflow?.getInstance() ?? null,
    /** Resolves with the EMP.1 workbench controller (opens nothing by itself). */
    whenWorkflowReady: () => (workflow ? workflow.whenReady() : Promise.resolve(null)),
    refresh: () => workflow?.refresh(),
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
