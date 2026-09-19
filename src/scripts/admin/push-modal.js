// ============================================
// 推送工作流弹窗
// - 以 SSE（fetch + ReadableStream）逐篇接收推送进度
// - 弹窗实时展示进度条 + 逐篇状态（排队/推送中/成功/失败）
// - 关闭弹窗不会中断后台推送，再次打开可继续看进度
// - 失败项可单独「重试失败项」
// ============================================

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const state = {
  open: false,
  el: null,
  items: new Map(),
  total: 0,
  done: 0,
  successCount: 0,
  failCount: 0,
  running: false,
  repo: '',
  branch: '',
  startTime: 0,
  onDone: null,
  onClose: null,
};

function ensureModal() {
  if (state.el) return state.el;
  const overlay = document.createElement('div');
  overlay.id = 'push-modal-overlay';
  overlay.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/50';
  overlay.innerHTML = `
    <div class="w-[640px] max-w-[92vw] min-h-[360px] max-h-[85vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h3 data-push-title class="text-base font-semibold text-slate-900 dark:text-white">推送工作流</h3>
          <p data-push-subtitle class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">正在将文章推送到 GitHub 仓库</p>
        </div>
        <button data-push-close class="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="px-5 pt-4">
        <div class="flex items-center justify-between text-xs mb-1.5">
          <span data-push-summary class="text-slate-600 dark:text-slate-300">准备中…</span>
          <span data-push-counts class="text-slate-500 dark:text-slate-400"></span>
        </div>
        <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div data-push-progress class="h-full bg-emerald-500 transition-all duration-300" style="width:0%"></div>
        </div>
      </div>

      <div data-push-list class="flex-1 overflow-y-auto px-5 py-3 space-y-1"></div>

      <div class="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
        <span data-push-status class="text-xs text-slate-500 dark:text-slate-400 truncate"></span>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button data-push-retry class="hidden px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">重试失败项</button>
          <button data-push-done class="px-3 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">完成</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  state.el = overlay;

  overlay.querySelector('[data-push-close]').addEventListener('click', closeModal);
  overlay.querySelector('[data-push-done]').addEventListener('click', closeModal);
  overlay.querySelector('[data-push-retry]').addEventListener('click', retryFailed);
  // 不绑定遮罩点击关闭：避免弹窗打开瞬间鼠标落点误触导致弹窗消失
  return overlay;
}

function closeModal() {
  if (state.el) state.el.classList.add('hidden');
  state.open = false;
  const cb = state.onClose;
  state.onClose = null;
  if (cb) cb();
}

function openModal() {
  const el = ensureModal();
  el.classList.remove('hidden');
  state.open = true;
  render();
}

function itemIcon(status) {
  if (status === 'success') {
    return '<span class="inline-flex w-5 h-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg></span>';
  }
  if (status === 'fail') {
    return '<span class="inline-flex w-5 h-5 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M18 6L6 18"/></svg></span>';
  }
  if (status === 'running') {
    return '<span class="inline-flex w-5 h-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"><svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.5M20 20v-5h-.5M4 4a8 8 0 0114-3M20 20a8 8 0 01-14 3"/></svg></span>';
  }
  return '<span class="inline-flex w-5 h-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-current"></span></span>';
}

function render() {
  if (!state.open || !state.el) return;
  const el = state.el;

  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
  el.querySelector('[data-push-progress]').style.width = `${pct}%`;

  const finished = !state.running && state.total > 0;
  const allOk = finished && state.failCount === 0;

  // 标题与副标题：推送中 vs 完成后
  const titleEl = el.querySelector('[data-push-title]');
  const subEl = el.querySelector('[data-push-subtitle]');
  if (titleEl) {
    titleEl.textContent = finished ? (allOk ? '推送完成' : '推送结束（有失败）') : '推送工作流';
  }
  if (subEl) {
    const target = state.repo ? `到 ${state.repo}${state.branch ? ` · ${state.branch}` : ''}` : '到 GitHub';
    subEl.textContent = finished
      ? (allOk ? `${state.successCount} 篇文章已成功推送${target}` : `${state.successCount} 篇成功，${state.failCount} 篇失败`)
      : `正在将文章推送${target}`;
  }

  el.querySelector('[data-push-summary]').textContent = state.running
    ? `正在推送 ${state.done} / ${state.total}`
    : (finished ? '推送已结束' : '准备中…');
  el.querySelector('[data-push-counts]').textContent =
    `成功 ${state.successCount} · 失败 ${state.failCount}`;

  const list = el.querySelector('[data-push-list]');
  list.innerHTML = Array.from(state.items.entries()).map(([slug, it]) => `
    <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/40">
      ${itemIcon(it.status)}
      <div class="min-w-0 flex-1">
        <div class="text-sm text-slate-800 dark:text-slate-100 truncate">${escapeHtml(it.title || slug)}</div>
        ${it.title && it.title !== slug ? `<div class="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">${escapeHtml(slug)}</div>` : ''}
        ${it.status === 'fail' && it.error ? `<div class="text-xs text-rose-500 dark:text-rose-400 mt-0.5 break-words leading-relaxed">${escapeHtml(it.error)}</div>` : ''}
      </div>
    </div>
  `).join('');

  el.querySelector('[data-push-retry]').classList.toggle('hidden', state.running || state.failCount === 0);

  const statusEl = el.querySelector('[data-push-status]');
  const elapsed = state.startTime ? `${((Date.now() - state.startTime) / 1000).toFixed(1)}s` : '';
  if (state.running) {
    statusEl.textContent = '推送进行中…关闭弹窗不会中断任务';
  } else if (state.total > 0) {
    const base = state.failCount > 0
      ? `有 ${state.failCount} 篇失败，可单独重试`
      : '全部推送成功';
    statusEl.textContent = elapsed ? `${base} · 耗时 ${elapsed}` : base;
  } else {
    statusEl.textContent = '';
  }
}

function handleEvent(evt) {
  if (evt.type === 'start') {
    state.total = evt.total;
    state.repo = evt.repo || '';
    state.branch = evt.branch || '';
  } else if (evt.type === 'progress') {
    const it = state.items.get(evt.slug) || { status: 'pending' };
    it.status = evt.success ? 'success' : 'fail';
    it.error = evt.error;
    state.items.set(evt.slug, it);
    state.done++;
    if (evt.success) state.successCount++;
    else state.failCount++;
  } else if (evt.type === 'done') {
    state.running = false;
    const cb = state.onDone;
    state.onDone = null;
    if (cb) cb();
  }
  render();
}

// 真正发起一次流式推送（不重置 items，用于新任务和重试共用）
async function streamPush(slugs) {
  try {
    const res = await fetch('/admin/api/github/push-selected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs }),
    });

    // 校验类错误后端仍返回 JSON
    if (!res.ok || !res.body) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `请求失败（${res.status}）`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以空行分隔
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = rawEvent.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        try {
          handleEvent(JSON.parse(dataLine.slice(5).trim()));
        } catch {
          /* 忽略无法解析的事件行 */
        }
      }
    }
  } catch (e) {
    // 整段流失败：把仍在进行中的项标记为失败
    for (const it of state.items.values()) {
      if (it.status === 'pending' || it.status === 'running') {
        it.status = 'fail';
        it.error = e.message;
      }
    }
    state.done = state.total;
    state.running = false;
    const cb = state.onDone;
    state.onDone = null;
    if (cb) cb();
    render();
  }
}

async function retryFailed() {
  const failed = Array.from(state.items.entries())
    .filter(([, it]) => it.status === 'fail')
    .map(([slug]) => slug);
  if (!failed.length) return;

  // 把这些失败项重置为排队，历史失败计数先扣掉，由新一轮 progress 重新累加
  for (const slug of failed) {
    state.items.set(slug, { status: 'pending' });
    state.failCount--;
  }
  state.total = failed.length;
  state.done = 0;
  state.running = true;
  render();
  await streamPush(failed);
}

/**
 * 打开推送工作流弹窗并启动流式推送
 * @param {string[]} slugs 要推送的 slug 列表
 * @param {{ onDone?: () => void, onClose?: () => void }} [hooks]
 *   onDone  推送任务结束（流式收尾）时调用，此时弹窗仍停留
 *   onClose 弹窗被用户关闭（点完成/X/遮罩）时调用，适合在此刷新列表
 */
export function openPushModal(slugs, { titles = {}, onDone, onClose } = {}) {
  state.total = slugs.length;
  state.done = 0;
  state.successCount = 0;
  state.failCount = 0;
  state.running = true;
  state.repo = '';
  state.branch = '';
  state.startTime = Date.now();
  state.items = new Map(slugs.map((s) => [s, { title: titles[s] || s, status: 'pending' }]));
  state.onDone = onDone || null;
  state.onClose = onClose || null;
  openModal();
  streamPush(slugs);
}
