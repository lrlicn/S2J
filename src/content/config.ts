import { defineCollection, z } from 'astro:content';

// 文档集合 - 所有学习内容
const docs = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      // 基础信息
      title: z.string().describe('文章标题'),
      description: z.string().describe('文章描述，用于 SEO 和列表展示'),

      // 分类与标签
      category: z
        .enum(['java-basics', 'spring', 'java-ai', 'tools', 'other'])
        .default('other')
        .describe('内容分类'),
      tags: z.array(z.string()).default([]).describe('标签列表'),

      // 发布状态
      published: z.boolean().default(true).describe('是否发布'),
      draft: z.boolean().default(false).describe('是否为草稿'),

      // 时间
      pubDate: z.coerce.date().optional().describe('发布日期'),
      updatedDate: z.coerce.date().optional().describe('更新日期'),

      // 作者
      author: z.string().default('S2J').describe('作者'),

      // 排序与展示
      order: z.number().default(999).describe('在分类中的排序，数字越小越靠前'),
      chapter: z.string().optional().describe('所属章节，用于分组折叠展示'),
      featured: z.boolean().default(false).describe('是否为精选文章'),

      // 封面图（可选）
      cover: image().optional().describe('封面图片'),
      coverAlt: z.string().optional().describe('封面图片描述'),

      // 元信息
      keywords: z.array(z.string()).default([]).describe('SEO 关键词'),
    }),
});

// 示例代码集合（后续可扩展，用于管理独立的代码示例）
const samples = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    language: z.enum(['java', 'xml', 'yaml', 'properties', 'sql', 'bash']).default('java'),
    relatedDoc: z.string().optional().describe('关联的文档 slug'),
  }),
});

export const collections = {
  docs,
  samples,
};
