// ============================================
// Admin API 封装（对接 plugins/admin-api.mjs 提供的开发态接口）
// 注意：列表是 /admin/api/posts（复数），单篇增删改是 /admin/api/post（单数）
// ============================================

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = new Error((data && data.error) || `请求失败（${res.status}）`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  /** 获取文章列表 */
  listPosts() {
    return request('/admin/api/posts');
  },

  /** 获取单篇文章（slug 为 "分类/文件名"） */
  getPost(slug) {
    return request(`/admin/api/post?slug=${encodeURIComponent(slug)}`);
  },

  /** 新建文章：slug 为不含分类的文件名，category 单独传递 */
  createPost(payload) {
    return request('/admin/api/post', { method: 'POST', body: JSON.stringify(payload) });
  },

  /** 更新文章：payload.slug 必须是 "分类/文件名" */
  updatePost(payload) {
    return request('/admin/api/post', { method: 'PUT', body: JSON.stringify(payload) });
  },

  /** 删除文章 */
  deletePost(slug) {
    return request(`/admin/api/post?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
  },

  /** 上传图片（base64），返回 { url } */
  uploadImage({ filename, data, ext }) {
    return request('/admin/api/upload', {
      method: 'POST',
      body: JSON.stringify({ filename, data, ext }),
    });
  },
};
