# 示例策略

本目录包含 OpenClaw Quant Trading 技能包的使用示例。

## 📂 文件列表

- **`quick_start.ts`** - 快速入门示例
  - 展示如何导入并使用 Strategy、Backtesting、Risk、Data、Hyperopt 模块
  - 包含完整工作流：构建策略 → 回测 → 优化

## 🚀 运行示例

### 前置条件

1. 安装依赖: `npm install`
2. 编译 TypeScript: `npm run build`
3. 确保 `dist/skill/` 目录存在（已打包好的技能包）

### 运行

```bash
# 使用 ts-node 直接运行
npx ts-node examples/quick_start.ts

# 或编译后运行
npm run build
node dist/examples/quick_start.js
```

## 📖 更多示例

- **自定义策略**: 参考 `docs/strategy_templates.md`，其中包含 5 个预置策略模板的详细说明
- **Hyperopt 优化**: 展示如何定义参数空间并运行自动优化
- **风险管理**: 展示仓位计算、止损设置、熔断机制的实际用法

## 💡 提示

- 示例代码仅用于演示 API 用法，实际使用需要根据您的交易需求和风险偏好调整参数
- 回测结果不代表未来表现，请谨慎用于实盘决策
