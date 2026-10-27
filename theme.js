// Loaded before the stylesheet to restore the theme before the first paint.
(() => {
  const key = 'daylight-theme';
  const themes = Object.freeze([
    {id:'leaf', name:'青叶', description:'自然的绿意，清爽明亮'},
    {id:'iris', name:'鸢尾', description:'柔和的紫色，安静从容'},
    {id:'night', name:'深夜', description:'沉静的蓝灰，适合夜间'}
  ].map(theme => Object.freeze(theme)));
  let current = 'leaf';
  function apply(id, persist = false) {
    current = themes.some(theme => theme.id === id) ? id : 'leaf';
    document.documentElement.dataset.theme = current;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
      {leaf:'#f6f8f5', iris:'#f7f6fb', night:'#151e28'}[current]);
    let saved = true;
    if (persist) {
      try { localStorage.setItem(key, current); } catch { saved = false; }
    }
    return saved;
  }
  try { current = localStorage.getItem(key) || 'leaf'; } catch {}
  apply(current);
  window.daylightTheme = Object.freeze({themes, apply, get current() { return current; }});
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      apply(event.newValue);
      window.dispatchEvent(new Event('daylight-theme-change'));
    }
  });
})();
