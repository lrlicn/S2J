// 明/暗主题切换。首屏 class 由 index.astro 的内联脚本提前设置以防闪烁，
// 这里只负责绑定两个视图里的切换按钮。

export function initTheme() {
  function toggle() {
    const isDark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }

  ['home-theme-toggle', 'theme-toggle'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', toggle);
  });
}
