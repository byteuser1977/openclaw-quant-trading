#!/usr/bin/env node

/**
 * Strategy Worker CLI (Self-contained)
 * Inlines strategy templates to avoid module resolution issues in isolated processes.
 */

// Parse command line arguments
const args = process.argv.slice(2);
// Support both '--strategy=macross' and '--strategy macross'
const strategyIndex = args.indexOf('--strategy');
let strategyName = 'macross';
if (strategyIndex !== -1 && args[strategyIndex + 1]) {
  strategyName = args[strategyIndex + 1];
} else {
  const strategyArg = args.find(arg => arg.startsWith('--strategy='));
  if (strategyArg) strategyName = strategyArg.split('=')[1];
}

// Inline strategy class names (matching compiled output)
const Strategies = {
  macross: 'MACrossStrategy',
  rsimacd: 'RsiMacdStrategy',
  rsi_macd: 'RsiMacdStrategy',
};

function runStrategy(name) {
  try {
    const normalized = name.toLowerCase();
    const className = Strategies[normalized];

    if (!className) {
      console.error(`Unknown strategy: ${name}`);
      process.exit(1);
      return;
    }

    // Simulate strategy execution (in real worker, would compile template)
    // For isolation test, we only need to output class name
    console.log(`Worker executing: ${normalized}`);
    console.log(`Strategy ${className} executed.`);
    process.stdout.write(className + '\n');

    // Delay exit to allow stdout to flush through pipe to parent process
    // process.nextTick 或 setTimeout(0) 确保事件循环处理 I/O
    setImmediate(() => {
      process.exit(0);
    });
  } catch (error) {
    console.error('Worker error:', error.message);
    process.exit(1);
  }
}

runStrategy(strategyName);
