# 有期维护说明

有期在 [1qiuyu/youqi-android](https://github.com/1qiuyu/youqi-android) 独立维护。问题反馈和功能需求提交到本仓库，不提交到原项目。

修改前阅读 [AGENTS.md](AGENTS.md)；本机编译、测试和数据保存方式见 [README.md](README.md)。

- 保持安卓包名及已有数据兼容；避免为了更改内部名称而影响手机上的现有数据。
- 修改日程、重复规则或备份时，用独立模拟器验证。会清空数据的测试不可运行在日常手机上。
- 不提交 API Key、签名私钥、手机数据库、本地配置或构建缓存。
- 不添加 GitHub Actions 工作流、上游自动同步或云部署。
- 复用代码的来源和许可证见 [NOTICE.md](NOTICE.md)，保留原有版权和许可声明。
