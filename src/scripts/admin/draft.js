// 编辑器本地草稿（localStorage）。本模块只负责存取，表单填充由 editor 模块完成。

import { DRAFT_KEY } from './config.js';

export function saveDraft(data) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasDraft() {
  try {
    return !!localStorage.getItem(DRAFT_KEY);
  } catch {
    return false;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
