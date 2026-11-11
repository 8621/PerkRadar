# 第三方许可声明

本项目源码采用 [MIT License](LICENSE)。以下清单按 `package-lock.json`（lockfileVersion 3）的**生产依赖**整理，核对日期 2026-11-08；依赖或锁文件变更后必须重新生成。

## 随生产镜像分发的依赖

Dockerfile 在 `npm run build` 后执行 `npm prune --omit=dev`，因此生产镜像只含下列运行时依赖。

| 包 | 版本 | 许可证 | 上游 |
| --- | --- | --- | --- |
| `next` | 15.5.29 | MIT | https://github.com/vercel/next.js |
| `react` | 19.1.0 | MIT | https://github.com/facebook/react |
| `react-dom` | 19.1.0 | MIT | https://github.com/facebook/react |
| `radix-ui` | 1.8.1 | MIT | https://github.com/radix-ui/primitives |
| `fast-xml-parser` | 5.12.0 | MIT | https://github.com/NaturalIntelligence/fast-xml-parser |
| `cn` | 0.5.2 | MIT | https://www.npmjs.com/package/cn |
| `tw-animate-css` | 1.4.0 | MIT | https://github.com/Wombosvideo/tw-animate-css |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | https://github.com/joe-bell/cva |
| `lucide-react` | 1.70.0 | ISC | https://github.com/lucide-icons/lucide |

需要保留的义务：

- MIT / ISC：分发时保留相应版权与许可声明。
- Apache-2.0（`class-variance-authority`）：保留 LICENSE、NOTICE（如有）与版权声明，并标注被修改过的文件。

## 仅构建期使用的依赖

`shadcn`、`typescript-eslint`、`ts-morph`、`tailwindcss`、`eslint` 等开发依赖不随生产镜像分发。完整依赖树中除 MIT / ISC / BSD / Apache-2.0 外，还出现 `LGPL-3.0-or-later`、`MPL-2.0`、`CC-BY-4.0`、`CC0-1.0`、`Python-2.0` 等许可；以源码形式再分发时，须按各包自带许可逐项保留声明，不要用本表替代逐包核对。

## 文档图表生成

Star 趋势图由 GitHub Actions 使用 [keeptinkering/star-history-action](https://github.com/keeptinkering/star-history-action) 的固定版本 `40684de767f6f524052941ff59b91ab5b0c8d4f1` 生成，该工具采用 MIT 许可（Copyright © 2026 narayann7），内含采用 MIT 许可的 Star History 渲染代码。工作流仅在运行器内安装这些工具，不将其依赖添加到应用运行时。图表使用 GitHub 返回的 Star 时间记录，不依赖托管图表 API 的缓存。工具与其内置代码的许可原文见[上游 LICENSE](https://github.com/keeptinkering/star-history-action/blob/40684de767f6f524052941ff59b91ab5b0c8d4f1/LICENSE)。

## 运行时与内置模块

- `node:sqlite` 是 Node.js 内置模块，不是独立引入的第三方包。
- 基础镜像 `node:22-bookworm-slim`：Node.js 采用 MIT，Debian 系统包各有自己的许可，随镜像分发时以镜像内的版权文件为准。
- 抓取来源（RSS/Atom 与站点内容）不属于第三方代码许可范畴，见 [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) 与 [README.md](README.md) 的来源覆盖说明。
