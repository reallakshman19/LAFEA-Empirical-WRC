/**
 * Keyboard support for a row of tabs (WAI-ARIA tabs pattern, manual activation).
 *
 * Only the selected tab is in the Tab order. Left/Right move the focus between tabs and Home/End go
 * to the ends; Enter or Space opens the focused tab (they click the button). Manual activation,
 * because opening the LAFEA tab or the advanced workflow loads the large workbench.
 */
export function wireTabKeys(tablist, getTabs) {
  tablist.addEventListener('keydown', (event) => {
    const tabs = getTabs();
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const last = tabs.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].focus();
  });
}

/** Marks `active` as the selected tab: aria-selected, and the only tab in the Tab order. */
export function markSelectedTab(tabs, active) {
  for (const tab of tabs) {
    const selected = tab === active;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}
