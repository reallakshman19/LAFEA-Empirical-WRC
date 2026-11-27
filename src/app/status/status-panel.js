/**
 * "Status & roadmap" tab: renders src/app/status/status-content.js.
 * Text is set with textContent only; nothing is parsed as HTML.
 */
import './status.css';
import {
  DECISIONS_MADE, KNOWN_ISSUES, OPEN_DECISIONS, PLANNED_IMPROVEMENTS, ROADMAP, SEVERITIES, STATUS_STATES, STATUS_TODAY,
  STATUS_UPDATED, STATUS_VISION,
} from './status-content.js';

const SECTIONS = Object.freeze([
  { id: 'vision', label: 'Vision' },
  { id: 'today', label: 'Today' },
  { id: 'issues', label: `Known issues (${KNOWN_ISSUES.length})` },
  { id: 'planned', label: `Improvements planned (${PLANNED_IMPROVEMENTS.length})` },
  { id: 'roadmap', label: 'Future roadmap' },
  { id: 'decisions', label: 'Decisions' },
]);
const SIZE_TEXT = Object.freeze({ S: 'S · under ½ day', M: 'M · 1–2 days', L: 'L · 3+ days' });
const ALL = 'ALL';

export function mountStatusView(host) {
  const doc = host.ownerDocument;
  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const root = el('div', 'status');
  root.dataset.role = 'status-root';

  // Header and in-page navigation
  const header = el('header', 'status__header');
  header.append(el('h1', 'status__title', 'Status & roadmap'),
    el('p', 'status__meta', `Updated ${STATUS_UPDATED}. Known issues, the improvements planned next, and where the app is going.`));
  const toc = el('nav', 'status__toc');
  toc.setAttribute('aria-label', 'Sections on this page');
  for (const section of SECTIONS) {
    const button = el('button', 'status__toc-link', section.label);
    button.type = 'button';
    button.dataset.statusJump = section.id;
    // Scroll to the section and move the focus to its heading, so keyboard and screen-reader users land there too.
    button.addEventListener('click', () => {
      root.querySelector(`[data-status-section='${section.id}']`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      root.querySelector(`#status-h-${section.id}`)?.focus({ preventScroll: true });
    });
    toc.append(button);
  }
  header.append(toc);
  root.append(header);

  const section = (id, title, intro) => {
    const node = el('section', 'status__section');
    node.dataset.statusSection = id;
    node.setAttribute('aria-labelledby', `status-h-${id}`);
    const heading = el('h2', 'status__h2', title);
    heading.id = `status-h-${id}`;
    heading.tabIndex = -1;
    node.append(heading);
    if (intro) node.append(el('p', 'status__intro', intro));
    root.append(node);
    return node;
  };

  // Vision
  const vision = section('vision', STATUS_VISION.title, STATUS_VISION.summary);
  const pillars = el('div', 'status__pillars');
  for (const pillar of STATUS_VISION.pillars) {
    const card = el('article', 'status__card status__pillar');
    card.dataset.pillar = pillar.id;
    card.append(el('h3', 'status__h3', pillar.title), el('p', '', pillar.text));
    pillars.append(card);
  }
  vision.append(pillars);

  // Today
  const today = section('today', 'What works today');
  const todayTable = el('table', 'status__table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const label of ['Area', 'State', 'What you can do']) headRow.append(el('th', '', label));
  thead.append(headRow);
  const tbody = el('tbody');
  for (const row of STATUS_TODAY) {
    const tr = el('tr');
    const state = el('span', `status__badge status__badge--${row.state.toLowerCase()}`, STATUS_STATES[row.state]);
    const stateCell = el('td');
    stateCell.append(state);
    tr.append(el('th', '', row.area), stateCell, el('td', '', row.text));
    tbody.append(tr);
  }
  todayTable.append(thead, tbody);
  today.append(todayTable);

  // Known issues, with an area filter
  const issues = section('issues', '1. Known issues',
    'Each issue says what happens, what to do today, and where the fix stands. Severity is for an engineer using the result.');
  const counts = Object.keys(SEVERITIES).map((s) => `${KNOWN_ISSUES.filter((i) => i.severity === s).length} ${SEVERITIES[s].toLowerCase()}`);
  issues.append(el('p', 'status__counts', counts.join(' · ')));
  const areas = [ALL, ...new Set(KNOWN_ISSUES.map((i) => i.area))];
  const filter = el('div', 'status__filter');
  filter.setAttribute('role', 'group');
  filter.setAttribute('aria-label', 'Filter issues by area');
  const list = el('div', 'status__list');
  const cards = KNOWN_ISSUES.map((item) => {
    const card = el('article', `status__card status__issue status__issue--${item.severity.toLowerCase()}`);
    card.dataset.issueId = item.id;
    card.dataset.area = item.area;
    const head = el('div', 'status__card-head');
    head.append(el('span', 'status__id', item.id),
      el('span', `status__badge status__badge--${item.severity.toLowerCase()}`, SEVERITIES[item.severity]),
      el('span', 'status__area', item.area));
    const dl = el('dl', 'status__dl');
    for (const [label, text] of [['What happens', item.what], ['What to do today', item.workaround], ['Status', item.status]]) {
      dl.append(el('dt', '', label), el('dd', '', text));
    }
    card.append(head, el('h3', 'status__h3', item.title), dl);
    list.append(card);
    return card;
  });
  const filterButtons = areas.map((area) => {
    const n = area === ALL ? KNOWN_ISSUES.length : KNOWN_ISSUES.filter((i) => i.area === area).length;
    const button = el('button', 'status__chip', `${area === ALL ? 'All' : area} (${n})`);
    button.type = 'button';
    button.dataset.issueFilter = area;
    button.addEventListener('click', () => applyFilter(area));
    filter.append(button);
    return button;
  });
  function applyFilter(area) {
    for (const card of cards) card.hidden = area !== ALL && card.dataset.area !== area;
    for (const button of filterButtons) button.setAttribute('aria-pressed', String(button.dataset.issueFilter === area));
  }
  applyFilter(ALL);
  issues.append(filter, list);

  // Planned improvements
  const planned = section('planned', '2. Improvements planned',
    'Next in line, before the larger roadmap. Sizes: S under ½ day, M 1–2 days, L 3+ days.');
  const plannedList = el('div', 'status__list');
  for (const item of PLANNED_IMPROVEMENTS) {
    const card = el('article', 'status__card');
    card.dataset.planId = item.id;
    const head = el('div', 'status__card-head');
    head.append(el('span', 'status__id', item.id), el('span', 'status__badge status__badge--size', SIZE_TEXT[item.size]),
      el('span', 'status__area', `Needs: ${item.needs}`));
    const ul = el('ul', 'status__ul');
    for (const text of item.items) ul.append(el('li', '', text));
    card.append(head, el('h3', 'status__h3', item.title), el('p', 'status__why', item.why), ul);
    plannedList.append(card);
  }
  planned.append(plannedList);

  // Roadmap
  const roadmap = section('roadmap', '3. Future roadmap',
    'Toward the universal canvas and an empirical solver that works like a light FE app. Stages build on each other: A, then B, with C and D alongside.');
  const timeline = el('ol', 'status__timeline');
  for (const item of ROADMAP) {
    const li = el('li', 'status__stage');
    li.dataset.stageId = item.id;
    const head = el('div', 'status__card-head');
    head.append(el('span', 'status__stage-mark', item.id), el('span', 'status__badge status__badge--size', SIZE_TEXT[item.size]));
    const ul = el('ul', 'status__ul');
    for (const text of item.items) ul.append(el('li', '', text));
    li.append(head, el('h3', 'status__h3', `Stage ${item.id}: ${item.title}`), el('p', 'status__why', item.goal), ul,
      el('p', 'status__note', item.note));
    timeline.append(li);
  }
  roadmap.append(timeline);

  // Decisions
  const decisions = section('decisions', 'Decisions');
  decisions.append(el('h3', 'status__h3', 'Needed from you'));
  const decisionList = el('ul', 'status__ul status__decisions');
  decisionList.dataset.role = 'decisions-open';
  for (const text of OPEN_DECISIONS) decisionList.append(el('li', '', text));
  decisions.append(decisionList, el('h3', 'status__h3', 'Already decided'));
  const madeList = el('ul', 'status__ul status__decisions');
  madeList.dataset.role = 'decisions-made';
  for (const text of DECISIONS_MADE) madeList.append(el('li', '', text));
  decisions.append(madeList);

  host.replaceChildren(root);

  return Object.freeze({
    filterIssues: applyFilter,
    destroy() { host.replaceChildren(); },
  });
}
