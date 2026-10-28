#!/bin/bash

# Finder 启动时可能不会加载终端的 PATH，补充常见 Node.js 安装位置。
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
cd -- "$(dirname -- "$0")" || exit 1

pause_on_error() {
  printf '\n按回车键关闭窗口…'
  read -r _
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  printf '未找到 Node.js。请先安装 Node.js 18 或以上版本，再双击启动。\n'
  pause_on_error
fi

node --input-type=module <<'NODE'
import { spawn } from 'node:child_process';

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error('需要 Node.js 18 或以上版本，当前版本为 ' + process.version);
  process.exit(1);
}

const { createServer } = await import('./server.mjs');
const port = process.env.PORT === undefined ? 5173 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT 必须是 0 到 65535 之间的整数。');
  process.exit(1);
}

const server = createServer();
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。请先关闭已有服务，或使用 PORT=其他端口 启动。`);
  } else {
    console.error('启动失败：' + error.message);
  }
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${server.address().port}`;
  console.log(`日序已启动：${url}`);
  console.log('保持此终端窗口打开，按 Ctrl+C 停止服务。');
  const browser = spawn('open', [url], { stdio: 'ignore' });
  browser.on('error', () => console.log('请手动在浏览器中打开上方地址。'));
  browser.on('exit', code => {
    if (code) console.log('请手动在浏览器中打开上方地址。');
  });
});
NODE

status=$?
if [ "$status" -ne 0 ] && [ "$status" -ne 130 ]; then
  pause_on_error
fi
exit "$status"
