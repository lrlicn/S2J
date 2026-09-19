// ============================================
// 文章列表：加载、筛选、搜索、分页、删除、（在新标签页）预览
// 编辑 / 新建一律通过 router 导航，由路由驱动编辑器，不再直接调用编辑器方法。
// ============================================

import { api } from './api.js';
import { store } from './store.js';
import { showToast } from './toast.js';
import { CATEGORY_NAMES, PAGE_SIZE, PREVIEW_STORAGE_KEY } from './config.js';
import { openPushModal } from './push-modal.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 格式化日期：今天/昨天/本周星期/月日
function formatDate(dateStr) {
  if (!dateStr) return '-';
  // 纯日期 "YYYY-MM-DD" 按本地午夜解析（否则会被当 UTC，北京时间显示成 08:00）
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const timeStr = `${hour}:${minute}`;

  if (date.toDateString() === today.toDateString()) return `今天 ${timeStr}`;
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${timeStr}`;

  const dayOfWeek = (today.getDay() + 6) % 7; // 周一=0
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  if (date >= weekStart && date < weekEnd) {
    const weekDays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    return `${weekDays[(date.getDay() + 6) % 7]} ${timeStr}`;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (date.getFullYear() === today.getFullYear()) return `${month}月${day}日 ${timeStr}`;
  return `${date.getFullYear()}年${month}月${day}日 ${timeStr}`;
}

export function initPosts({ router }) {
  const postList = document.getElementById('post-list');
  const pagination = document.getElementById('pagination');
  const pageNumbers = document.getElementById('page-numbers');
  const pageNext = document.getElementById('page-next');
  const jumpInput = document.getElementById('page-jump-input');
  const jumpBtn = document.getElementById('page-jump-btn');
  const searchInput = document.getElementById('filter-search');
  let pushModeBar = null;
  let pushSelectAll = null;
  let pushSelectedCount = null;
  let pushCancelBtn = null;
  let pushConfirmBtn = null;

  // 动态创建推送操作栏
  function createPushBar() {
    if (pushModeBar) return;
    pushModeBar = document.createElement('div');
    pushModeBar.id = 'push-mode-bar';
    pushModeBar.className = 'hidden mb-4 p-4 bg-brand-50 dark:bg-brand-900/20 rounded-xl flex items-center justify-between';
    pushModeBar.innerHTML = `
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input id="push-select-all" type="checkbox" class="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500" />
          <span class="text-sm font-medium text-slate-700 dark:text-slate-200">全选本页</span>
        </label>
        <span id="push-selected-count" class="text-sm text-slate-500 dark:text-slate-400">已选 0 篇</span>
      </div>
      <div class="flex items-center gap-2">
        <button id="push-cancel" class="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">取消</button>
        <button id="push-confirm" class="px-3 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">推送选中文章</button>
      </div>
    `;
    // 插入到 post-list 前面
    postList.parentNode.insertBefore(pushModeBar, postList);
    pushSelectAll = document.getElementById('push-select-all');
    pushSelectedCount = document.getElementById('push-selected-count');
    pushCancelBtn = document.getElementById('push-cancel');
    pushConfirmBtn = document.getElementById('push-confirm');

    // 绑定事件
    pushCancelBtn?.addEventListener('click', exitPushMode);
    pushConfirmBtn?.addEventListener('click', pushSelected);
    pushSelectAll?.addEventListener('change', () => {
      const filtered = getFiltered();
      const start = (store.page - 1) * PAGE_SIZE;
      const pageData = filtered.slice(start, start + PAGE_SIZE);
      if (pushSelectAll.checked) {
        pageData.forEach((p) => store.selectedSlugs.add(p.slug));
      } else {
        pageData.forEach((p) => store.selectedSlugs.delete(p.slug));
      }
      render();
      updatePushBar();
    });
  }

  // ---------- 加载 ----------
  async function load() {
    try {
      const data = await api.listPosts();
      store.posts = Array.isArray(data.posts) ? data.posts : [];
      store.page = 1;
      render();
      updateStats();
    } catch {
      postList.innerHTML = `
        <div class="px-4 py-16 text-center text-red-500 text-sm">
          加载失败，请确保开发服务器正在运行
        </div>`;
      pagination.classList.add('hidden');
      pagination.classList.remove('flex');
    }
  }

  function updateStats() {
    document.getElementById('count-all').textContent = store.posts.length;
    document.getElementById('count-published').textContent = store.posts.filter(
      (p) => p.published && !p.draft
    ).length;
    document.getElementById('count-draft').textContent = store.posts.filter((p) => p.draft).length;
    document.getElementById('count-featured').textContent = store.posts.filter(
      (p) => p.featured
    ).length;
  }

  // ---------- 筛选 / 排序 ----------
  function getFiltered() {
    const keyword = searchInput.value.trim().toLowerCase();
    let filtered = store.posts;
    if (store.filterTab === 'published') filtered = filtered.filter((p) => p.published && !p.draft);
    if (store.filterTab === 'draft') filtered = filtered.filter((p) => p.draft);
    if (store.filterTab === 'featured') filtered = filtered.filter((p) => p.featured);
    if (keyword) filtered = filtered.filter((p) => p.title.toLowerCase().includes(keyword));

    // 默认按发布时间倒序（最新在前）
    const parseDay = (s) => {
      if (!s) return 0;
      return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s).getTime();
    };
    return [...filtered].sort((a, b) => parseDay(b.pubDate) - parseDay(a.pubDate));
  }

  // ---------- 推送状态 ----------
  function getPushStatusHtml(post) {
    if (!post.githubPushedAt) {
      return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">未推送</span>';
    }
    // 比较内容哈希：一样就是已推送，不一样就是有更新
    if (post.pushedContentHash && post.currentContentHash && post.pushedContentHash !== post.currentContentHash) {
      return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">有更新未推送</span>';
    }
    return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">已推送</span>';
  }

  // ---------- 渲染 ----------
  function render() {
    const filtered = getFiltered();
    store.filteredCount = filtered.length;

    if (filtered.length === 0) {
      const isEmpty = store.posts.length === 0;
      postList.innerHTML = `
        <div class="px-4 py-16">
          <div class="flex flex-col items-center justify-center text-center">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-3">
              <svg class="w-7 h-7 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">${
              isEmpty ? '还没有文章' : '没有找到匹配的文章'
            }</h3>
            <p class="text-xs text-slate-400 dark:text-slate-500 mb-3 max-w-xs">${
              isEmpty ? '点击右上角「新建」开始创作' : '试试调整筛选条件'
            }</p>
            ${
              isEmpty
                ? '<button data-action="new-post" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>新建文章</button>'
                : '<button data-action="clear-filters" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors">清除筛选</button>'
            }
          </div>
        </div>`;
      pagination.classList.add('hidden');
      pagination.classList.remove('flex');
      return;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (store.page > totalPages) store.page = totalPages;
    if (store.page < 1) store.page = 1;
    const start = (store.page - 1) * PAGE_SIZE;
    const pageData = filtered.slice(start, start + PAGE_SIZE);

    postList.innerHTML = pageData
      .map((post) => {
        const encodedSlug = encodeURIComponent(post.slug);
        const isSelected = store.selectedSlugs.has(post.slug);
        const statusClass = post.draft
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
        const tags =
          post.tags && post.tags.length > 0
            ? post.tags
                .slice(0, 3)
                .map(
                  (tag) =>
                    `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">#${escapeHtml(
                      tag
                    )}</span>`
                )
                .join('')
            : '';
        const checkboxHtml = store.pushMode
          ? `<input type="checkbox" data-action="toggle-select" data-slug="${encodedSlug}" ${isSelected ? 'checked' : ''} class="w-5 h-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer flex-shrink-0" />`
          : '';
        const actionButtons = store.pushMode ? '' : `
            <div class="flex-shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              ${post.draft ? `<button data-action="publish" data-slug="${encodedSlug}" class="w-10 h-10 rounded-full bg-brand-600 hover:bg-brand-700 shadow-lg hover:shadow-xl hover:shadow-brand-500/30 flex items-center justify-center text-white transition-all text-base font-medium" title="发布">发</button>` : ''}
              <button data-action="preview" data-slug="${encodedSlug}" class="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl hover:shadow-brand-500/30 flex items-center justify-center text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 transition-all text-base font-medium" title="预览">预</button>
              <button data-action="edit" data-slug="${encodedSlug}" class="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl hover:shadow-brand-500/30 flex items-center justify-center text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 transition-all text-base font-medium" title="编辑">改</button>
              <button data-action="delete" data-slug="${encodedSlug}" class="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl hover:shadow-red-500/30 flex items-center justify-center text-slate-500 hover:text-red-600 transition-all text-base font-medium" title="删除">删</button>
            </div>`;
        return `
        <div class="post-card group bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all ${isSelected ? 'ring-2 ring-brand-500' : ''}">
          <div class="flex items-center gap-4">
            ${checkboxHtml}
            <div class="flex-shrink-0 w-28 pt-0.5">
              <div class="text-xs text-slate-900 dark:text-white font-medium">${formatDate(
                post.pubDate
              )}</div>
              <div class="flex flex-col gap-1 mt-1">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit ${statusClass}">${
          post.draft ? '草稿' : '已发布'
        }</span>
                ${getPushStatusHtml(post)}
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                ${post.featured ? '<span class="inline-flex items-center flex-shrink-0 text-[10px] font-medium leading-4 px-1.5 py-px rounded bg-accent-50 text-accent-700 border border-accent-200 dark:bg-accent-900/40 dark:text-accent-300 dark:border-accent-800/60">精选</span>' : ''}
                <span data-action="${store.pushMode ? 'toggle-select' : 'preview'}" data-slug="${encodedSlug}" class="text-base font-medium text-slate-900 dark:text-white truncate cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors">${escapeHtml(
          post.title
        )}</span>
              </div>
              <div class="mt-1.5 flex items-center gap-2 text-sm flex-wrap">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">${
                  CATEGORY_NAMES[post.category] || escapeHtml(post.category)
                }</span>
                ${tags}
              </div>
            </div>
            ${actionButtons}
          </div>
        </div>`;
      })
      .join('');

    renderPagination(totalPages);
    pagination.classList.remove('hidden');
    pagination.classList.add('flex');
  }

  function renderPagination(totalPages) {
    pageNext.disabled = store.page >= totalPages;

    let pages = [];
    if (totalPages <= 5) {
      pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      pages.push(1);
      if (store.page > 3) pages.push('...');
      for (let i = Math.max(2, store.page - 1); i <= Math.min(totalPages - 1, store.page + 1); i++) {
        pages.push(i);
      }
      if (store.page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    pageNumbers.innerHTML = pages
      .map((p) => {
        if (p === '...') return '<span class="px-2 text-slate-400">...</span>';
        return `<button data-page="${p}" class="w-8 h-8 rounded-full text-sm ${
          p === store.page
            ? 'text-brand-600 dark:text-brand-400 font-medium'
            : 'text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors'
        }">${p}</button>`;
      })
      .join('');

    jumpInput.value = store.page;
  }

  // ---------- 预览（新标签页打开已保存文章） ----------
  async function previewPost(slug) {
    try {
      const data = await api.getPost(slug);
      const previewData = {
        title: data.title || '未命名文章',
        category: data.category || '',
        description: data.description || '',
        featured: data.featured === true,
        content: data.body || '',
        pubDate: data.pubDate || new Date().toISOString().split('T')[0],
        slug,
      };
      sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(previewData));
      window.open('/admin/preview', '_blank');
      showToast('预览已在新标签页打开');
    } catch {
      showToast('预览加载失败', 'error');
    }
  }

  // ---------- 发布（草稿 → 已发布） ----------
  async function publishPost(slug) {
    if (!confirm('确定发布这篇文章吗？发布后将对访客可见。')) return;
    try {
      await api.updatePost({ slug, draft: false, published: true });
      showToast('文章已发布');
      await load();
    } catch (e) {
      showToast(e.message || '发布失败', 'error');
    }
  }

  // ---------- 删除 ----------
  async function deletePost(slug) {
    if (!confirm(`确定要删除文章 "${slug}" 吗？此操作不可撤销。`)) return;
    try {
      await api.deletePost(slug);
      showToast('文章已删除');
      await load();
      // 若正在编辑的正是被删文章，回到列表
      const route = router.route;
      if (route.name === 'editor' && route.mode === 'edit' && route.slug === slug) {
        router.navigate('/posts');
      }
    } catch (e) {
      showToast(e.message || '删除失败', 'error');
    }
  }

  // ---------- 筛选 ----------
  function setFilterTab(tab) {
    store.filterTab = tab;
    store.page = 1;
    document.querySelectorAll('.filter-tab').forEach((btn) => {
      btn.classList.remove(
        'bg-brand-50', 'dark:bg-brand-900/30', 'text-brand-700', 'dark:text-brand-300',
        'hover:bg-brand-100', 'dark:hover:bg-brand-900/50'
      );
      btn.classList.add(
        'bg-white', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-400',
        'hover:bg-slate-100', 'dark:hover:bg-slate-700'
      );
    });
    const activeBtn = document.getElementById(`filter-${tab}`);
    if (activeBtn) {
      activeBtn.classList.add(
        'bg-brand-50', 'dark:bg-brand-900/30', 'text-brand-700', 'dark:text-brand-300',
        'hover:bg-brand-100', 'dark:hover:bg-brand-900/50'
      );
      activeBtn.classList.remove(
        'bg-white', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-400',
        'hover:bg-slate-100', 'dark:hover:bg-slate-700'
      );
    }
    render();
  }

  function clearFilters() {
    searchInput.value = '';
    setFilterTab('all');
  }

  // ---------- 事件绑定（事件委托，杜绝内联 onclick） ----------
  postList.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl || !postList.contains(actionEl)) return;
    const action = actionEl.dataset.action;
    if (action === 'new-post') {
      router.navigate('/edit/new');
      return;
    }
    if (action === 'clear-filters') {
      clearFilters();
      return;
    }
    const slug = decodeURIComponent(actionEl.dataset.slug || '');
    if (!slug) return;
    if (action === 'preview') previewPost(slug);
    else if (action === 'edit') router.navigate(`/edit/${encodeURIComponent(slug)}`);
    else if (action === 'publish') publishPost(slug);
    else if (action === 'delete') deletePost(slug);
    else if (action === 'toggle-select') toggleSelect(slug);
  });

  pageNumbers.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    store.page = parseInt(btn.dataset.page, 10) || 1;
    render();
  });

  pageNext.addEventListener('click', () => {
    if (pageNext.disabled) return;
    const totalPages = Math.ceil(store.filteredCount / PAGE_SIZE);
    if (store.page < totalPages) {
      store.page += 1;
      render();
    }
  });

  function jumpToPage() {
    const page = parseInt(jumpInput.value, 10);
    if (!page || page < 1) return;
    const totalPages = Math.ceil(store.filteredCount / PAGE_SIZE);
    store.page = Math.min(page, totalPages);
    render();
  }
  jumpBtn.addEventListener('click', jumpToPage);
  jumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') jumpToPage();
  });

  ['all', 'published', 'draft', 'featured'].forEach((tab) => {
    document.getElementById(`filter-${tab}`).addEventListener('click', () => setFilterTab(tab));
  });
  searchInput.addEventListener('input', () => {
    store.page = 1;
    render();
  });

  // ---------- 推送选择模式 ----------
  function updatePushBar() {
    if (!store.pushMode) {
      pushModeBar?.classList.add('hidden');
      return;
    }
    pushModeBar?.classList.remove('hidden');
    if (pushSelectedCount) {
      pushSelectedCount.textContent = `已选 ${store.selectedSlugs.size} 篇`;
    }
    // 更新全选状态（空列表时不参与计算，避免空数组 every() 恒为 true 导致误勾选）
    const filtered = getFiltered();
    const start = (store.page - 1) * PAGE_SIZE;
    const pageData = filtered.slice(start, start + PAGE_SIZE);
    const allSelected = pageData.length > 0 && pageData.every((p) => store.selectedSlugs.has(p.slug));
    if (pushSelectAll) pushSelectAll.checked = allSelected;
  }

  function enterPushMode() {
    createPushBar();
    store.pushMode = true;
    store.selectedSlugs.clear();
    if (pushSelectAll) pushSelectAll.checked = false;  // 重置全选状态
    render();
    updatePushBar();
  }

  function exitPushMode() {
    store.pushMode = false;
    store.selectedSlugs.clear();
    render();
    updatePushBar();
    // 同步把 URL 上的 ?mode=push 清掉，否则刷新后 router 又会自动进入推送模式
    if (router.route.name === 'posts' && router.route.query?.mode === 'push') {
      router.replaceUrl('/posts');
    }
  }

  function toggleSelect(slug) {
    if (store.selectedSlugs.has(slug)) {
      store.selectedSlugs.delete(slug);
    } else {
      store.selectedSlugs.add(slug);
    }
    render();
    updatePushBar();
  }

  async function pushSelected() {
    const slugs = Array.from(store.selectedSlugs);
    if (slugs.length === 0) {
      showToast('请先选择要推送的文章', 'error');
      return;
    }

    pushConfirmBtn.disabled = true;
    pushConfirmBtn.classList.add('opacity-60', 'cursor-not-allowed');

    // 打开推送工作流弹窗：SSE 流式展示逐篇推送进度
    // onDone：推送收尾，弹窗继续停留显示结果
    // onClose：用户关闭弹窗后才刷新文章列表
    const titleMap = {};
    for (const slug of slugs) {
      const post = store.posts.find((p) => p.slug === slug);
      if (post) titleMap[slug] = post.title;
    }
    openPushModal(slugs, {
      titles: titleMap,
      onDone: () => {
        pushConfirmBtn.disabled = false;
        pushConfirmBtn.textContent = '推送选中文章';
        pushConfirmBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      },
      onClose: () => {
        exitPushMode();
        load();
      },
    });
  }

  // 监听路由变化，自动进入/退出推送模式
  router.subscribe((route) => {
    if (route.name === 'posts') {
      if (route.query?.mode === 'push') {
        enterPushMode();
      } else {
        exitPushMode();
      }
    }
  });

  // 顶部"推送"按钮：直接进入推送选择模式
  document.getElementById('btn-push')?.addEventListener('click', enterPushMode);

  // 重写 render，增加推送栏更新
  const originalRender = render;
  function renderWithPushBar() {
    originalRender();
    updatePushBar();
  }

  return { load, render: renderWithPushBar, enterPushMode };
}
