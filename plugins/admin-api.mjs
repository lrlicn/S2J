import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
/**
 * S2J Admin API Vite 插件
 * 仅在开发模式下提供文章管理 API，不影响生产构建
 */
export default function adminApiPlugin() {
  const CONTENT_DIR = join(process.cwd(), 'src', 'content', 'docs');
  const UPLOAD_DIR = join(process.cwd(), 'public', 'images');
  const CATEGORIES = ['java-basics', 'spring', 'java-ai', 'tools', 'other'];

  // 简单的 frontmatter 解析
  function parseFrontmatter(content) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return { data: {}, body: content };
    return { data: parseYaml(match[1]), body: match[2] };
  }

  function parseYaml(raw) {
    const data = {};
    for (const line of raw.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) continue;
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(Number(value)) && value !== '') value = Number(value);
      else value = value.replace(/^["']|["']$/g, '');
      data[key] = value;
    }
    return data;
  }

  // 序列化 frontmatter
  function stringifyFrontmatter(data, body) {
    const lines = ['---'];
    const order = ['title', 'description', 'category', 'tags', 'pubDate', 'updatedDate', 'author', 'featured', 'draft', 'published', 'order', 'keywords'];
    for (const key of order) {
      if (data[key] !== undefined && data[key] !== null) {
        lines.push(formatYamlField(key, data[key]));
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (!order.includes(key) && value !== undefined && value !== null) {
        lines.push(formatYamlField(key, value));
      }
    }
    lines.push('---', '');
    return lines.join('\n') + body;
  }

  function formatYamlField(key, value) {
    if (Array.isArray(value)) return `${key}: [${value.map((v) => `"${v}"`).join(', ')}]`;
    if (typeof value === 'boolean') return `${key}: ${value}`;
    if (typeof value === 'number') return `${key}: ${value}`;
    return `${key}: "${String(value).replace(/"/g, '\\"')}"`;
  }

  function parseSlug(slug) {
    const parts = slug.split('/');
    if (parts.length < 2) return null;
    const category = parts[0];
    const filename = parts.slice(1).join('/');
    if (!CATEGORIES.includes(category)) return null;
    return { category, filename, filePath: join(CONTENT_DIR, category, `${filename}.mdx`) };
  }

  function sendJson(res, status, data) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  return {
    name: 's2j-admin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');

        // 只处理 /admin/api 路径
        if (!url.pathname.startsWith('/admin/api')) return next();

        try {
          // GET /admin/api/posts — 获取文章列表
          if (url.pathname === '/admin/api/posts' && req.method === 'GET') {
            const posts = [];
            for (const category of CATEGORIES) {
              const categoryDir = join(CONTENT_DIR, category);
              try {
                await stat(categoryDir);
              } catch {
                continue;
              }
              const files = (await readdir(categoryDir)).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
              for (const file of files) {
                const content = await readFile(join(categoryDir, file), 'utf-8');
                const { data } = parseFrontmatter(content);
                const slug = file.replace(/\.(mdx|md)$/, '');
                posts.push({
                  slug: `${category}/${slug}`,
                  category,
                  title: data.title || slug,
                  description: data.description || '',
                  tags: Array.isArray(data.tags) ? data.tags : [],
                  pubDate: data.pubDate || null,
                  author: data.author || 'S2J',
                  featured: data.featured === true,
                  draft: data.draft === true,
                  published: data.published !== false,
                  order: typeof data.order === 'number' ? data.order : 999,
                });
              }
            }
            posts.sort((a, b) => {
              if (a.category !== b.category) return a.category.localeCompare(b.category);
              return a.order - b.order;
            });
            return sendJson(res, 200, { posts, total: posts.length });
          }

          // GET /admin/api/post?slug=... — 获取单篇文章
          if (url.pathname === '/admin/api/post' && req.method === 'GET') {
            const slug = url.searchParams.get('slug');
            if (!slug) return sendJson(res, 400, { error: '缺少 slug 参数' });
            const parsed = parseSlug(slug);
            if (!parsed) return sendJson(res, 400, { error: '无效的 slug' });
            try {
              const content = await readFile(parsed.filePath, 'utf-8');
              const { data, body } = parseFrontmatter(content);
              return sendJson(res, 200, { slug, ...data, body });
            } catch {
              return sendJson(res, 404, { error: '文章不存在' });
            }
          }

          // POST /admin/api/post — 创建文章
          if (url.pathname === '/admin/api/post' && req.method === 'POST') {
            const body = await readBody(req);
            const { slug, title, description, category, tags = [], pubDate, author = 'S2J', featured = false, draft = false, published = true, order = 999, content = '' } = body;
            if (!slug || !title || !category) return sendJson(res, 400, { error: '缺少必填字段' });
            if (!CATEGORIES.includes(category)) return sendJson(res, 400, { error: '无效的分类' });
            const filePath = join(CONTENT_DIR, category, `${slug}.mdx`);
            try {
              await stat(filePath);
              return sendJson(res, 409, { error: '文章已存在' });
            } catch {
              // 文件不存在，继续
            }
            await mkdir(dirname(filePath), { recursive: true });
            const data = { title, description: description || title, category, tags, pubDate: pubDate || new Date().toISOString().split('T')[0], author, featured, draft, published, order, keywords: tags };
            const fileContent = stringifyFrontmatter(data, content || '## 概述\n\n在这里写文章概述...\n\n## 正文\n\n在这里写正文...\n');
            await writeFile(filePath, fileContent, 'utf-8');
            return sendJson(res, 201, { success: true, slug: `${category}/${slug}` });
          }

          // PUT /admin/api/post — 更新文章
          if (url.pathname === '/admin/api/post' && req.method === 'PUT') {
            const body = await readBody(req);
            const { slug } = body;
            if (!slug) return sendJson(res, 400, { error: '缺少 slug' });
            const parsed = parseSlug(slug);
            if (!parsed) return sendJson(res, 400, { error: '无效的 slug' });
            let existingData, existingBody;
            try {
              const fileContent = await readFile(parsed.filePath, 'utf-8');
              const result = parseFrontmatter(fileContent);
              existingData = result.data;
              existingBody = result.body;
            } catch {
              return sendJson(res, 404, { error: '文章不存在' });
            }
            const updatedData = { ...existingData };
            const fields = ['title', 'description', 'category', 'tags', 'pubDate', 'author', 'featured', 'draft', 'published', 'order'];
            for (const field of fields) {
              if (body[field] !== undefined) updatedData[field] = body[field];
            }
            if (body.tags !== undefined) updatedData.keywords = body.tags;
            const updatedBody = body.content !== undefined ? body.content : existingBody;
            // 如果分类变化，需要移动文件到新分类目录
            const newCategory = body.category || existingData.category;
            const newFilePath = join(CONTENT_DIR, newCategory, `${parsed.filename}.mdx`);
            await mkdir(join(CONTENT_DIR, newCategory), { recursive: true });
            await writeFile(newFilePath, stringifyFrontmatter(updatedData, updatedBody), 'utf-8');
            if (newFilePath !== parsed.filePath) {
              try { await unlink(parsed.filePath); } catch (e) {}
            }
            return sendJson(res, 200, { success: true, slug: `${newCategory}/${parsed.filename}` });
          }

          // DELETE /admin/api/post?slug=... — 删除文章
          if (url.pathname === '/admin/api/post' && req.method === 'DELETE') {
            const slug = url.searchParams.get('slug');
            if (!slug) return sendJson(res, 400, { error: '缺少 slug' });
            const parsed = parseSlug(slug);
            if (!parsed) return sendJson(res, 400, { error: '无效的 slug' });
            try {
              await unlink(parsed.filePath);
              return sendJson(res, 200, { success: true, slug });
            } catch {
              return sendJson(res, 404, { error: '文章不存在或删除失败' });
            }
          }

          // POST /admin/api/upload — 上传图片
          if (url.pathname === '/admin/api/upload' && req.method === 'POST') {
            const body = await readBody(req);
            const { filename, data, ext } = body;
            if (!data) return sendJson(res, 400, { error: '缺少图片数据' });
            try {
              await mkdir(UPLOAD_DIR, { recursive: true });
              const timestamp = Date.now();
              const random = Math.random().toString(36).substring(2, 8);
              const fileExt = ext || (filename ? filename.split('.').pop() : 'png');
              const saveName = `${timestamp}-${random}.${fileExt}`;
              const savePath = join(UPLOAD_DIR, saveName);
              const buffer = Buffer.from(data, 'base64');
              await writeFile(savePath, buffer);
              return sendJson(res, 200, { success: true, url: `/images/${saveName}`, filename: saveName });
            } catch (error) {
              console.error('上传图片失败:', error);
              return sendJson(res, 500, { error: '图片保存失败' });
            }
          }

          // 未匹配的路由
          return sendJson(res, 404, { error: 'API 路由不存在' });
        } catch (error) {
          console.error('Admin API 错误:', error);
          return sendJson(res, 500, { error: '服务器内部错误' });
        }
      });
    },
  };
}
