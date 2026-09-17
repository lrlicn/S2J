# S2J — Simple to Java

> 以简单易懂的方式学 Java，用代码示例驱动的现代化教程站

## 项目简介

S2J（Simple to Java）是一个 Java 学习教程站，覆盖 Java 基础、Spring 生态与 Java AI 应用开发。

S 代表 **Simple**——这是我们的初心：用最直白的语言讲解概念，用最精简的代码演示原理，用最清晰的结构组织知识。

### 核心理念

- **示例驱动**：每个知识点都配有完整可运行的代码示例
- **简单至上**：不堆术语，不绕理论，把复杂概念讲明白
- **Java AI 前沿**：系统覆盖 Spring AI、LangChain4j 等 Java AI 技术栈
- **无广告干扰**：专注学习体验，内容纯净

## 技术栈

| 技术                                          | 用途                |
| --------------------------------------------- | ------------------- |
| [Astro](https://astro.build/) 5.x             | 静态站点生成框架    |
| [Tailwind CSS](https://tailwindcss.com/) 3.x  | 原子化 CSS 框架     |
| [MDX](https://mdxjs.com/)                     | Markdown + 组件     |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全            |
| [Shiki](https://shiki.style/)                 | 代码语法高亮        |

## 项目结构

```
S2J/
├── src/
│   ├── components/          # 前台可复用组件
│   │   └── admin/          # 管理后台视图组件
│   ├── content/             # 内容集合（Content Collections）
│   │   ├── config.ts        # 内容集合 Schema 定义
│   │   └── docs/            # 所有文档内容（MDX）
│   ├── layouts/             # 布局组件
│   ├── pages/               # 页面路由
│   │   ├── index.astro      # 首页
│   │   ├── about.astro      # 关于页
│   │   ├── admin/           # 管理后台（仅 dev 可用）
│   │   └── docs/            # 文档相关页面
│   ├── scripts/admin/       # 管理后台前端脚本（ES 模块）
│   └── styles/              # 全局样式
├── plugins/
│   └── admin-api.mjs       # 管理后台 API（仅 dev，生产构建不含）
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 18.17.0（推荐 20.x 或 22.x）

### 安装与启动

```bash
npm install
npm run dev
```

访问 http://localhost:4321 查看网站。

### 管理后台

开发模式下访问 http://localhost:4321/admin ，可以：

- 新建 / 编辑 / 删除文章
- 导入本地 `.md` / `.mdx` 文件
- 草稿、发布、精选标记

> 注意：管理后台是 Astro dev 插件，**只在开发模式下可用**。生产构建是纯静态站，不包含后台；线上内容通过本地写 MDX 后重新部署更新。

### 构建与预览

```bash
npm run build     # 产物输出到 dist/
npm run preview   # 本地预览生产构建
```

## 内容创作

在 `src/content/docs/` 对应分类目录下创建 `.mdx` 文件：

```mdx
---
title: '文章标题'
description: '文章描述，用于 SEO 和列表展示'
category: 'java-basics'  # java-basics / spring / java-ai / tools / other
tags: ['标签1', '标签2']
published: true
draft: false
pubDate: 2026-09-01
order: 1                # 数字越小越靠前
featured: false
---

文章正文...
```

分类与字段说明见 [`src/content/config.ts`](src/content/config.ts)。

## 部署

Astro 输出纯静态文件，可部署到任何静态托管：

- **Vercel / Netlify / Cloudflare Pages**：连接 GitHub 仓库，构建命令 `npm run build`，输出目录 `dist`
- **GitHub Pages / 对象存储 / Nginx**：直接上传 `dist/` 目录

## 学习路线

- **Java 基础**：语法、面向对象、集合、并发、JVM
- **Spring 生态**：Spring Boot、Spring Cloud、数据访问、微服务
- **Java AI**：Spring AI、LangChain4j、RAG、AI Agent

## 链接

- GitHub：[https://github.com/lrlicn/S2J](https://github.com/lrlicn/S2J)

## 许可证

MIT License
