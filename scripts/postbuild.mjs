// 构建后处理：
// 清理 admin 后台静态页（仅 dev 可用，生产不应暴露）

import { rmSync } from 'node:fs';

rmSync('dist/admin', { recursive: true, force: true });
console.log('✓ dist/admin removed');
