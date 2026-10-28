# 日序 macOS 应用

这是现有网页版的 Electron 桌面封装，不是删减版，也不另维护业务代码。构建时从仓库根目录复制所有运行模块、页面、样式、图标、Manifest、Service Worker 与同一个静态服务器，逐文件保存 SHA-256。网页更新后重新构建即可带入桌面版。

## 下载与安装

进入仓库 Actions 的 **Build macOS app**，选择已成功完成的最新运行，在 Artifacts 下载：

- `Daylight-macOS-arm64`：Apple Silicon（M1/M2/M3/M4 等）。
- `Daylight-macOS-x64`：Intel Mac。

解压下载的 artifact，得到应用 ZIP、SHA-256 与本机验收报告；再解压 `Daylight-macOS-*.zip`，将 `Daylight.app` 拖入「应用程序」，双击运行。应用自带运行时，不需要 Node.js、终端或联网加载页面。构建结果放在 Actions，避免把大型可执行文件与依赖提交进 Git 源码历史。

应用经过本机 ad-hoc 签名，但没有 Apple Developer ID 签名和公证。下载后 macOS 可能阻止打开；确认来源和校验值后，在「系统设置 → 隐私与安全性」允许打开。正式公开分发前应另行配置 Developer ID 与公证。请勿为此关闭系统全局安全设置。

## 功能与数据

保留网页版所有业务功能：看板、清单、日历与周计划、搜索筛选、排序与批量操作、任务/子任务/标签、重复任务、专注与复盘、回收站、恢复点、JSON 导入导出、三主题、快捷键与离线资源。原有能力边界也不变：没有账号或云端同步，退出应用后不保证提醒。

桌面版固定使用 `http://127.0.0.1:17839` 和 Electron 持久化配置目录 `~/Library/Application Support/Daylight/`。只监听本机回环地址。固定来源保证 Web Locks 和原有存储逻辑可用，升级覆盖 `.app` 不会更换数据来源。不要删除该配置目录，否则会丢失本地数据。

桌面与浏览器使用不同存储，不能自动共享。迁移时先在网页导出备份，再在桌面左侧「从备份恢复」导入。需要往返迁移时同样先导出再导入；替换导入前可先备份目标端。不会读取或改写浏览器配置。

只允许运行一个应用实例。macOS 关闭窗口后应用继续运行，Dock 点击可重新打开；`⌘Q` 完全退出。若端口被占用会明确报错，不会打开未知服务或自动换端口导致数据看似丢失。

## 本地构建

需要 Node.js 24；原生签名与验收需要 macOS。依赖固定在本目录独立锁文件，根目录网页版仍保持无运行依赖。

```sh
npm ci
npm ci --prefix macos-app
npm test --prefix macos-app
npm run build --prefix macos-app -- arm64
# Intel：末尾改为 x64
node macos-app/smoke.mjs macos-app/dist/Daylight-darwin-arm64/Daylight.app/Contents/MacOS/Daylight
```

输出：`macos-app/dist/Daylight-darwin-arm64/Daylight.app`。开发启动：`npm start --prefix macos-app`。

Linux 可组装 macOS 包，但不能执行 macOS 二进制，也无法完成原生签名；正式下载请使用 macOS Actions 构建产物。本目录 `build/`、`dist/` 与 `node_modules/` 均不进 Git。

## 验证

- 根目录 `npm run check && npm test`：原有 56 项模型/HTTP 回归。
- `npm test --prefix macos-app`：资源复制校验、SW 全资源 HTTP 可达、私有文件拒绝、版本一致性与安全边界。
- Actions 在 Apple Silicon 和 Intel 上分别生成 `.app`、验证签名和 Mach-O，并启动打包后的真实应用：创建/编辑/完成、中文内容、主题、专注状态、文件导出与恢复、Web Locks、离线缓存及退出重开数据持久化。使用独立临时配置，只操作测试数据。
- 原网页浏览器矩阵继续由既有 `ci.yml` 执行。只有成功构建且本机验收通过的运行才会上传可下载应用；失败运行不可当作已验证发布。
