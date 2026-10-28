import { SETTINGS_SECTIONS, type SettingsSectionId } from './settings-sections';

/**
 * A link back into Settings at one tab: this page's address with
 * `?settings=<tab>`, which the editor reads once on load, opens Settings at,
 * and then takes off the address. Used as the way back from Polar's portal.
 */
export const SETTINGS_PARAM = 'settings';

export function settingsAddress(section: SettingsSectionId): string {
  const here = new URL(window.location.href);
  here.searchParams.set(SETTINGS_PARAM, section);
  return here.toString();
}

/** The tab this page was opened at, once, taking it off the address. */
export function takeSettingsLink(): SettingsSectionId | null {
  const here = new URL(window.location.href);
  const asked = here.searchParams.get(SETTINGS_PARAM);
  if (asked === null) return null;
  here.searchParams.delete(SETTINGS_PARAM);
  window.history.replaceState(window.history.state, '', here.href);
  return SETTINGS_SECTIONS.find((section) => section.id === asked)?.id ?? null;
}
