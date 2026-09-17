// 全局 Toast 提示（容器结构见 components/admin/Toast.astro）

const ICONS = {
  success:
    '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
  error:
    '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
  info:
    '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
};

const COLORS = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  info: 'bg-slate-700',
};

const DURATIONS = { success: 2500, error: 4000, info: 3000 };

let toastEl = null;
let contentEl = null;
let hideTimer = null;

export function showToast(message, type = 'success') {
  if (!toastEl) toastEl = document.getElementById('toast');
  if (!contentEl) contentEl = document.getElementById('toast-content');
  if (!toastEl || !contentEl) return;

  contentEl.innerHTML = `${ICONS[type] || ICONS.info}<span>${message}</span>`;
  contentEl.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white min-w-[200px] ${
    COLORS[type] || COLORS.info
  }`;

  toastEl.classList.remove('hidden');
  requestAnimationFrame(() => toastEl.classList.remove('translate-y-4', 'opacity-0'));

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toastEl.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, DURATIONS[type] || 3000);
}
