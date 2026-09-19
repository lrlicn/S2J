// ============================================
// GitHub 配置与推送
// ============================================

import { showToast } from './toast.js';

export function initGithub(router) {
  const configModal = document.getElementById('github-config-modal');
  const configOverlay = document.getElementById('github-config-overlay');
  const btnOpenConfig = document.getElementById('home-github-config');
  const btnCloseConfig = document.getElementById('github-config-close');
  const btnCancelConfig = document.getElementById('github-config-cancel');
  const btnSaveConfig = document.getElementById('github-config-save');
  const btnPush = document.getElementById('home-github-push');

  const repoInput = document.getElementById('github-repo');
  const branchInput = document.getElementById('github-branch');
  const tokenInput = document.getElementById('github-token');

  // 打开配置弹窗
  async function openConfigModal() {
    try {
      const config = await fetch('/admin/api/github/config').then((r) => r.json());
      repoInput.value = config.repo || '';
      branchInput.value = config.branch || 'main';
      tokenInput.value = '';
      tokenInput.placeholder = config.tokenConfigured ? '已配置（留空保持不变）' : 'ghp_xxxxxxxxxxxx';
    } catch (e) {
      showToast('加载配置失败', 'error');
    }

    configModal.classList.remove('hidden');
    configModal.classList.add('flex');
  }

  function closeConfigModal() {
    configModal.classList.add('hidden');
    configModal.classList.remove('flex');
  }

  // 保存配置
  async function saveConfig() {
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';
    const token = tokenInput.value.trim();

    if (!repo) {
      showToast('请输入仓库地址', 'error');
      return;
    }

    try {
      const res = await fetch('/admin/api/github/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, branch, token }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('GitHub 配置已保存');
        closeConfigModal();
      } else {
        showToast(data.error || '保存失败', 'error');
      }
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  // 推送按钮：跳转到文章列表多选模式
  function goToPushMode() {
    router.navigate('/posts?mode=push');
  }

  // 事件绑定
  btnOpenConfig?.addEventListener('click', openConfigModal);
  btnCloseConfig?.addEventListener('click', closeConfigModal);
  btnCancelConfig?.addEventListener('click', closeConfigModal);
  configOverlay?.addEventListener('click', closeConfigModal);
  btnSaveConfig?.addEventListener('click', saveConfig);
  btnPush?.addEventListener('click', goToPushMode);
}
