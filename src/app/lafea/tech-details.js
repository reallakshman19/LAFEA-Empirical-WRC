/**
 * "Technical details" switch for the LAFEA workbench and the advanced EMP.1 workflow (roadmap PL-06).
 *
 * Off (the default), the app hides the workbench's custody, authority and identity text: internal
 * codes, JSON paths, "governed checks" lists, hashes and formula identities. On, everything shows where
 * the workbench puts it. The choice is remembered and shared by both views. Only the app hides
 * anything (workbench.css, under .app-view): the original lafea.html page is unchanged.
 */
const TECH_KEY = 'lafea-emp-app/tech-details';
const OFF_CLASS = 'app-tech-off';

export function techDetailsShown() {
  try { return globalThis.localStorage?.getItem(TECH_KEY) === 'on'; } catch { return false; }
}

/** Apply the choice to the page and every switch on it. */
export function setTechDetails(doc, shown) {
  doc.documentElement.classList.toggle(OFF_CLASS, !shown);
  for (const box of doc.querySelectorAll('[data-tech-switch]')) box.checked = shown;
  try { globalThis.localStorage?.setItem(TECH_KEY, shown ? 'on' : 'off'); } catch { /* storage optional */ }
}

/** A labelled checkbox that turns the technical details on or off. */
export function createTechSwitch(doc) {
  const label = doc.createElement('label');
  label.className = 'app-techswitch';
  label.title = 'Show the workbench\'s internal codes, JSON paths, custody and qualification records';
  const box = doc.createElement('input');
  box.type = 'checkbox';
  box.dataset.techSwitch = '';
  box.checked = techDetailsShown();
  box.addEventListener('change', () => setTechDetails(doc, box.checked));
  label.append(box, ' Technical details');
  doc.documentElement.classList.toggle(OFF_CLASS, !box.checked);
  return label;
}
