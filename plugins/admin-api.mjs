import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * S2J Admin API Vite 插件
 * 仅在开发模式下提供文章管理 API，不影响生产构建
 */
export default function adminApiPlugin() {
  const CONTENT_DIR = join(process.cwd(), 'src', 'content', 'docs');
  const UPLOAD_DIR = join(process.cwd(), 'public', 'images');
  const CONFIG_FILE = join(process.cwd(), 'admin-config.json');
  // 推送状态单独存这个文件，避免写回 .mdx 触发 Astro 内容监听、导致 dev server 整页重载
  const PUSH_STATE_FILE = join(process.cwd(), 'admin-push-state.json');
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

  // 计算文章内容哈希（用于判断内容是否有更新）
  // 只计算用户可见的内容字段，排除系统字段，保证哈希稳定
  function calculateContentHash(data, body) {
    const fields = ['title', 'description', 'category', 'tags', 'pubDate', 'updatedDate', 'author', 'featured', 'draft', 'published', 'order', 'keywords', 'chapter'];
    const userData = {};
    for (const key of fields) {
      if (data[key] !== undefined) {
        userData[key] = data[key];
      }
    }
    const str = JSON.stringify(userData) + body;
    return createHash('md5').update(str).digest('hex');
  }

  // 序列化 frontmatter
  function stringifyFrontmatter(data, body) {
    const lines = ['---'];
    const order = ['title', 'description', 'category', 'tags', 'pubDate', 'updatedDate', 'scheduledDate', 'author', 'featured', 'draft', 'published', 'order', 'keywords', 'chapter'];
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

  // GitHub 配置读写
  async function getGithubConfig() {
    try {
      const content = await readFile(CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content);
      return {
        repo: config.repo || '',
        branch: config.branch || 'main',
        tokenConfigured: !!config.token,
      };
    } catch {
      return { repo: '', branch: 'main', tokenConfigured: false };
    }
  }

  async function saveGithubConfig(config) {
    let existing = { repo: '', branch: 'main', token: '' };
    try {
      const content = await readFile(CONFIG_FILE, 'utf-8');
      existing = { ...existing, ...JSON.parse(content) };
    } catch {}

    const newConfig = {
      repo: config.repo || existing.repo,
      branch: config.branch || existing.branch || 'main',
      token: config.token || existing.token,
    };
    await writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
  }

  // 读取独立的推送状态文件（结构：{ "category/slug": { githubPushedAt, pushedContentHash } }）
  async function readPushState() {
    try {
      const content = await readFile(PUSH_STATE_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  // 一次性迁移：把旧版存在 .mdx frontmatter 里的推送状态灌进独立 JSON
  // 只在新 JSON 里还没有这篇文章的数据时写入，不覆盖新逻辑产生的记录
  async function migrateLegacyPushState() {
    try {
      const existing = await readPushState();
      let changed = false;
      for (const category of CATEGORIES) {
        const categoryDir = join(CONTENT_DIR, category);
        try {
          await stat(categoryDir);
        } catch {
          continue;
        }
        const files = (await readdir(categoryDir)).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
        for (const file of files) {
          const slug = `${category}/${file.replace(/\.(mdx|md)$/, '')}`;
          if (existing[slug]) continue;
          const filePath = join(categoryDir, file);
          try {
            const content = await readFile(filePath, 'utf-8');
            const { data } = parseFrontmatter(content);
            if (data.githubPushedAt && data.pushedContentHash) {
              existing[slug] = {
                githubPushedAt: data.githubPushedAt,
                pushedContentHash: data.pushedContentHash,
              };
              changed = true;
            }
          } catch {}
        }
      }
      if (changed) {
        await writeFile(PUSH_STATE_FILE, JSON.stringify(existing, null, 2), 'utf-8');
        console.log('[admin-api] 已迁移旧推送状态到 admin-push-state.json');
      }
    } catch (e) {
      console.error('[admin-api] 迁移推送状态失败:', e);
    }
  }

  // 更新文章的推送时间和内容哈希到独立状态文件（不写回 .mdx，避免触发 Astro 重载）
  async function updatePushTimestamp(filePath, slug) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const { data, body } = parseFrontmatter(content);
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const pushTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const state = await readPushState();
      state[slug] = {
        githubPushedAt: pushTime,
        pushedContentHash: calculateContentHash(data, body),
      };
      await writeFile(PUSH_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('更新推送状态失败:', e);
    }
  }

  // 推送单篇文章到 GitHub
  async function pushPostToGithub(filePath, repo, branch, token) {
    const content = await readFile(filePath, 'utf-8');
    const base64Content = Buffer.from(content, 'utf-8').toString('base64');
    const relativePath = filePath.replace(process.cwd() + '\\', '').replace(/\\/g, '/');

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) throw new Error('仓库格式错误，应为 owner/repo');

    const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${relativePath}`;

    // 先获取文件当前 SHA（如果存在）
    let sha = null;
    try {
      const getRes = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
      }
    } catch {}

    // 创建或更新文件
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `docs: update ${relativePath.split('/').pop()}`,
        content: base64Content,
        branch: branch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`GitHub API 错误: ${putRes.status} ${err}`);
    }

    return putRes.json();
  }

  return {
    name: 's2j-admin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {        const url = new URL(req.url, 'http://localhost');

        if (!url.pathname.startsWith('/admin/api')) return next();

        try {
          // GET /admin/api/posts — 获取文章列表
          if (url.pathname === '/admin/api/posts' && req.method === 'GET') {
            const posts = [];
            const pushState = await readPushState();
            for (const category of CATEGORIES) {
              const categoryDir = join(CONTENT_DIR, category);
              try {
                await stat(categoryDir);
              } catch {
                continue;
              }
              const files = (await readdir(categoryDir)).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
              for (const file of files) {
                const filePath = join(categoryDir, file);
                const content = await readFile(filePath, 'utf-8');
                const { data, body } = parseFrontmatter(content);
                const slug = file.replace(/\.(mdx|md)$/, '');
                const fileStat = await stat(filePath);
                const pushInfo = pushState[`${category}/${slug}`] || {};
                posts.push({
                  slug: `${category}/${slug}`,
                  category,
                  title: data.title || slug,
                  description: data.description || '',
                  tags: Array.isArray(data.tags) ? data.tags : [],
                  pubDate: data.pubDate || null,
                  scheduledDate: data.scheduledDate || null,
                  author: data.author || 'S2J',
                  featured: data.featured === true,
                  draft: data.draft === true,
                  published: data.published !== false,
                  order: typeof data.order === 'number' ? data.order : 999,
                  githubPushedAt: pushInfo.githubPushedAt || null,
                  pushedContentHash: pushInfo.pushedContentHash || null,
                  currentContentHash: calculateContentHash(data, body),
                  fileMtime: fileStat.mtime.toISOString(),
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
            const { slug, title, description, category, tags = [], pubDate, scheduledDate, author = 'S2J', featured = false, draft = false, published = true, order = 999, content = '' } = body;
            if (!slug || !title || !category) return sendJson(res, 400, { error: '缺少必填字段' });
            if (!CATEGORIES.includes(category)) return sendJson(res, 400, { error: '无效的分类' });
            const filePath = join(CONTENT_DIR, category, `${slug}.mdx`);
            try {
              await stat(filePath);
              return sendJson(res, 409, { error: '文章已存在' });
            } catch {}
            await mkdir(dirname(filePath), { recursive: true });
            const data = { title, description: description || title, category, tags, pubDate: pubDate || new Date().toISOString().split('T')[0], author, featured, draft, published, order, keywords: tags };
            if (scheduledDate) data.scheduledDate = scheduledDate;
            const fileContent = stringifyFrontmatter(data, content || '## 概述\n\n在这里写概述...\n\n## 正文\n\n在这里写正文...\n');
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
            const fields = ['title', 'description', 'category', 'tags', 'pubDate', 'scheduledDate', 'author', 'featured', 'draft', 'published', 'order'];
            for (const field of fields) {
              if (body[field] !== undefined) updatedData[field] = body[field];
            }
            if (body.tags !== undefined) updatedData.keywords = body.tags;
            if (body.scheduledDate === null) {
              delete updatedData.scheduledDate;
            }
            const updatedBody = body.content !== undefined ? body.content : existingBody;
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

          // GET /admin/api/github/config — 获取 GitHub 配置
          if (url.pathname === '/admin/api/github/config' && req.method === 'GET') {
            const config = await getGithubConfig();
            return sendJson(res, 200, config);
          }

          // POST /admin/api/github/config — 保存 GitHub 配置
          if (url.pathname === '/admin/api/github/config' && req.method === 'POST') {
            const body = await readBody(req);
            await saveGithubConfig(body);
            const config = await getGithubConfig();
            return sendJson(res, 200, { success: true, ...config });
          }

          // POST /admin/api/github/push-selected — 流式推送选中的文章到 GitHub（SSE）
          if (url.pathname === '/admin/api/github/push-selected' && req.method === 'POST') {
            const body = await readBody(req);
            const { slugs = [] } = body;

            if (!slugs.length) {
              return sendJson(res, 400, { error: '请选择要推送的文章' });
            }

            const config = await getGithubConfig();
            if (!config.repo || !config.tokenConfigured) {
              return sendJson(res, 400, { error: '请先配置 GitHub 仓库和 Token' });
            }

            let fullConfig;
            try {
              const configContent = await readFile(CONFIG_FILE, 'utf-8');
              fullConfig = JSON.parse(configContent);
            } catch {
              return sendJson(res, 400, { error: '配置文件读取失败' });
            }

            // 校验通过后切换为 SSE 流式响应：start → 每篇一个 progress → done
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders?.();

            const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

            send({ type: 'start', total: slugs.length, repo: fullConfig.repo, branch: fullConfig.branch });

            let successCount = 0;
            let failCount = 0;

            for (const slug of slugs) {
              const parsed = parseSlug(slug);
              if (!parsed) {
                failCount++;
                send({ type: 'progress', slug, success: false, error: '无效的 slug' });
                continue;
              }
              try {
                await pushPostToGithub(parsed.filePath, fullConfig.repo, fullConfig.branch, fullConfig.token);
                await updatePushTimestamp(parsed.filePath, slug);
                successCount++;
                send({ type: 'progress', slug, success: true });
              } catch (e) {
                failCount++;
                send({ type: 'progress', slug, success: false, error: e.message });
              }
            }

            send({ type: 'done', total: slugs.length, successCount, failCount });
            res.end();
            return;
          }

          // POST /admin/api/github/push — 推送所有文章到 GitHub
          if (url.pathname === '/admin/api/github/push' && req.method === 'POST') {
            const body = await readBody(req);
            const config = await getGithubConfig();

            if (!config.repo || !config.tokenConfigured) {
              return sendJson(res, 400, { error: '请先配置 GitHub 仓库和 Token' });
            }

            let fullConfig;
            try {
              const configContent = await readFile(CONFIG_FILE, 'utf-8');
              fullConfig = JSON.parse(configContent);
            } catch {
              return sendJson(res, 400, { error: '配置文件读取失败' });
            }

            const onlyPublished = body.onlyPublished !== false;
            const results = [];
            let successCount = 0;
            let failCount = 0;

            for (const category of CATEGORIES) {
              const categoryDir = join(CONTENT_DIR, category);
              try {
                await stat(categoryDir);
              } catch {
                continue;
              }
              const files = (await readdir(categoryDir)).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
              for (const file of files) {
                const filePath = join(categoryDir, file);
                const content = await readFile(filePath, 'utf-8');
                const { data } = parseFrontmatter(content);

                if (onlyPublished && (data.published === false || data.draft === true)) {
                  continue;
                }

                try {
                  await pushPostToGithub(filePath, fullConfig.repo, fullConfig.branch, fullConfig.token);
                  results.push({ file: `${category}/${file}`, success: true });
                  successCount++;
                } catch (e) {
                  results.push({ file: `${category}/${file}`, success: false, error: e.message });
                  failCount++;
                }
              }
            }

            return sendJson(res, 200, {
              success: failCount === 0,
              total: successCount + failCount,
              successCount,
              failCount,
              results,
            });
          }

          return sendJson(res, 404, { error: 'API 路由不存在' });
        } catch (error) {
          console.error('Admin API 错误:', error);
          return sendJson(res, 500, { error: '服务器内部错误' });
        }
      });
      // server 启动后跑一次旧状态迁移（.mdx frontmatter → admin-push-state.json）
      return () => {
        migrateLegacyPushState();
      };
    },
  };
}