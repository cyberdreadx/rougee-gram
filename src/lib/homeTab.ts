/** Which Home tab opens by default. Set from Settings, or remembered as you
 *  switch tabs. Discover leads unless you choose otherwise. */
export type HomeTab = "following" | "discover";

const HOME_TAB_KEY = "rougee:home-tab";

export function getHomeTab(): HomeTab {
  try {
    const v = localStorage.getItem(HOME_TAB_KEY);
    if (v === "following" || v === "discover") return v;
  } catch {
    /* localStorage unavailable */
  }
  return "discover";
}

export function setHomeTab(tab: HomeTab): void {
  try {
    localStorage.setItem(HOME_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}
