/**
 * 站点分类配置中心
 * 所有分类的元数据集中管理，避免在多个页面中重复硬编码
 */

export interface CategoryMeta {
  /** 分类标识（与 content/config.ts 中的 enum 对应） */
  id: string;
  /** 分类显示名称 */
  name: string;
  /** 分类描述 */
  description: string;
  /** 分类图标（单字符或短文本） */
  icon: string;
  /** 渐变背景色（Tailwind gradient 类） */
  gradient: string;
  /** 淡背景色（用于页面背景和卡片背景，含亮色/暗色模式） */
  lightBg: string;
  /** 标签颜色类 */
  tagColor: string;
  /** 导航排序（数字越小越靠前） */
  navOrder: number;
}

export const categories: CategoryMeta[] = [
  {
    id: 'java-basics',
    name: 'Java 基础',
    description: '语法基础、面向对象、集合框架、并发编程、JVM 原理。夯实 Java 基本功。',
    icon: 'J',
    gradient: 'from-brand-600 to-brand-400',
    lightBg: 'bg-brand-50/70 dark:bg-brand-900/25',
    tagColor: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300',
    navOrder: 1,
  },
  {
    id: 'spring',
    name: 'Spring 生态',
    description: 'Spring Boot、Spring Cloud、数据访问、安全认证、微服务架构。掌握企业级 Java 开发核心技术栈。',
    icon: 'S',
    gradient: 'from-green-500 to-emerald-600',
    lightBg: 'bg-green-50/70 dark:bg-green-900/25',
    tagColor: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    navOrder: 2,
  },
  {
    id: 'java-ai',
    name: 'Java AI',
    description: 'Spring AI、LangChain4j、RAG 检索增强、AI Agent 开发。用 Java 构建下一代智能应用。',
    icon: 'AI',
    gradient: 'from-violet-500 to-purple-600',
    lightBg: 'bg-violet-50/70 dark:bg-violet-900/25',
    tagColor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    navOrder: 3,
  },
  {
    id: 'tools',
    name: '开发工具',
    description: 'IDE 配置、构建工具、版本控制、调试技巧。提升开发效率的实用工具和技巧。',
    icon: 'T',
    gradient: 'from-sky-500 to-blue-600',
    lightBg: 'bg-sky-50/70 dark:bg-sky-900/25',
    tagColor: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    navOrder: 4,
  },
  {
    id: 'other',
    name: '其他',
    description: '其他相关技术内容。',
    icon: '?',
    gradient: 'from-slate-500 to-slate-600',
    lightBg: 'bg-slate-50/70 dark:bg-slate-800/40',
    tagColor: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    navOrder: 99,
  },
];

/** 按 id 查找分类元数据 */
export function getCategoryById(id: string): CategoryMeta | undefined {
  return categories.find((c) => c.id === id);
}

/** 按导航排序返回分类列表（用于导航菜单） */
export function getNavCategories(): CategoryMeta[] {
  return [...categories].sort((a, b) => a.navOrder - b.navOrder);
}

/** 分类 id 到名称的映射（用于侧边栏等简单场景） */
export const categoryNames: Record<string, string> = Object.fromEntries(
  categories.map((c) => [c.id, c.name])
);
