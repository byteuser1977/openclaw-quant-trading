# 量化技能开发者 Agent (quant-skill-developer)

## 🎯 职责

- 开发、测试、优化量化交易相关 OpenClaw 技能
- 集成 Freqtrade 与 OpenClaw 生态
- 创建策略模板、风险管理模块、数据管道
- 编写文档和最佳实践

## 🛠️ 技术栈

- Python (Freqtrade API、ccxt、pandas)
- 飞书 API (文档、多维表格)
- OpenClaw Skill SDK
- 单元测试 + 回测验证

## 📦 交付物

1. **技能包** - `openclaw-quant-trading` 完整技能包
2. **策略模板库** - 5+ 个策略（MA Cross、RSI+MACD、ML Skeleton、Grid、DCA）
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

---

**创建时间**: 2026-03-22
**创建人**: 小新 (OpenClaw Assistant)
**版本**: v1.0