#!/usr/bin/env node
/**
 * S2J 新建文章交互式脚本
 * 用法: npm run new:post
 * 
 * 功能：
 * - 交互式输入文章信息
 * - 自动生成完整的 frontmatter 模板
 * - 自动创建分类目录和 MDX 文件
 * - 防止覆盖已有文件
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { mkdir, writeFile, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// 分类列表（与 src/config/categories.ts 保持一致）
const categories = [
  { id: 'java-basics', name: 'Java 基础' },
  { id: 'spring', name: 'Spring 生态' },
  { id: 'java-ai', name: 'Java AI' },
  { id: 'tools', name: '开发工具' },
  { id: 'other', name: '其他' },
];

const rl = createInterface({ input, output });

console.log('\n╔══════════════════════════════════════╗');
console.log('║       S2J 新建文章向导                ║');
console.log('╚══════════════════════════════════════╝\n');

// 1. 标题
const title = (await rl.question('① 文章标题: ')).trim();
if (!title) {
  console.error('❌ 标题不能为空');
  process.exit(1);
}

// 2. Slug
const suggestedSlug = title
  .toLowerCase()
  .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .substring(0, 60);

const slug = ((await rl.question(`② 文章 slug (URL路径，建议英文/拼音，回车使用默认: ${suggestedSlug || 'new-post'}): `)).trim()) || suggestedSlug || 'new-post';

// 3. 分类
console.log('\n③ 选择分类:');
categories.forEach((c, i) => console.log(`   ${i + 1}. ${c.name} (${c.id})`));
const categoryInput = (await rl.question('   分类编号 (默认 1): ')).trim();
const categoryIdx = parseInt(categoryInput) || 1;
const category = categories[Math.max(0, Math.min(categoryIdx - 1, categories.length - 1))];

// 4. 标签
const tagsInput = (await rl.question('\n④ 标签 (逗号分隔，可选): ')).trim();
const tags = tagsInput ? tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

// 5. 描述
const description = ((await rl.question('\n⑤ 文章描述 (可选，回车使用标题): ')).trim()) || title;

// 6. 精选
const featuredInput = (await rl.question('\n⑥ 是否为精选文章? (y/N): ')).trim().toLowerCase();
const featured = featuredInput === 'y' || featuredInput === 'yes';

// 确认信息
console.log('\n╔══════════════════════════════════════╗');
console.log('║           确认文章信息                 ║');
console.log('╠══════════════════════════════════════╣');
console.log(`║ 标题:   ${title}`);
console.log(`║ Slug:   ${slug}`);
console.log(`║ 分类:   ${category.name} (${category.id})`);
console.log(`║ 标签:   ${tags.length ? tags.join(', ') : '无'}`);
console.log(`║ 描述:   ${description.length > 30 ? description.substring(0, 30) + '...' : description}`);
console.log(`║ 精选:   ${featured ? '是' : '否'}`);
console.log('╚══════════════════════════════════════╝');

const confirm = (await rl.question('\n确认创建? (Y/n): ')).trim().toLowerCase();
if (confirm === 'n' || confirm === 'no') {
  console.log('已取消创建');
  process.exit(0);
}

// 生成 frontmatter
const today = new Date().toISOString().split('T')[0];
const tagsStr = tags.map(t => `"${t}"`).join(', ');

const content = `---
title: "${title}"
description: "${description}"
category: "${category.id}"
tags: [${tagsStr}]
pubDate: ${today}
author: "S2J"
featured: ${featured}
draft: false
published: true
order: 999
keywords: [${tagsStr}]
---

## 概述

在这里写文章概述，简要介绍本文要讲的内容和学习目标。

## 正文

在这里写正文内容。支持 Markdown 和 MDX 语法。

### 代码示例

\`\`\`java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, S2J!");
    }
}
\`\`\`

### 要点说明

- 要点一
- 要点二
- 要点三

## 常见坑点

1. 坑点一：描述
2. 坑点二：描述

## 最佳实践

在这里总结最佳实践和经验。

## 小结

在这里写文章小结，回顾核心要点。

> **下一篇预告**：[下一篇文章标题](/docs/category/slug)
`;

const filePath = join(projectRoot, 'src', 'content', 'docs', category.id, `${slug}.mdx`);

// 确保目录存在
mkdir(dirname(filePath), { recursive: true }, (err) => {
  if (err) {
    console.error('❌ 创建目录失败:', err.message);
    process.exit(1);
  }

  // 检查文件是否已存在
  if (existsSync(filePath)) {
    console.error(`\n❌ 文件已存在: ${filePath}`);
    console.error('请使用不同的 slug，或手动删除已有文件后重试。');
    process.exit(1);
  }

  writeFile(filePath, content, 'utf8', (err) => {
    if (err) {
      console.error('❌ 写入文件失败:', err.message);
      process.exit(1);
    }

    console.log('\n✅ 文章创建成功!\n');
    console.log(`📄 文件路径: src/content/docs/${category.id}/${slug}.mdx`);
    console.log(`🌐 访问地址: /docs/${category.id}/${slug}`);
    console.log(`\n📝 下一步: 用编辑器打开上述文件，编写正文内容。`);
    console.log(`🔄 开发服务器会自动热更新，刷新浏览器即可预览。\n`);

    rl.close();
  });
});
