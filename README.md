# S2J - Sample Java

> 以交互式代码示例驱动的现代化 Java 学习网站

## 项目简介

S2J（Sample Java）是一个以代码示例为核心的 Java 学习网站，覆盖 Java 基础、Spring 生态与 Java AI 应用开发。

### 核心理念

- **示例驱动**：每个知识点都配有完整可运行的代码示例
- **现代化体验**：基于 Astro + Tailwind CSS + MDX 构建，界面简洁美观
- **Java AI 前沿**：系统覆盖 Spring AI、LangChain4j 等 Java AI 技术栈
- **无广告干扰**：专注学习体验，内容纯净

## 技术栈

| 技术                                          | 用途                | 版本   |
| --------------------------------------------- | ------------------- | ------ |
| [Astro](https://astro.build/)                 | 静态站点生成框架    | 5.x    |
| [Tailwind CSS](https://tailwindcss.com/)      | 原子化 CSS 框架     | 3.x    |
| [MDX](https://mdxjs.com/)                     | Markdown + JSX 组件 | -      |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全            | strict |
| [Shiki](https://shiki.style/)                 | 代码语法高亮        | -      |

## 项目结构

```
S2J/
├── src/
│   ├── components/          # 可复用组件
│   │   └── Tag.astro
│   ├── content/             # 内容集合（Content Collections）
│   │   ├── config.ts        # 内容集合 Schema 定义
│   │   └── docs/            # 所有文档内容（MDX）
│   │       ├── java-basics/ # Java 基础分类
│   │       └── java-ai/     # Java AI 分类
│   ├── layouts/             # 布局组件
│   │   └── Layout.astro     # 全局基础布局
│   ├── pages/               # 页面路由
│   │   ├── index.astro      # 首页
│   │   └── docs/            # 文档相关页面
│   │       ├── index.astro  # 文档列表页
│   │       └── [...slug].astro  # 文档详情动态路由
│   └── styles/              # 全局样式
│       └── global.css
├── astro.config.mjs         # Astro 配置
├── tailwind.config.mjs      # Tailwind 配置
├── tsconfig.json            # TypeScript 配置
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 18.17.0（推荐 20.x 或 22.x）
- npm >= 9.x 或 pnpm >= 8.x

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:4321 查看网站。

### 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 预览生产构建

```bash
npm run preview
```

## 内容创作指南

### 新建文档

在 `src/content/docs/` 下对应的分类目录中创建 `.mdx` 文件：

```mdx
---
title: '文章标题'
description: '文章描述，用于 SEO 和列表展示'
category: 'java-basics' # 分类：java-basics / spring / java-ai / tools / other
tags: ['标签1', '标签2']
published: true
draft: false
pubDate: 2026-09-01
author: 'S2J'
order: 1 # 排序，数字越小越靠前
featured: false
---

文章正文内容，支持 Markdown 和 MDX 组件...
```

### Frontmatter 字段说明

| 字段          | 类型     | 必填 | 说明                   |
| ------------- | -------- | ---- | ---------------------- |
| `title`       | string   | 是   | 文章标题               |
| `description` | string   | 是   | 文章描述               |
| `category`    | enum     | 否   | 分类，默认 `other`     |
| `tags`        | string[] | 否   | 标签列表               |
| `published`   | boolean  | 否   | 是否发布，默认 `true`  |
| `draft`       | boolean  | 否   | 是否草稿，默认 `false` |
| `pubDate`     | date     | 否   | 发布日期               |
| `updatedDate` | date     | 否   | 更新日期               |
| `author`      | string   | 否   | 作者，默认 `S2J`       |
| `order`       | number   | 否   | 排序，默认 `999`       |
| `featured`    | boolean  | 否   | 是否精选，默认 `false` |

### MDX 用法

在 `.mdx` 文件中可以直接使用 Astro 组件：

```mdx
import { Tag } from '../../../components/Tag.astro';

<Tag text="示例标签" color="brand" />

普通 Markdown 内容...
```

## 部署

### Vercel（推荐）

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 构建命令：`npm run build`
4. 输出目录：`dist`
5. 部署完成

### Cloudflare Pages

1. 连接 GitHub 仓库
2. 构建命令：`npm run build`
3. 输出目录：`dist`

### 静态托管

构建后的 `dist/` 目录是纯静态文件，可以部署到任何静态托管服务：

- GitHub Pages
- Netlify
- 阿里云 OSS / 腾讯云 COS
- Nginx 服务器

## 学习路线

### Java 基础

- 语法基础、面向对象、集合框架
- 并发编程、JVM 原理、性能调优

### Spring 生态

- Spring Boot、Spring Cloud
- 数据访问、安全认证、微服务架构

### Java AI

- Spring AI、LangChain4j
- RAG 检索增强、AI Agent 开发
- 本地大模型集成

## 许可证

MIT License

## 联系方式

- GitHub: [你的 GitHub 地址]
- 邮箱: [你的邮箱]

---

**S2J - Sample Java. 用代码示例学 Java.**
