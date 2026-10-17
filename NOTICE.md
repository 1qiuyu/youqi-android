# 来源与许可说明

有期由本仓库独立维护；不是 Fossify Calendar 的官方版本，也不跟随其发布或更新流程。

## 使用的代码

本项目以 [Fossify Calendar](https://github.com/FossifyOrg/Calendar) 的提交 `9e1d78c592f3a5b1a1c4cfd31c90a00cc2b516b8` 为初始代码基线，仍复用其 Room 数据库、Event/Task 模型、重复规则、ICS 导入及其他原生支持代码。构建还依赖 `org.fossify:commons:7.1.3`。

有期新增的界面、文字/图片 AI 提取、API 配置、安全存储、日程显示偏好及交互按本项目需求独立维护。

## 许可证和版权

原有代码的版权归原作者所有，保留各文件中已有的版权和许可声明。项目继续使用 [GNU GPL v3](LICENSE)，不因仓库独立而改为其他许可证。

历史项目说明和更新记录归档在 [docs/origins](docs/origins/)。这些历史资料仅用于来源追溯，不是有期的下载、反馈或发布入口。

## 维护关系

- 唯一 Git 远端是 `https://github.com/1qiuyu/youqi-android.git`。
- 不配置 upstream 远端、上游自动合并、上游维护人或上游商店发布流程。
- 反馈和改动在有期仓库内处理。
- GitHub Actions 保持关闭，不使用云端构建或发布。
