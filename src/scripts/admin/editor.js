// ============================================
// 全屏编辑器：开关、文章设置弹窗、预览 / 大纲 / 字数、
// 本地草稿自动保存与恢复、图片上传、保存（草稿 / 发表）。
// 编辑器自身不决定"退到哪个视图"，一切跳转交给 router。
// ============================================

import { api } from './api.js';
import { store, resetEditorState } from './store.js';
import { showToast } from './toast.js';
import { PREVIEW_STORAGE_KEY, CATEGORY_NAMES } from './config.js';
import { saveDraft, loadDraft, hasDraft, clearDraft } from './draft.js';
import { createTagInput } from './tags.js';
import { initMarkdownEditor } from './markdown.js';

const DEFAULT_CONTENT = `## 概述

在这里写文章概述...

## 正文

在这里写正文...

\`\`\`java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, S2J!");
    }
}
\`\`\`
`;

// Slug 自动生成：优先取标题中的英文/数字；纯中文时给一个稳定的日期+随机串占位，作者仍可手动改
let fallbackSlug = '';
function generateSlug(title) {
  const englishPart = title
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (englishPart) return englishPart;
  if (!fallbackSlug) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    fallbackSlug = `post-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return fallbackSlug;
}

export function initEditor({ router, refreshPosts }) {
  // ---------- DOM ----------
  const modal = document.getElementById('editor-modal');
  const contentEl = document.getElementById('editor-content');
  const wordCountEl = document.getElementById('word-count');
  const draftIndicator = document.getElementById('draft-indicator');
  const outlineBtn = document.getElementById('btn-outline');
  const outlinePanel = document.getElementById('outline-panel');

  const fieldTitle = document.getElementById('field-title');
  const fieldSlug = document.getElementById('field-slug');
  const fieldCategory = document.getElementById('field-category');
  const fieldDescription = document.getElementById('field-description');
  const fieldFeatured = document.getElementById('field-featured');
  const descCountEl = document.getElementById('desc-count');

  // 左栏卡片预览
  const cardTitle = document.getElementById('preview-card-title');
  const cardDesc = document.getElementById('preview-card-desc');
  const cardCategory = document.getElementById('preview-card-category');
  const cardFeatured = document.getElementById('preview-card-featured');
  const cardTags = document.getElementById('preview-card-tags');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const btnSaveDraft = document.getElementById('btn-save-draft');
  const btnSavePublish = document.getElementById('btn-save-publish');

  // ---------- 子模块 ----------
  const tagInput = createTagInput({
    container: document.getElementById('tag-input-container'),
    input: document.getElementById('tag-input-field'),
    onChange: () => { scheduleDraftSave(); updateCardPreview(); },
    onDuplicate: () => showToast('标签已存在', 'error'),
  });
  const md = initMarkdownEditor({ textarea: contentEl, toolbar: document.querySelector('.md-toolbar'), uploadImage });

  let showOutline = false;
  let outlineItems = [];
  let draftTimer = null;
  let openSession = 0; // 用于丢弃过期的异步加载结果

  // ---------- 左栏卡片预览（标题/摘要/分类/标签/精选 实时联动） ----------
  function updateCardPreview() {
    cardTitle.textContent = fieldTitle.value.trim() || '未命名文章';
    cardDesc.textContent = fieldDescription.value.trim() || '填写摘要后，这里会显示文章简介…';
    cardCategory.textContent = CATEGORY_NAMES[fieldCategory.value] || fieldCategory.value || '未分类';
    cardFeatured.classList.toggle('hidden', !fieldFeatured.checked);
    if (cardTags) {
      const tags = [...tagInput.tags];
      cardTags.innerHTML = tags.length
        ? tags.map(t => `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">${escapeHtml(t)}</span>`).join('')
        : '';
    }
    if (showOutline) renderOutline();
  }

  // ---------- 正文 textarea 自适应高度：撑满首屏，下滚才见设置区 ----------
  const mainCard = contentEl.parentElement;
  function autoGrow() {
    contentEl.style.height = 'auto';
    const minH = mainCard ? mainCard.clientHeight : 300;
    contentEl.style.height = Math.max(contentEl.scrollHeight, minH) + 'px';
  }

  // 左卡片与正文顶部对齐：占位高度 = 工具栏高度 + gap-4(16px)
  function alignAside() {
    const spacer = document.getElementById('aside-toolbar-spacer');
    const toolbar = document.querySelector('.md-toolbar');
    if (spacer && toolbar) {
      spacer.style.height = (toolbar.offsetHeight + 16) + 'px';
    }
  }

  function updateWordCount() {
    const count = contentEl.value.replace(/\s/g, '').length;
    wordCountEl.textContent = `${count.toLocaleString()} 字`;
  }

  function updateDescCount() {
    if (descCountEl) descCountEl.textContent = fieldDescription.value.length;
  }

  function updateDraftIndicator() {
    draftIndicator.textContent = store.hasUnsavedChanges ? '● 未保存' : '';
  }

  // ---------- 大纲 ----------
  function generateOutline() {
    const items = [];
    let pos = 0;
    for (const line of contentEl.value.split('\n')) {
      const match = line.match(/^(#{1,4})\s+(.+)/);
      if (match) {
        items.push({ level: match[1].length, text: match[2].trim(), position: pos });
      }
      pos += line.length + 1;
    }
    return items;
  }

  function renderOutline() {
    outlineItems = generateOutline();
    if (outlineItems.length === 0) {
      outlinePanel.innerHTML =
        '<div class="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">暂无标题，使用 #、##、### 创建</div>';
      return;
    }
    outlinePanel.innerHTML = `
      <div class="p-1">
        <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">大纲（${outlineItems.length}）</h3>
        <div class="space-y-0.5">
          ${outlineItems
            .map(
              (item, i) => `
            <button class="outline-item w-full text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-xs text-slate-700 dark:text-slate-300 truncate" data-index="${i}" style="padding-left: ${(item.level - 1) * 14 + 8}px">
              <span class="text-slate-400 dark:text-slate-500 mr-1">H${item.level}</span>${item.text}
            </button>`
            )
            .join('')}
        </div>
      </div>`;
    outlinePanel.querySelectorAll('.outline-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = outlineItems[parseInt(btn.dataset.index, 10)];
        if (!item) return;
        contentEl.focus();
        contentEl.setSelectionRange(item.position, item.position);
        const lineHeight = 20;
        const lines = contentEl.value.substring(0, item.position).split('\n').length;
        contentEl.scrollTop = (lines - 5) * lineHeight;
      });
    });
  }

  function toggleOutline() {
    showOutline = !showOutline;
    if (showOutline) {
      outlineBtn.classList.add(
        'text-brand-600', 'dark:text-brand-400', 'bg-brand-50', 'dark:bg-brand-900/30'
      );
      renderOutline();
    } else {
      outlineBtn.classList.remove(
        'text-brand-600', 'dark:text-brand-400', 'bg-brand-50', 'dark:bg-brand-900/30'
      );
      outlinePanel.innerHTML = '';
    }
  }

  function resetOutline() {
    showOutline = false;
    outlineBtn.classList.remove(
      'text-brand-600', 'dark:text-brand-400', 'bg-brand-50', 'dark:bg-brand-900/30'
    );
  }

  // ---------- 草稿 ----------
  function collectForm() {
    return {
      title: fieldTitle.value,
      slug: fieldSlug.value,
      category: fieldCategory.value,
      tags: [...tagInput.tags],
      description: fieldDescription.value,
      featured: fieldFeatured.checked,
      content: contentEl.value,
    };
  }

  function doSaveDraft() {
    saveDraft({ ...collectForm(), draft: false, editingSlug: store.editingSlug });
    store.hasUnsavedChanges = true;
    updateDraftIndicator();
  }
  function scheduleDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(doSaveDraft, 800);
  }

  function fillForm(d) {
    fieldTitle.value = d.title || '';
    fieldSlug.value = d.slug || '';
    fieldCategory.value = d.category || 'java-basics';
    tagInput.setTags(d.tags);
    fieldDescription.value = d.description || '';
    fieldFeatured.checked = d.featured === true;
    contentEl.value = d.content || '';
    updateDescCount();
    updateCardPreview();
    autoGrow();
  }

  // ---------- 打开 / 关闭（由路由调用） ----------
  function showModal() {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => { autoGrow(); alignAside(); });
  }

  function openNew() {
    const session = ++openSession;
    resetEditorState();
    resetOutline();
    fallbackSlug = ''; // 每篇新文章重新生成一次占位 slug
    fillForm({
      title: '', slug: '', category: 'java-basics', tags: [],
      description: '', featured: false, content: DEFAULT_CONTENT,
    });
    store.slugManuallyEdited = false;
    store.hasUnsavedChanges = false;
    updateDraftIndicator();
    showModal();
    updateCardPreview();
    updateWordCount();
    setTimeout(() => fieldTitle.focus(), 100);

    // 新建时若有上次未处理的本地草稿，提示恢复
    if (hasDraft()) {
      setTimeout(() => {
        if (session !== openSession) return;
        if (confirm('发现未保存的草稿，是否恢复？')) {
          restoreDraft();
          showToast('草稿已恢复', 'info');
        } else {
          clearDraft();
        }
      }, 200);
    }
  }

  async function openEdit(slug) {
    const session = ++openSession;
    resetEditorState();
    resetOutline();
    fillForm({
      title: '', slug: '', category: 'java-basics', tags: [],
      description: '', featured: false, content: '',
    });
    store.slugManuallyEdited = true;
    showModal();
    updateWordCount();

    try {
      const data = await api.getPost(slug);
      // 加载期间用户已离开编辑器，则丢弃结果
      if (session !== openSession || router.route.name !== 'editor') return;
      store.editingSlug = slug;
      fillForm({
        title: data.title || '',
        slug: slug.split('/')[1] || '',
        category: data.category || 'java-basics',
        tags: Array.isArray(data.tags) ? data.tags : [],
        description: data.description || '',
        featured: data.featured === true,
        content: data.body || '',
      });
      store.slugManuallyEdited = true;
      clearDraft();
      store.hasUnsavedChanges = false;
      updateDraftIndicator();
      updateCardPreview();
      updateWordCount();
    } catch (e) {
      if (session !== openSession) return;
      showToast(e.message || '加载文章失败', 'error');
      router.navigate('/posts', { replace: true });
    }
  }

  function restoreDraft() {
    const d = loadDraft();
    if (!d) return;
    fillForm(d);
    store.editingSlug = d.editingSlug || null;
    store.slugManuallyEdited = true;
    if (store.editingSlug) {
      // 同步地址栏但不触发重新分发（内容已由草稿填充）
      router.replaceUrl(`/edit/${encodeURIComponent(store.editingSlug)}`);
    }
    store.hasUnsavedChanges = true;
    updateDraftIndicator();
    updateCardPreview();
    updateWordCount();
  }

  /** 用户主动关闭：校验未保存改动后交给路由 */
  function requestClose() {
    if (store.hasUnsavedChanges && !confirm('有未保存的更改，确定要关闭吗？')) return;
    router.exitEditor();
  }

  /** 路由已离开编辑器时的纯 UI 复位（不 confirm、不改 URL） */
  function hide() {
    clearTimeout(draftTimer);
    resetOutline();
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ---------- 保存 ----------
  function setSaveButtonsLoading(loading) {
    [btnSaveDraft, btnSavePublish].forEach((btn) => {
      if (!btn) return;
      btn.disabled = loading;
      if (loading) {
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = `<svg class="w-4 h-4 animate-spin inline-block mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>保存中...`;
        btn.classList.add('opacity-60', 'cursor-not-allowed', 'pointer-events-none');
      } else {
        btn.textContent = btn.dataset.origText || btn.textContent;
        btn.classList.remove('opacity-60', 'cursor-not-allowed', 'pointer-events-none');
      }
    });
  }

  async function saveArticle(options = {}) {
    const { publish = false } = options;
    const title = fieldTitle.value.trim();
    const shortSlug = fieldSlug.value.trim();
    const category = fieldCategory.value;
    const description = fieldDescription.value.trim();
    const featured = fieldFeatured.checked;
    const content = contentEl.value;
    const draft = !publish;

    if (!title) { showToast('请输入标题', 'error'); return; }
    if (!shortSlug) { showToast('请输入 slug', 'error'); return; }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const pubDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const payload = {
      title,
      slug: shortSlug,
      category,
      tags: [...tagInput.tags],
      description,
      featured,
      draft,
      published: publish,
      content,
      pubDate,
    };
    if (store.editingSlug) payload.slug = store.editingSlug;

    setSaveButtonsLoading(true);
    try {
      const res = store.editingSlug
        ? await api.updatePost(payload)
        : await api.createPost(payload);

      clearDraft();
      store.hasUnsavedChanges = false;
      updateDraftIndicator();

      const fullSlug = res.slug || store.editingSlug || `${category}/${shortSlug}`;
      store.editingSlug = fullSlug;

      if (publish) {
        showToast('文章已发布');
        refreshPosts?.();
        router.navigate('/posts', { replace: true });
      } else {
        showToast('草稿已保存');
        refreshPosts?.();
        router.replaceUrl(`/edit/${encodeURIComponent(fullSlug)}`);
      }
    } catch (e) {
      showToast(e.message || '保存失败', 'error');
    } finally {
      setSaveButtonsLoading(false);
    }
  }

  // ---------- 预览（把当前未保存内容送到独立预览页） ----------
  function previewArticle() {
    const title = fieldTitle.value.trim();
    if (!title) { showToast('请输入标题', 'error'); return; }
    const previewData = {
      title,
      category: fieldCategory.value,
      description: fieldDescription.value.trim(),
      featured: fieldFeatured.checked,
      content: contentEl.value,
      pubDate: new Date().toISOString().split('T')[0],
      slug: store.editingSlug || null,
    };
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(previewData));
    window.open('/admin/preview', '_blank');
    showToast('预览已在新标签页打开');
  }

  // ---------- 图片上传 ----------
  async function uploadImage(file) {
    showToast('正在上传图片...', 'info');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1];
      const ext = file.name.split('.').pop() || 'png';
      const data = await api.uploadImage({ filename: file.name, data: base64, ext });
      const alt = file.name.replace(/\.[^.]+$/, '');
      md.insertText(`\n![${alt}](${data.url})\n`);
      showToast('图片上传成功');
    } catch {
      showToast('图片上传失败', 'error');
    }
  }

  // ---------- 事件绑定 ----------
  document.getElementById('btn-editor-back').addEventListener('click', requestClose);
  document.getElementById('btn-close-editor').addEventListener('click', requestClose);
  // 底部固定操作栏：保存草稿 / 发表 直接执行，预览在新标签页打开
  btnSaveDraft.addEventListener('click', () => saveArticle(false));
  btnSavePublish.addEventListener('click', () => saveArticle({ publish: true }));

  document.getElementById('btn-preview').addEventListener('click', previewArticle);
  // ---------- 卡片 hover 缩略图预览（iframe 缩放浮层） ----------
  let hoverPanel = null;
  let hoverLeaveTimer = null;

  function destroyHoverPanel() {
    if (hoverPanel) { hoverPanel.remove(); hoverPanel = null; }
  }

  function showHoverPreview() {
    clearTimeout(hoverLeaveTimer);
    const data = {
      title: fieldTitle.value.trim(),
      category: fieldCategory.value,
      description: fieldDescription.value.trim(),
      featured: fieldFeatured.checked,
      content: contentEl.value,
      pubDate: new Date().toISOString().split('T')[0],
      slug: store.editingSlug || null,
    };
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(data));
    const card = document.getElementById('preview-card-hover');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    destroyHoverPanel();

    const W = 320, H = 420;
    let left = rect.right + 16;
    if (left + W > window.innerWidth - 16) left = rect.left - W - 16;

    hoverPanel = document.createElement('div');
    hoverPanel.style.cssText = [
      'position:fixed',
      'left:' + left + 'px',
      'top:' + Math.max(rect.top, 16) + 'px',
      'width:' + W + 'px',
      'height:' + H + 'px',
      'border-radius:12px',
      'overflow:hidden',
      'box-shadow:0 12px 40px rgba(0,0,0,0.25)',
      'z-index:200',
      'opacity:0',
      'transition:opacity 0.25s ease',
      'border:1px solid rgba(0,0,0,0.1)',
      'background:#fff',
    ].join(';');

    const iframe = document.createElement('iframe');
    iframe.src = '/admin/preview';
    iframe.style.cssText = 'width:800px;height:1050px;border:0;transform:scale(0.4);transform-origin:top left;pointer-events:none;';
    iframe.onload = () => { if (hoverPanel) hoverPanel.style.opacity = '1'; };
    hoverPanel.appendChild(iframe);
    hoverPanel.addEventListener('mouseleave', () => {
      hoverLeaveTimer = setTimeout(destroyHoverPanel, 200);
    });
    document.body.appendChild(hoverPanel);
  }

  const hoverCard = document.getElementById('preview-card-hover');
  if (hoverCard) {
    hoverCard.addEventListener('mouseenter', showHoverPreview);
    hoverCard.addEventListener('mouseleave', () => {
      hoverLeaveTimer = setTimeout(destroyHoverPanel, 200);
    });
  }
  outlineBtn.addEventListener('click', toggleOutline);

  // 内容 / 字段变化：字数、草稿、卡片预览、正文自适应高度
  contentEl.addEventListener('input', () => {
    updateWordCount();
    autoGrow();
    scheduleDraftSave();
  });
  fieldSlug.addEventListener('input', scheduleDraftSave);
  fieldDescription.addEventListener('input', () => {
    updateDescCount();
    updateCardPreview();
    scheduleDraftSave();
  });
  fieldCategory.addEventListener('change', () => {
    updateCardPreview();
    scheduleDraftSave();
  });
  fieldFeatured.addEventListener('change', () => {
    updateCardPreview();
    scheduleDraftSave();
  });

  // 标题 → slug 自动生成 + 卡片预览
  fieldTitle.addEventListener('input', (e) => {
    if (!store.slugManuallyEdited) {
      fieldSlug.value = generateSlug(e.target.value);
    }
    updateCardPreview();
    scheduleDraftSave();
  });
  fieldSlug.addEventListener('input', () => {
    store.slugManuallyEdited = true;
  });

  // 快捷键：Esc 关闭（先关设置弹窗）、Ctrl+S 保存草稿
  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      // Markdown 小浮层（链接/图片/表格）打开时，Esc 由浮层自己处理，不连带关编辑器
      if (!document.getElementById('md-popover').classList.contains('hidden')) return;
      requestClose();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveArticle(false);
    }
  });

  // 图片拖拽上传
  contentEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    contentEl.classList.add('ring-2', 'ring-brand-400', 'ring-inset');
  });
  contentEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    contentEl.classList.remove('ring-2', 'ring-brand-400', 'ring-inset');
  });
  contentEl.addEventListener('drop', (e) => {
    e.preventDefault();
    contentEl.classList.remove('ring-2', 'ring-brand-400', 'ring-inset');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith('image/')) uploadImage(file);
      });
    }
  });

  // 粘贴图片上传
  contentEl.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) uploadImage(file);
        break;
      }
    }
  });

  // 窗口尺寸变化时重算正文高度与左栏对齐
  window.addEventListener('resize', () => { autoGrow(); alignAside(); });

  return { openNew, openEdit, hide };
}
