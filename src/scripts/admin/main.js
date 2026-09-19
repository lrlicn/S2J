// ============================================
// Admin 后台入口：装配路由与各功能模块。
// 数据流单向：URL hash → router 分发 → 视图 / 编辑器开关。
// 所有按钮只改 URL（router.navigate），业务代码不再自行 pushState。
// ============================================

import { createRouter } from './router.js';
import { initTheme } from './theme.js';
import { showToast } from './toast.js';
import { initPosts } from './posts.js';
import { initEditor } from './editor.js';
import { initImport } from './import.js';
import { initGithub } from './github.js';

const router = createRouter();

initTheme();
const posts = initPosts({ router });
const editor = initEditor({ router, refreshPosts: posts.load });
const importer = initImport({ router });
initGithub(router);

const homeEl = document.getElementById('admin-home');
const managementEl = document.getElementById('admin-management');

function showBaseView(name) {
  homeEl.classList.toggle('hidden', name !== 'home');
  managementEl.classList.toggle('hidden', name !== 'posts');
  window.scrollTo(0, 0);
}

// ---------- 路由 → 视图 ----------
router.subscribe((route) => {
  if (route.name === 'home') {
    editor.hide();
    showBaseView('home');
  } else if (route.name === 'posts') {
    editor.hide();
    showBaseView('posts');
    posts.load(); // 进入列表刷新
  } else if (route.name === 'editor') {
    // 编辑器为全屏覆盖层；底层视图保持现状即可
    if (route.mode === 'new') {
      editor.openNew();
    } else {
      editor.openEdit(route.slug);
    }
  }
});

// ---------- 静态导航按钮（只负责改 URL） ----------
document.getElementById('home-new-post').addEventListener('click', () => {
  router.navigate('/edit/new');
});
document.getElementById('home-manage').addEventListener('click', () => {
  router.navigate('/posts');
});
document.getElementById('home-import').addEventListener('click', () => {
  importer.open();
});
document.getElementById('btn-back-home').addEventListener('click', () => {
  router.navigate('/home');
});
document.getElementById('btn-new-post').addEventListener('click', () => {
  router.navigate('/edit/new');
});
document.getElementById('btn-import').addEventListener('click', () => {
  importer.open();
});

// ---------- 启动 ----------
// 初始路由不是列表时，后台预加载文章列表，保证进入列表时更快
if (router.route.name !== 'posts') {
  posts.load();
}
router.start();

// 首次路由分发完成（视图已就位）后移除启动遮罩
requestAnimationFrame(() => {
  document.getElementById('admin-boot')?.remove();
});
