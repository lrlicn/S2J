// ============================================
// 导入文章：选择本地 .md / .mdx 文件，解析 frontmatter，
// 逐篇调用创建接口落库（默认导入为草稿，由作者在列表中检查后发布）。
// ============================================

import { api } from './api.js';
import { showToast } from './toast.js';
import { CATEGORY_NAMES, CATEGORY_VALUES } from './config.js';

// 轻量 frontmatter 解析（与 plugins/admin-api.mjs 保持一致）
function parseFrontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text };
  return { data: parseYaml(match[1]), body: match[2] };
}

function parseYaml(raw) {
  const data = {};
  for (const line of raw.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(Number(value)) && value !== '') value = Number(value);
    else value = value.replace(/^["']|["']$/g, '');
    data[key] = value;
  }
  return data;
}

export function initImport({ router } = {}) {
  const modal = document.getElementById('import-modal');
  if (!modal) return { open() {} };

  const overlay = document.getElementById('import-overlay');
  const closeBtn = document.getElementById('import-close');
  const cancelBtn = document.getElementById('import-cancel');
  const confirmBtn = document.getElementById('import-confirm');
  const dropZone = document.getElementById('import-drop');
  const fileInput = document.getElementById('import-file-input');
  const fileList = document.getElementById('import-file-list');
  const defaultCat = document.getElementById('import-default-category');

  let pending = []; // { file, title, slug, category, tags, order, body }

  function open() {
    pending = [];
    fileInput.value = '';
    renderList();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function close() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function resolveCategory(p) {
    // 文件 frontmatter 里是合法分类就用它；否则跟随"默认分类"下拉
    return CATEGORY_VALUES.includes(p.rawCategory) ? p.rawCategory : defaultCat.value;
  }

  function renderList() {
    if (pending.length === 0) {
      fileList.innerHTML =
        '<p class="text-xs text-slate-400 dark:text-slate-500 py-2">尚未选择文件</p>';
    } else {
      fileList.innerHTML = pending
        .map((p, i) => {
          const cat = resolveCategory(p);
          const usingDefault = !CATEGORY_VALUES.includes(p.rawCategory);
          return `
          <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
            <span class="text-xs text-slate-400 w-5">${i + 1}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-slate-800 dark:text-slate-200 truncate">${escapeHtml(p.title)}</div>
              <div class="text-xs text-slate-400 dark:text-slate-500 truncate">${escapeHtml(p.file)} · ${CATEGORY_NAMES[cat] || cat}${usingDefault ? '（默认）' : ''}</div>
            </div>
            <button data-import-remove="${i}" class="text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors px-1" aria-label="移除">×</button>
          </div>`;
        })
        .join('');
    }
    confirmBtn.textContent = pending.length ? `导入 ${pending.length} 篇` : '导入 0 篇';
    confirmBtn.disabled = pending.length === 0;
    confirmBtn.classList.toggle('opacity-50', pending.length === 0);
    confirmBtn.classList.toggle('cursor-not-allowed', pending.length === 0);
  }

  async function addFiles(fileListObj) {
    const files = Array.from(fileListObj || []).filter((f) => /\.(md|mdx)$/i.test(f.name));
    for (const f of files) {
      const text = await f.text();
      const { data, body } = parseFrontmatter(text);
      const slug = f.name.replace(/\.(md|mdx)$/i, '');
      pending.push({
        file: f.name,
        title: data.title || slug,
        slug,
        rawCategory: data.category,
        tags: Array.isArray(data.tags) ? data.tags : [],
        order: typeof data.order === 'number' ? data.order : 999,
        body,
      });
    }
    if (files.length) renderList();
  }

  async function doImport() {
    if (!pending.length) return;
    confirmBtn.disabled = true;
    let ok = 0;
    let fail = 0;
    for (const p of pending) {
      try {
        await api.createPost({
          slug: p.slug,
          title: p.title,
          category: resolveCategory(p),
          tags: p.tags,
          order: p.order,
          content: p.body,
          draft: true,
          published: false,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    showToast(`导入完成：成功 ${ok} 篇${fail ? `，失败 ${fail} 篇（可能已存在）` : ''}，已作为草稿导入`);
    close();
    pending = [];
    if (ok > 0 && router) router.navigate('/posts');
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------- 事件 ----------
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-brand-400', 'bg-brand-50/50');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-brand-400', 'bg-brand-50/50');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-brand-400', 'bg-brand-50/50');
    addFiles(e.dataTransfer.files);
  });
  fileList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-import-remove]');
    if (!btn) return;
    pending.splice(Number(btn.dataset.importRemove), 1);
    renderList();
  });
  defaultCat.addEventListener('change', renderList);
  confirmBtn.addEventListener('click', doImport);
  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  return { open };
}
