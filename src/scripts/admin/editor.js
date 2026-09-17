// ============================================
// 全屏编辑器：开关、文章设置弹窗、预览 / 大纲 / 字数、
// 本地草稿自动保存与恢复、图片上传、保存（草稿 / 发表）。
// 编辑器自身不决定"退到哪个视图"，一切跳转交给 router。
// ============================================

import { api } from './api.js';
import { store, resetEditorState } from './store.js';
import { showToast } from './toast.js';
import { PREVIEW_STORAGE_KEY } from './config.js';
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
  const previewEl = document.getElementById('editor-preview');
  const wordCountEl = document.getElementById('word-count');
  const draftIndicator = document.getElementById('draft-indicator');
  const outlineBtn = document.getElementById('btn-outline');

  const fieldTitle = document.getElementById('field-title');
  const fieldSlug = document.getElementById('field-slug');
  const fieldCategory = document.getElementById('field-category');
  const fieldDescription = document.getElementById('field-description');
  const fieldFeatured = document.getElementById('field-featured');
  const fieldOrder = document.getElementById('field-order');

  const btnSaveDraft = document.getElementById('btn-save-draft');
  const btnSavePublish = document.getElementById('btn-save-publish');

  const settingsModal = document.getElementById('settings-modal');
  const settingsContent = document.getElementById('settings-modal-content');
  const settingsOverlay = document.getElementById('settings-modal-overlay');
  const btnSettingsConfirm = document.getElementById('btn-settings-confirm');

  // ---------- 子模块 ----------
  const tagInput = createTagInput({
    container: document.getElementById('tag-input-container'),
    input: document.getElementById('tag-input-field'),
    onChange: scheduleDraftSave,
    onDuplicate: () => showToast('标签已存在', 'error'),
  });
  const md = initMarkdownEditor({ textarea: contentEl, toolbar: document.querySelector('.md-toolbar'), uploadImage });

  let markedRender = null;
  let showOutline = false;
  let outlineItems = [];
  let draftTimer = null;
  let openSession = 0; // 用于丢弃过期的异步加载结果

  import('marked')
    .then(({ marked }) => {
      marked.setOptions({ breaks: true, gfm: true });
      markedRender = marked.parse.bind(marked);
      if (!modal.classList.contains('hidden')) updatePreview();
    })
    .catch(() => {
      markedRender = (text) => `<pre class="whitespace-pre-wrap text-sm">${text}</pre>`;
    });

  // ---------- 预览 / 字数 ----------
  function updatePreview() {
    if (showOutline) {
      renderOutline();
      return;
    }
    previewEl.innerHTML = markedRender
      ? markedRender(contentEl.value)
      : `<pre class="whitespace-pre-wrap text-sm">${contentEl.value}</pre>`;
  }

  function updateWordCount() {
    const count = contentEl.value.replace(/\s/g, '').length;
    wordCountEl.textContent = `${count.toLocaleString()} 字`;
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
      previewEl.innerHTML =
        '<div class="text-center text-slate-400 dark:text-slate-500 py-12"><p class="text-sm">暂无标题</p><p class="text-xs mt-1">使用 #、##、### 创建标题</p></div>';
      return;
    }
    previewEl.innerHTML = `
      <div class="p-4">
        <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">文章大纲（${outlineItems.length}）</h3>
        <div class="space-y-1">
          ${outlineItems
            .map(
              (item, i) => `
            <button class="outline-item w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-sm text-slate-700 dark:text-slate-300 truncate" data-index="${i}" style="padding-left: ${(item.level - 1) * 16 + 8}px">
              <span class="text-slate-400 dark:text-slate-500 mr-1.5">H${item.level}</span>${item.text}
            </button>`
            )
            .join('')}
        </div>
      </div>`;
    previewEl.querySelectorAll('.outline-item').forEach((btn) => {
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
      updatePreview();
    }
  }

  function resetOutline() {
    showOutline = false;
    outlineBtn.classList.remove(
      'text-brand-600', 'dark:text-brand-400', 'bg-brand-50', 'dark:bg-brand-900/30'
    );
  }

  // ---------- 文章设置弹窗 ----------
  let settingsAction = 'draft';
  function openSettingsModal(action) {
    settingsAction = action;
    if (action === 'settings') {
      // 纯查看/修改设置：确认按钮只关闭弹窗，不触发保存
      btnSettingsConfirm.textContent = '完成';
      btnSettingsConfirm.className =
        'px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors';
    } else {
      btnSettingsConfirm.textContent = action === 'publish' ? '发表' : '保存为草稿';
      btnSettingsConfirm.className =
        action === 'publish'
          ? 'px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors'
          : 'px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors';
    }
    settingsModal.classList.remove('hidden');
    settingsModal.classList.add('flex');
    requestAnimationFrame(() => {
      settingsContent.classList.remove('scale-95', 'opacity-0');
      settingsContent.classList.add('scale-100', 'opacity-100');
    });
  }
  function closeSettingsModal() {
    settingsContent.classList.remove('scale-100', 'opacity-100');
    settingsContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      settingsModal.classList.add('hidden');
      settingsModal.classList.remove('flex');
    }, 200);
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
      order: fieldOrder.value,
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
    fieldOrder.value = d.order || '999';
    contentEl.value = d.content || '';
  }

  // ---------- 打开 / 关闭（由路由调用） ----------
  function showModal() {
    closeSettingsModal();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function openNew() {
    const session = ++openSession;
    resetEditorState();
    resetOutline();
    fallbackSlug = ''; // 每篇新文章重新生成一次占位 slug
    fillForm({
      title: '', slug: '', category: 'java-basics', tags: [],
      description: '', featured: false, order: '999', content: DEFAULT_CONTENT,
    });
    store.slugManuallyEdited = false;
    store.hasUnsavedChanges = false;
    updateDraftIndicator();
    showModal();
    updatePreview();
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
      description: '', featured: false, order: '999', content: '',
    });
    store.slugManuallyEdited = true;
    showModal();
    previewEl.innerHTML = '<div class="text-center text-slate-400 py-12 text-sm">加载中...</div>';
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
        order: data.order || 999,
        content: data.body || '',
      });
      store.slugManuallyEdited = true;
      clearDraft();
      store.hasUnsavedChanges = false;
      updateDraftIndicator();
      updatePreview();
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
    updatePreview();
    updateWordCount();
  }

  /** 用户主动关闭：校验未保存改动后交给路由 */
  function requestClose() {
    if (!settingsModal.classList.contains('hidden')) {
      closeSettingsModal();
      return;
    }
    if (store.hasUnsavedChanges && !confirm('有未保存的更改，确定要关闭吗？')) return;
    router.exitEditor();
  }

  /** 路由已离开编辑器时的纯 UI 复位（不 confirm、不改 URL） */
  function hide() {
    clearTimeout(draftTimer);
    resetOutline();
    closeSettingsModal();
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

  async function saveArticle(publish = false) {
    const title = fieldTitle.value.trim();
    const shortSlug = fieldSlug.value.trim();
    const category = fieldCategory.value;
    const description = fieldDescription.value.trim();
    const featured = fieldFeatured.checked;
    const order = parseInt(fieldOrder.value, 10) || 999;
    const content = contentEl.value;
    const draft = !publish;

    if (!title) { showToast('请输入标题', 'error'); return; }
    if (!shortSlug) { showToast('请输入 slug', 'error'); return; }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const pubDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // 新建：slug 为不含分类的文件名；更新：slug 为 "分类/文件名"
    const payload = {
      title,
      slug: shortSlug,
      category,
      tags: [...tagInput.tags],
      description,
      featured,
      draft,
      published: !draft,
      order,
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

      // 关键：新建保存成功后回写完整 slug，此后再次保存走更新（PUT），避免重复创建 409
      const fullSlug = res.slug || store.editingSlug || `${category}/${shortSlug}`;
      store.editingSlug = fullSlug;

      if (publish) {
        showToast('文章已发布');
        refreshPosts?.();
        router.navigate('/posts', { replace: true });
      } else {
        showToast('草稿已保存');
        refreshPosts?.();
        // 新建草稿后把 /edit/new 同步为真实地址（仅替换 URL，不重新打开编辑器）
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
  btnSaveDraft.addEventListener('click', () => openSettingsModal('draft'));
  btnSavePublish.addEventListener('click', () => openSettingsModal('publish'));
  document.getElementById('btn-editor-settings').addEventListener('click', () => openSettingsModal('settings'));
  document.getElementById('btn-preview').addEventListener('click', previewArticle);
  outlineBtn.addEventListener('click', toggleOutline);

  document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-settings-cancel').addEventListener('click', closeSettingsModal);
  settingsOverlay.addEventListener('click', closeSettingsModal);
  btnSettingsConfirm.addEventListener('click', () => {
    closeSettingsModal();
    if (settingsAction === 'settings') return; // 仅设置模式：只关闭，不保存
    saveArticle(settingsAction === 'publish');
  });

  // 内容 / 字段变化：预览、字数、草稿
  contentEl.addEventListener('input', () => {
    updatePreview();
    updateWordCount();
    scheduleDraftSave();
  });
  ['field-title', 'field-slug', 'field-description', 'field-order'].forEach((id) => {
    document.getElementById(id).addEventListener('input', scheduleDraftSave);
  });
  ['field-category', 'field-featured'].forEach((id) => {
    document.getElementById(id).addEventListener('change', scheduleDraftSave);
  });

  // 标题 → slug 自动生成
  fieldTitle.addEventListener('input', (e) => {
    if (!store.slugManuallyEdited) {
      fieldSlug.value = generateSlug(e.target.value);
    }
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

  // 滚动同步
  let isSyncScrolling = false;
  let scrollTimer = null;
  function syncScroll(source, target) {
    if (isSyncScrolling) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      isSyncScrolling = true;
      const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
      target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
      setTimeout(() => { isSyncScrolling = false; }, 50);
    }, 10);
  }
  contentEl.addEventListener('scroll', () => syncScroll(contentEl, previewEl));
  previewEl.addEventListener('scroll', () => syncScroll(previewEl, contentEl));

  // 拖拽调整分栏宽度
  const resizer = document.getElementById('editor-resizer');
  const editorPane = document.getElementById('editor-pane');
  const splitContainer = document.getElementById('editor-split-container');
  let isResizing = false;
  if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const rect = splitContainer.getBoundingClientRect();
      let percent = ((e.clientX - rect.left) / rect.width) * 100;
      percent = Math.max(20, Math.min(80, percent));
      editorPane.style.flex = `0 0 ${percent}%`;
    });
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

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

  return { openNew, openEdit, hide };
}
