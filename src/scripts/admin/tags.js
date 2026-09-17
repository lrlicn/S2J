// 标签化输入控件（回车 / 逗号添加，Backspace 删除最后一个）

export function createTagInput({ container, input, onChange, onDuplicate }) {
  let tags = [];

  function render() {
    container.querySelectorAll('.tag-chip').forEach((el) => el.remove());
    tags.forEach((tag, index) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';

      const label = document.createElement('span');
      label.textContent = tag; // textContent 防止标签内容被当作 HTML

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', '删除标签');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => remove(index));

      chip.append(label, removeBtn);
      container.insertBefore(chip, input);
    });
  }

  function add(raw) {
    const tag = String(raw ?? '').trim().replace(/,$/, '');
    if (!tag) return false;
    if (tags.includes(tag)) {
      onDuplicate?.();
      return false;
    }
    tags.push(tag);
    render();
    onChange?.(); // 仅用户主动新增时通知（用于草稿自动保存）
    return true;
  }

  function remove(index) {
    tags.splice(index, 1);
    render();
    onChange?.();
  }

  // 程序化填充（加载文章 / 恢复草稿 / 重置）不触发 onChange
  function setTags(next) {
    tags = Array.isArray(next) ? [...next] : [];
    render();
  }

  function reset() {
    tags = [];
    render();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (add(input.value)) input.value = '';
    } else if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
      remove(tags.length - 1);
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      add(input.value);
      input.value = '';
    }
  });

  return {
    get tags() {
      return tags;
    },
    add,
    remove,
    setTags,
    reset,
  };
}
