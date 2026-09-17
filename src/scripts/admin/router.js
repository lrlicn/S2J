// ============================================
// Hash 路由：admin 视图状态的唯一事实来源
// 路由表：
//   #/home            首页（功能入口）
//   #/posts           文章管理列表
//   #/edit/new        新建文章（编辑器）
//   #/edit/<slug>     编辑指定文章（slug 形如 category/filename，已 encodeURIComponent）
// 所有按钮只允许调用 navigate() 改变视图，禁止在业务代码里自行 pushState。
// ============================================

const EDIT_PREFIX = '/edit/';

export function parseHash(hash) {
  const path = (hash || '').replace(/^#/, '') || '/home';
  if (path === '/home') return { name: 'home', path };
  if (path === '/posts') return { name: 'posts', path };
  if (path === '/edit/new') return { name: 'editor', mode: 'new', path };
  if (path.startsWith(EDIT_PREFIX)) {
    const raw = path.slice(EDIT_PREFIX.length);
    if (!raw) return { name: 'unknown', path };
    try {
      return { name: 'editor', mode: 'edit', slug: decodeURIComponent(raw), path };
    } catch {
      return { name: 'unknown', path };
    }
  }
  return { name: 'unknown', path };
}

export function createRouter() {
  const listeners = new Set();
  let current = parseHash(window.location.hash);
  // 进入编辑器前所在的非编辑器路由，用于关闭编辑器时返回
  let editorReturnRoute = '/posts';
  // 本次会话内通过 navigate() 压入的历史条数（用于判断能否 history.back）
  let sessionPushes = 0;

  function dispatch(route) {
    const previous = current;
    current = route;
    if (route.name === 'editor' && previous.name !== 'editor') {
      editorReturnRoute = previous.name === 'home' ? '/home' : '/posts';
    }
    listeners.forEach((fn) => fn(route, previous));
  }

  function onHashChange() {
    const route = parseHash(window.location.hash);
    if (route.name === 'unknown') {
      // 非法路由（手动改地址栏 / 外部错误链接）：替换为首页，不污染历史
      window.history.replaceState(null, '', '#/home');
      dispatch(parseHash('#/home'));
      return;
    }
    dispatch(route);
  }

  return {
    /** 启动路由：绑定 hashchange，并对当前 URL 做一次分发 */
    start() {
      window.addEventListener('hashchange', onHashChange);
      if (current.name === 'unknown') {
        window.history.replaceState(null, '', '#/home');
        current = parseHash('#/home');
      }
      dispatch(current);
    },

    /**
     * 跳转路由
     * @param {string} path 目标路径（不含 #）
     * @param {{replace?: boolean}} [opts] replace=true 时替换当前历史项并立即分发
     */
    navigate(path, opts = {}) {
      const target = parseHash(path.startsWith('/') ? path : `/${path}`);
      if (target.name === 'unknown') return;
      if (target.path === current.path) return;
      if (opts.replace) {
        window.history.replaceState(null, '', `#${target.path}`);
        dispatch(target);
      } else {
        sessionPushes += 1;
        window.location.hash = target.path; // 触发 hashchange → dispatch
      }
    },

    /** 仅替换地址栏 URL，不触发视图分发（用于保存草稿后把 /edit/new 同步成真实 slug） */
    replaceUrl(path) {
      const normalized = path.startsWith('/') ? path : `/${path}`;
      window.history.replaceState(null, '', `#${normalized}`);
      current = parseHash(normalized);
    },

    /**
     * 关闭编辑器：
     * 内部点击进入（有历史）时走浏览器后退，前进/后退行为符合直觉；
     * 深链直接进入（无历史）时替换到来源路由或列表页。
     */
    exitEditor() {
      if (sessionPushes > 0) {
        window.history.back();
      } else {
        this.navigate(editorReturnRoute, { replace: true });
      }
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    get route() {
      return current;
    },

    get returnRoute() {
      return editorReturnRoute;
    },
  };
}
