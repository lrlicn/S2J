// Admin 后台共享常量

export const CATEGORY_NAMES = {
  'java-basics': 'Java 基础',
  spring: 'Spring 生态',
  'java-ai': 'Java AI',
  tools: '开发工具',
  other: '其他',
};

export const CATEGORY_VALUES = Object.keys(CATEGORY_NAMES);

export const PAGE_SIZE = 20;

// localStorage / sessionStorage 键名
export const DRAFT_KEY = 's2j_admin_draft';
export const PREVIEW_STORAGE_KEY = 's2j_preview_data';

// 路由路径
export const ROUTE_HOME = '/home';
export const ROUTE_POSTS = '/posts';
