// ============================================
// Markdown 编辑器的文本行为：
// 工具栏插入、包裹/行级格式切换、格式检测（工具栏高亮）、
// 快捷键（Ctrl+B/I/K、Ctrl+Alt+1/2/3）、回车自动续列表。
// 只负责改动 textarea 文本；预览 / 字数 / 草稿由 editor.js 监听 input 处理。
// ============================================

const WRAP_MARKERS = { bold: '**', italic: '*', strikethrough: '~~', code: '`' };

export function initMarkdownEditor({ textarea, toolbar, uploadImage }) {
  let savedSelection = null;

  // ---------- 通用小浮层（链接 / 图片 / 表格） ----------
  // fields: [{ key, label, type: 'text'|'select'|'file', value?, placeholder?, options? }]
  // resolve: 确认时为 { key: value }；取消/关闭时为 null
  function openPopover({ title, fields, confirmText = '插入' }) {
    return new Promise((resolve) => {
      const popover = document.getElementById('md-popover');
      const card = document.getElementById('md-popover-card');
      const body = document.getElementById('md-popover-body');
      const titleEl = document.getElementById('md-popover-title');
      const confirmBtn = document.getElementById('md-popover-confirm');
      const cancelBtn = document.getElementById('md-popover-cancel');
      const overlay = document.getElementById('md-popover-overlay');
      if (!popover) { resolve(null); return; }

      titleEl.textContent = title;
      confirmBtn.textContent = confirmText;
      body.innerHTML = '';
      const inputs = {};
      let inlineRow = null; // 连续 inline 字段共用一个 flex 行

      fields.forEach((f) => {
        const label = document.createElement('label');
        const cap = document.createElement('span');
        cap.className = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5';
        cap.textContent = f.label;
        let el;
        if (f.type === 'select') {
          el = document.createElement('select');
          (f.options || []).forEach((opt) => {
            const o = document.createElement('option');
            o.value = String(opt);
            o.textContent = `${opt}`;
            if (Number(opt) === Number(f.value)) o.selected = true;
            el.appendChild(o);
          });
          el.className = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500';
        } else if (f.type === 'number') {
          el = document.createElement('input');
          el.type = 'number';
          el.value = f.value;
          if (f.min != null) el.min = f.min;
          if (f.max != null) el.max = f.max;
          el.className = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500';
        } else if (f.type === 'file') {
          el = document.createElement('input');
          el.type = 'file';
          el.accept = 'image/*';
          el.className = 'block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300 file:cursor-pointer cursor-pointer';
        } else {
          el = document.createElement('input');
          el.type = 'text';
          el.value = f.value || '';
          el.placeholder = f.placeholder || '';
          el.className = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500';
        }
        inputs[f.key] = el;
        label.className = f.inline ? 'block flex-1 min-w-0' : 'block';
        label.append(cap, el);
        if (f.inline) {
          if (!inlineRow) {
            inlineRow = document.createElement('div');
            inlineRow.className = 'flex gap-3';
            body.appendChild(inlineRow);
          }
          inlineRow.appendChild(label);
        } else {
          inlineRow = null;
          body.appendChild(label);
        }
      });

      function collect() {
        const values = {};
        for (const [k, el] of Object.entries(inputs)) {
          values[k] = el.type === 'file' ? el.files[0] : el.value;
        }
        return values;
      }

      function cleanup() {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onDocKeydown, true);
      }
      function close(result) {
        card.classList.add('scale-95', 'opacity-0');
        card.classList.remove('scale-100', 'opacity-100');
        popover.classList.add('hidden');
        popover.classList.remove('flex');
        cleanup();
        resolve(result);
      }
      function onConfirm() { close(collect()); }
      function onCancel() { close(null); }
      // 浮层打开期间：document 捕获阶段拦截 Esc / Enter（不冒泡到编辑器全局快捷键）
      function onDocKeydown(e) {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onCancel(); }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') {
          e.stopPropagation(); e.preventDefault(); onConfirm();
        }
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onCancel);
      document.addEventListener('keydown', onDocKeydown, true);

      popover.classList.remove('hidden');
      popover.classList.add('flex');
      requestAnimationFrame(() => {
        card.classList.remove('scale-95', 'opacity-0');
        card.classList.add('scale-100', 'opacity-100');
      });
      const first = body.querySelector('input[type="text"], select');
      setTimeout(() => first?.focus(), 60);
    });
  }

  // 插入文本（优先 execCommand 保留撤销历史）
  function insertText(text, selectMode = 'end') {
    textarea.focus();
    if (savedSelection) {
      textarea.setSelectionRange(savedSelection.start, savedSelection.end);
    }

    let success = false;
    try {
      success = document.execCommand('insertText', false, text);
    } catch {
      success = false;
    }

    if (!success) {
      try {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.setRangeText(text, start, end, selectMode);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value =
          textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function getCurrentLine() {
    const text = textarea.value;
    const pos = textarea.selectionStart;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    let lineEnd = text.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = text.length;
    return { text: text.substring(lineStart, lineEnd), start: lineStart, end: lineEnd };
  }

  function isWrappedFormat(format) {
    const marker = WRAP_MARKERS[format];
    if (!marker) return false;
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const selected = text.substring(start, end);
      return (
        selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2
      );
    }

    if (format === 'italic') {
      const before2 = text.substring(Math.max(0, start - 2), start);
      const after2 = text.substring(end, end + 2);
      const before1 = text.substring(Math.max(0, start - 1), start);
      const after1 = text.substring(end, end + 1);
      return before1 === '*' && after1 === '*' && before2 !== '**' && after2 !== '**';
    }

    const before = text.substring(Math.max(0, start - marker.length), start);
    const after = text.substring(end, end + marker.length);
    return before === marker && after === marker;
  }

  function isLineFormat(format) {
    const line = getCurrentLine().text;
    switch (format) {
      case 'h1': return /^#\s/.test(line);
      case 'h2': return /^##\s/.test(line);
      case 'h3': return /^###\s/.test(line);
      case 'quote': return /^>\s?/.test(line);
      case 'ul': return /^[-*]\s/.test(line);
      case 'ol': return /^\d+\.\s/.test(line);
      default: return false;
    }
  }

  function updateToolbarActive() {
    const formats = ['bold', 'italic', 'strikethrough', 'code', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol'];
    formats.forEach((format) => {
      const btn = toolbar?.querySelector(`button[data-md="${format}"]`);
      if (!btn) return;
      btn.classList.toggle('toolbar-active', isWrappedFormat(format) || isLineFormat(format));
    });
  }

  async function insertMarkdown(type) {
    textarea.focus();

    let start;
    let end;
    if (savedSelection) {
      start = savedSelection.start;
      end = savedSelection.end;
      textarea.setSelectionRange(start, end);
      savedSelection = null;
    } else {
      start = textarea.selectionStart;
      end = textarea.selectionEnd;
    }
    const selected = textarea.value.substring(start, end);
    const hasSelection = start !== end;

    // ===== 行级格式 =====
    const linePrefixes = {
      h1: '# ', h2: '## ', h3: '### ',
      quote: '> ', ul: '- ', ol: '1. ',
    };
    if (linePrefixes[type]) {
      const prefix = linePrefixes[type];

      if (isLineFormat(type) && !hasSelection) {
        const line = getCurrentLine();
        let newLine = line.text;
        if (type === 'ul') {
          newLine = newLine.replace(/^[-*]\s/, '');
        } else if (type === 'ol') {
          newLine = newLine.replace(/^\d+\.\s/, '');
        } else {
          newLine = newLine.replace(
            new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
            ''
          );
        }
        textarea.setSelectionRange(line.start, line.end);
        insertText(newLine);
        setTimeout(updateToolbarActive, 10);
        return;
      }

      if (hasSelection && selected.includes('\n')) {
        const lines = selected.split('\n');
        let olIndex = 1;
        const newText = lines
          .map((line) => {
            if (line.trim() === '') return line;
            if (type === 'ol') return `${olIndex++}. ${line}`;
            return prefix + line;
          })
          .join('\n');
        insertText(newText);
        setTimeout(updateToolbarActive, 10);
        return;
      }

      const placeholder = type.startsWith('h') ? '标题文字' : type === 'quote' ? '引用文字' : '列表项';
      const insert = prefix + (selected || placeholder);
      insertText(insert);
      setTimeout(() => {
        textarea.setSelectionRange(start + insert.length, start + insert.length);
        updateToolbarActive();
      }, 0);
      return;
    }

    // ===== 包裹型格式 =====
    const wrapTypes = {
      bold: { before: '**', after: '**', placeholder: '加粗文字' },
      italic: { before: '*', after: '*', placeholder: '斜体文字' },
      strikethrough: { before: '~~', after: '~~', placeholder: '删除线文字' },
      code: { before: '`', after: '`', placeholder: '代码' },
    };
    if (wrapTypes[type]) {
      const a = wrapTypes[type];
      const simpleWrap = ['bold', 'italic', 'strikethrough', 'code'].includes(type);

      if (simpleWrap && hasSelection && isWrappedFormat(type)) {
        const inner = selected.substring(a.before.length, selected.length - a.after.length);
        insertText(inner);
        setTimeout(updateToolbarActive, 10);
        return;
      }

      const insert = a.before + (selected || a.placeholder) + a.after;
      insertText(insert);
      setTimeout(() => {
        if (!hasSelection) {
          textarea.setSelectionRange(
            start + a.before.length,
            start + a.before.length + a.placeholder.length
          );
        } else {
          textarea.setSelectionRange(start + insert.length, start + insert.length);
        }
        updateToolbarActive();
      }, 0);
      return;
    }

    // ===== 链接：弹出小框填文字 + 网址 =====
    if (type === 'link') {
      const v = await openPopover({
        title: '插入链接',
        confirmText: '插入链接',
        fields: [
          { key: 'text', label: '链接文字', type: 'text', value: selected, placeholder: '要显示的文字' },
          { key: 'url', label: '网址', type: 'text', placeholder: 'https://example.com' },
        ],
      });
      if (!v) return;
      const text = (v.text || '').trim() || '链接文字';
      const url = (v.url || '').trim() || 'https://';
      insertText(`[${text}](${url})`);
      return;
    }

    // ===== 图片：本地上传（走已有上传逻辑）或外链 URL =====
    if (type === 'image') {
      const v = await openPopover({
        title: '插入图片',
        confirmText: '插入',
        fields: [
          { key: 'file', label: '选择本地图片（自动上传）', type: 'file' },
          { key: 'url', label: '或粘贴图片链接', type: 'text', placeholder: 'https://...' },
        ],
      });
      if (!v) return;
      if (v.file) {
        uploadImage?.(v.file);
        return;
      }
      const url = (v.url || '').trim();
      if (url) insertText(`![图片](${url})`);
      return;
    }

    if (type === 'codeblock') {
      const lang = 'java';
      const code = selected || '// 代码';
      const insert = `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
      insertText(insert);
      setTimeout(() => {
        const langStart = start + 4; // \n``` = 4 字符
        textarea.setSelectionRange(langStart, langStart + lang.length);
      }, 0);
      return;
    }

    if (type === 'table') {
      const v = await openPopover({
        title: '插入表格',
        confirmText: '插入表格',
        fields: [
        { key: 'cols', label: '列', type: 'number', value: 3, min: 1, max: 10, inline: true },
        { key: 'rows', label: '行', type: 'number', value: 4, min: 1, max: 20, inline: true },
      ],
      });
      if (!v) return;
      const clamp = (n, min, max, fallback) => {
        const num = parseInt(n, 10);
        if (Number.isNaN(num)) return fallback;
        return Math.max(min, Math.min(max, num));
      };
      const cols = clamp(v.cols, 1, 10, 3);
      const rows = clamp(v.rows, 1, 20, 4);
      // 等宽对齐：每格统一列宽（默认 3），空单元格用空格补齐，竖线垂直对齐
      const w = 3;
      const row = (fill) =>
        `|${Array(cols).fill(fill).map((f) => ` ${String(f).padEnd(w)} `).join('|')}|`;
      insertText(`\n${row('')}\n${row('---')}\n${Array(rows).fill(row('')).join('\n')}\n`);
      return;
    }
    if (type === 'hr') {
      insertText('\n---\n');
    }
  }

  // ===== 工具栏：mousedown 保存选区，click 执行 =====
  toolbar?.querySelectorAll('button[data-md]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      savedSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
    });
    btn.addEventListener('click', () => insertMarkdown(btn.dataset.md));
  });

  textarea.addEventListener('keyup', updateToolbarActive);
  textarea.addEventListener('select', updateToolbarActive);
  textarea.addEventListener('click', updateToolbarActive);
  textarea.addEventListener('input', () => setTimeout(updateToolbarActive, 10));

  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); insertMarkdown('bold'); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); insertMarkdown('italic'); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.shiftKey) { e.preventDefault(); insertMarkdown('link'); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K') { e.preventDefault(); insertMarkdown('codeblock'); }
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '1') { e.preventDefault(); insertMarkdown('h1'); }
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '2') { e.preventDefault(); insertMarkdown('h2'); }
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '3') { e.preventDefault(); insertMarkdown('h3'); }

    // 回车自动续列表 / 引用
    if (e.key === 'Enter' && !e.shiftKey) {
      const pos = textarea.selectionStart;
      const text = textarea.value;
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
      const lineText = text.substring(lineStart, pos);

      const ulMatch = lineText.match(/^([-*])\s/);
      const olMatch = lineText.match(/^(\d+)\.\s/);
      const quoteMatch = lineText.match(/^>\s?/);

      if (ulMatch || olMatch || quoteMatch) {
        const prefix = ulMatch ? ulMatch[0] : olMatch ? olMatch[0] : quoteMatch[0];
        // 当前行只有前缀 → 退出列表
        if (lineText.trim() === prefix.trim()) {
          e.preventDefault();
          textarea.setRangeText('', lineStart, pos, 'end');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        e.preventDefault();
        let nextPrefix = '';
        if (ulMatch) nextPrefix = ulMatch[1] + ' ';
        else if (olMatch) nextPrefix = parseInt(olMatch[1], 10) + 1 + '. ';
        else if (quoteMatch) nextPrefix = '> ';
        textarea.setRangeText('\n' + nextPrefix, pos, pos, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  return { insertText, insertMarkdown, updateToolbarActive };
}
