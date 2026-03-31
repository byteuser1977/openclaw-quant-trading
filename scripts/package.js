#!/usr/bin/env node

/**
 * OpenClaw Quant Trading Skill Package Builder
 *
 * 功能:
 * 1. 清理并编译 TypeScript 代码
 * 2. 复制资源文件 (docs, examples, README, etc)
 * 3. 生成技能包元数据 (manifest.json)
 * 4. 验证 skill.yaml 完整性
 * 5. 输出打包结果到 dist/skill/
 *
 * 使用:
 *   node scripts/package.js [--skip-build] [--output-dir <dir>]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKILL_YAML_PATH = path.join(ROOT_DIR, 'skill.yaml');
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'skill');
const BUILD_DIR = path.join(ROOT_DIR, 'dist');

// 解析命令行参数
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const customOutputIndex = args.indexOf('--output-dir');
const OUTPUT_DIR = customOutputIndex !== -1 && args[customOutputIndex + 1]
  ? path.resolve(args[customOutputIndex + 1])
  : DIST_DIR;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(message) {
  console.log(`\n${colors.blue}==>${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logWarn(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

// 验证 skill.yaml
function validateSkillYaml() {
  logStep('验证 skill.yaml');

  if (!fs.existsSync(SKILL_YAML_PATH)) {
    logError('skill.yaml 不存在');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(SKILL_YAML_PATH, 'utf8');
    const skill = yaml.load(content);

    const requiredFields = ['name', 'version', 'description', 'entry', 'capabilities'];
    const missing = requiredFields.filter(f => !skill[f]);

    if (missing.length > 0) {
      logError(`skill.yaml 缺少必要字段: ${missing.join(', ')}`);
      process.exit(1);
    }

    logSuccess(`skill.yaml 有效 (name: ${skill.name}, version: ${skill.version})`);
    return skill;
  } catch (e) {
    logError(`skill.yaml 解析失败: ${e.message}`);
    process.exit(1);
  }
}

// 清理目录
function cleanDirectory(dir) {
  logStep(`清理目录: ${path.relative(ROOT_DIR, dir)}`);
  if (fs.existsSync(dir)) {
    // 删除整个目录后重建
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    logSuccess('目录已清空并重建');
  } else {
    fs.mkdirSync(dir, { recursive: true });
    logSuccess('目录已创建');
  }
}

// 复制目录内容（非目录本身），跳过目标目录自身以避免递归
function copyDirectoryContents(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  const destDirName = path.basename(dest);
  for (const entry of entries) {
    // 如果需要跳过输出目录自身（当目标目录是源目录的子目录时）
    if (entry.name === destDirName && path.resolve(src) === path.dirname(path.resolve(dest))) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// TypeScript 编译
function buildTypeScript() {
  if (skipBuild) {
    logWarn('跳过 TypeScript 编译 (--skip-build)');
    return;
  }

  logStep('编译 TypeScript 代码');

  try {
    // 使用 tsc 编译，不使用 inherited stdio 以避免类型错误导致进程退出
    const result = execSync('npx tsc -p tsconfig.json --outDir dist 2>&1', { encoding: 'utf-8' });
    console.log(result);
    logSuccess('TypeScript 编译完成（可能存在类型错误，但已生成 JS 文件）');
  } catch (e) {
    // tsc 在存在类型错误时仍可能生成 JS 文件 (noEmitOnError=false)
    logWarn('TypeScript 编译报告了错误，但继续检查输出文件...');
  }

  // 检查编译输出
  const indexPath = path.join(BUILD_DIR, 'index.js');
  if (!fs.existsSync(indexPath)) {
    logError('TypeScript 编译失败: dist/index.js 未生成，无法打包');
    process.exit(1);
  }

  const stats = fs.statSync(indexPath);
  logSuccess(`生成 index.js (${(stats.size / 1024).toFixed(1)} KB)`);
}

// 复制资源文件
function copyResources(skill) {
  logStep('复制资源文件');

  const resources = skill.resources || [];
  let copied = 0;

  resources.forEach(res => {
    const src = path.join(ROOT_DIR, res.path);
    const dest = path.join(OUTPUT_DIR, res.destination || res.path);

    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
      logSuccess(`已复制: ${res.path} → ${res.destination || res.path}`);
      copied++;
    } else {
      logWarn(`资源不存在，跳过: ${res.path}`);
    }
  });

  if (copied === 0) {
    logWarn('未复制任何资源文件');
  }
}

// 生成 manifest.json
function generateManifest(skill) {
  logStep('生成 manifest.json');

  const manifest = {
    name: skill.name,
    version: skill.version,
    description: skill.description,
    author: skill.author,
    license: skill.license,
    entry: {
      module: 'index.js',
      type: 'node'
    },
    capabilities: skill.capabilities,
    builtinTemplates: skill.builtinTemplates || [],
    injectedTools: skill.injectedTools,
    configSchema: skill.configSchema,
    publishedAt: new Date().toISOString(),
    build: {
      source: 'https://github.com/byteuser1977/openclaw-quant-trading',
      commit: getCurrentCommitHash()
    }
  };

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  logSuccess(`manifest.json 已生成 (${OUTPUT_DIR})`);
}

// 获取当前 Git commit hash
function getCurrentCommitHash() {
  try {
    return execSync('git rev-parse HEAD').toString().trim().slice(0, 8);
  } catch (e) {
    return 'unknown';
  }
}

// 验证打包结果
function validatePackage(skill) {
  logStep('验证打包结果');

  const requiredFiles = [
    'index.js',
    'manifest.json',
    'README.md'
  ];

  const missing = requiredFiles.filter(f => !fs.existsSync(path.join(OUTPUT_DIR, f)));

  if (missing.length > 0) {
    logError(`打包结果缺少文件: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 检查 index.js 大小
  const indexPath = path.join(OUTPUT_DIR, 'index.js');
  const stats = fs.statSync(indexPath);
  if (stats.size < 100) {
    logError('index.js 文件过小，可能编译失败');
    process.exit(1);
  }

  logSuccess(`打包验证通过 (输出目录: ${path.relative(ROOT_DIR, OUTPUT_DIR)})`);
}

// 主流程
async function main() {
  console.log('\n' + '='.repeat(60));
  log('OpenClaw Quant Trading Skill Package Builder', 'green');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. 验证 skill.yaml
    const skill = validateSkillYaml();

    // 2. 清理输出目录
    cleanDirectory(OUTPUT_DIR);

    // 3. TypeScript 编译
    buildTypeScript();

    // 4. 复制编译后的 dist 目录内容到输出目录
    if (fs.existsSync(BUILD_DIR)) {
      copyDirectoryContents(BUILD_DIR, OUTPUT_DIR);
      logSuccess(`已复制编译输出: dist/* → ${path.relative(ROOT_DIR, OUTPUT_DIR)}`);
    } else {
      logError('编译输出目录不存在');
      process.exit(1);
    }

    // 5. 复制资源文件 (会覆盖/补充已存在的文件，如 docs/)
    copyResources(skill);

    // 6. 生成 manifest.json
    generateManifest(skill);

    // 7. 验证打包结果
    validatePackage(skill);

    // 完成
    console.log('\n' + '='.repeat(60));
    logSuccess('技能包打包完成！');
    console.log('='.repeat(60));
    console.log(`\n输出位置: ${OUTPUT_DIR}`);
    console.log('\n包含文件:');
    console.log('  - index.js (编译后的代码)');
    console.log('  - manifest.json (技能包元数据)');
    console.log('  - README.md (用户文档)');
    console.log('  - docs/ (详细文档)');
    console.log('  - examples/ (示例代码)');
    console.log('\n下一步:');
    console.log('  1. 预览: 打开 index.js + manifest.json 检查内容');
    console.log('  2. 发布: 复制到飞书 Wiki 或 ClawHub');
    console.log('  3. 测试: 在 OpenClaw 中安装并运行示例\n');

  } catch (e) {
    logError(`构建失败: ${e.message}`);
    process.exit(1);
  }
}

main();
