/** Keep the router on the current entry until a draft-discard decision is made. */
export function protectHistory(
  target: Window,
  isDirty: () => boolean,
  confirm: (proceed: () => void) => void,
  onNavigate: () => void,
) {
  const history = target.history;
  const key = "yuHistoryIndex";
  const push = history.pushState;
  const replace = history.replaceState;
  let current = Number(history.state?.[key] ?? 0);
  let restoring: (() => void) | null = null;
  let approved = false;
  replace.call(history, { ...history.state, [key]: current }, "");
  history.pushState = function (state, unused, url) {
    push.call(history, { ...state, [key]: current + 1 }, unused, url);
    current += 1;
  };
  history.replaceState = function (state, unused, url) {
    replace.call(history, { ...state, [key]: current }, unused, url);
  };
  const pop = (event: PopStateEvent) => {
    const index = event.state?.[key];
    if (typeof index !== "number") return; // Cross-document navigation uses beforeunload.
    if (restoring) {
      event.stopImmediatePropagation();
      const done = restoring;
      restoring = null;
      done();
      return;
    }
    const delta = index - current;
    if (!delta) return;
    if (approved || !isDirty()) {
      approved = false;
      current = index;
      onNavigate();
      return;
    }
    event.stopImmediatePropagation();
    // Restore first, so cancel leaves both the URL and the mounted page untouched.
    restoring = () => confirm(() => { approved = true; history.go(delta); });
    history.go(-delta);
  };
  target.addEventListener("popstate", pop, true);
  return () => {
    target.removeEventListener("popstate", pop, true);
    history.pushState = push;
    history.replaceState = replace;
  };
}
