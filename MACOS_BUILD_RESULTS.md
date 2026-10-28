# macOS 应用交付记录

验证日期：2026-10-29（北京时间）。应用版本：1.7.0，schema 2。

## 同步与交付

先从 GitHub 快进同步至 `5f9e43b35a7a16e6d9ba89cb5667fcce2051c445`，再新增独立的 `macos-app/`。实际通过构建验收的源码提交是 `35d8fea39446a276ef5beb3db9d236df205aedf5`。网页业务代码未被修改，桌面包按 SHA-256 校验与网页资源逐文件一致。

[macOS 原生构建与验收运行](https://github.com/Elizebeths/todo/actions/runs/40741929424) 的两个任务均成功：

| 版本 | macOS 原生环境 | 下载 |
| --- | --- | --- |
| Apple Silicon / arm64 | macOS 15，Apple Silicon | [Daylight-macOS-arm64](https://github.com/Elizebeths/todo/actions/runs/40741929424/artifacts/12839224899) |
| Intel / x64 | macOS 15，Intel | [Daylight-macOS-x64](https://github.com/Elizebeths/todo/actions/runs/40741929424/artifacts/12839227991) |

Artifacts 保留 90 天，下载可能需要登录 GitHub。外层压缩包内含应用 ZIP、SHA-256 和本机验收 JSON/截图。再解压内层 ZIP，得到 `Daylight.app`，拖入「应用程序」运行。应用自带运行时，无需安装 Node.js；构建的最低系统版本为 macOS 13。

## 本次通过的检查

- 本地原有 56 项模型/HTTP 测试、新增 2 项桌面打包/安全边界测试与 JavaScript 语法检查通过；两个 macOS 构建环境再次通过相同检查。
- 两个架构均完成 Mach-O 构建、Info.plist 校验，以及 `codesign --verify --deep --strict` 验证。采用本机 ad-hoc 签名，不含 Developer ID 或 Apple 公证。
- 两个架构均启动了最终 `.app`，使用临时独立配置完成：Web Locks/安全来源与 Node 隔离；中文任务创建、编辑、完成及 schema 2 保存；主题切换；专注会话；真实文件备份导出、上传与恢复；逐资源字节校验；Service Worker 激活；完全退出并重新启动后的任务、主题和专注状态保持。没有页面脚本错误。
- 下载产物由 macOS `ditto` 创建，保留 `.app` 的执行权限、符号链接与资源信息；大型二进制存放于 GitHub Actions Artifacts，未写入 Git 历史。

## 能力与边界

桌面版直接执行网页原代码，包含看板、清单、日历、周计划、搜索筛选、批量操作、子任务、重复任务、专注复盘、回收站、恢复点、主题与备份恢复。默认桌面配置固定使用 `http://127.0.0.1:17839` 和 `~/Library/Application Support/Daylight/`，升级应用包不清除该目录。网页与桌面存储独立，迁移需导出再恢复。退出整个应用后不保证提醒，未新增云同步。

未提供 Apple Developer ID 与公证凭据，因此没有声称可无提示安装；macOS 首次打开可能需要在系统设置中允许。没有将 macOS 15 的自动化验收等同于所有 macOS 版本和真实用户输入法的人工验收。

## 网页 CI 的独立结果

本次完整网页矩阵运行 [40741929530](https://github.com/Elizebeths/todo/actions/runs/40741929530)：**53/55 通过，2 项未通过**。失败为 Firefox 的配额/外部冲突用例，以及 mobile-webkit 的同时保存冲突用例；桌面 Chromium 与 mobile-chromium 用例通过。前一轮网页 CI 也有 2 项 Firefox 失败，显示矩阵的失败项存在波动。此次没有修改网页版业务代码，也没有跳过失败用例来宣称网页全绿。此结果与已经成功完成的 macOS Electron 原生构建、签名和应用验收分别记录。

构建、安装、数据迁移及复现命令见 [macos-app/README.md](macos-app/README.md)。
