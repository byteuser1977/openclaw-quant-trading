# 量化技能开发者 Agent (quant-skill-developer)

> **⚠️ Beta 版本** - 当前为 Beta 发布状态，部分测试尚未通过，详见已知问题。

## 🎯 职责

- 开发、测试、优化量化交易相关 OpenClaw 技能
- 集成 Freqtrade 与 OpenClaw 生态
- 创建策略模板、风险管理组件、数据管道
- 编写文档和最佳实践

## 🛠️ 技术栈

- Python (Freqtrade API、ccxt、pandas)
- 飞书 API (文档、多维表格)
- OpenClaw Skill SDK
- 单元测试 + 回测验证

## 📦 交付物

1. **技能包** - `openclaw-quant-trading` 完整技能包
2. **策略模板库** - ✅ 5+ 个策略（MA Cross、RSI+MACD、ML Skeleton、Grid、DCA）
3. **风险管理组件** - 动态止损、仓位计算、熔断机制
4. **数据管道** - 下载、验证、备份
5. **监控通知** - 飞书 IM 消息模板、异常警报
6. **文档** - 用户指南、API 参考、最佳实践、FAQ

## 🗂️ 目录结构

```
quant-skill-developer/
├── skills/                    # 技能包
│   ├── quant-strategy-templates/
│   ├── quant-risk-management/
│   └── quant-data-pipeline/
├── scripts/                   # 工具脚本
├── docs/                      # 文档
├── tests/                     # 测试
├── configs/                   # 配置文件示例
├── memory/                    # 会话记忆
└── README.md                  # 本文件
```

## 🚀 工作流程

1. **架构设计** (Phase 1) - 定义 API 和 Schema
2. **核心开发** (Phase 2) - 实现技能模块
3. **测试优化** (Phase 3) - 单元测试 + 回测验证
4. **发布归档** (Phase 4) - 打包 + 发布到飞书 wiki
5. **维护迭代** (Phase 5+) - 根据 feedback 更新

## 📝 开发规范

- 代码覆盖率 > 80%
- 每个策略必须包含 Hyperopt 参数定义
- 所有公共 API 需有文档字符串
- 遵循 OpenClaw Skill SDK 规范
- 使用飞书作为主要文档和交付平台

## 🔗 相关资源

- **Freqtrade 研究报告**: https://www.feishu.cn/wiki/KDybwyWVtiBPRhkOJ63czJsPnWc
- **团队协作技能指南**: https://ncnm51noy8kt.feishu.cn/wiki/UzZswJlSzinKEtkIqQkcaGu8nte
- **本地知识库**: `/Volumes/DATA/data/clawd/data/knowledge/`

## ⚠️ 已知问题 (Beta 限制)

- **单元测试**: 仍有 3 个测试套件（共 9 个测试）失败，主要涉及 TypeScript 类型错误和逻辑断言问题。详情见 `memory/2026-03-31-test-results.md`。
- **覆盖率**: Beta 阈值设为 45% (branches), 55% (statements)。当前覆盖率约 61.5% statements, 49.3% branches。
- **未完善模块**: Exchange 集成、部分 Strategy 编译器功能、Hyperopt 参数采样等暂未完全就绪。
- **文档**: API 参考和最佳实践仍在完善中。

这些将在 Phase 5 (维护迭代) 中逐步修复。

---

**创建时间**: 2026-03-22
**创建人**: 小新 (OpenClaw Assistant)
**版本**: v1.0-beta