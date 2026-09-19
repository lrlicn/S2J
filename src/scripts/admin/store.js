// 跨模块共享的轻量状态（原生 JS，不引入响应式框架）

export const store = {
  // ---- 文章列表 ----
  posts: [],
  filterTab: 'all', // all | published | draft | featured
  page: 1,
  filteredCount: 0, // 当前筛选条件下的文章数（供分页跳转使用）

  // ---- 多选推送模式 ----
  pushMode: false, // 是否为推送选择模式
  selectedSlugs: new Set(), // 选中的文章 slug 集合

  // ---- 编辑器 ----
  editingSlug: null, // 正在编辑文章的完整 slug（category/filename）；新建时为 null
  editorTags: [],
  slugManuallyEdited: false,
  hasUnsavedChanges: false,
};

export function resetEditorState() {
  store.editingSlug = null;
  store.editorTags = [];
  store.slugManuallyEdited = false;
  store.hasUnsavedChanges = false;
}
