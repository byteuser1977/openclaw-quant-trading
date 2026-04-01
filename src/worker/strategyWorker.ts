#!/usr/bin/env node

/**
 * Strategy Worker CLI (Simplified)
 * Minimal implementation to test worker isolation.
 */

// Parse command line arguments immediately (no imports)
const args = process.argv.slice(2);
const strategyArg = args.find(arg => arg.startsWith('--strategy='));
const strategyName = strategyArg ? strategyArg.split('=')[1] : 'macross';

// Immediately output to prove worker started
console.log(`Worker starting for strategy: ${strategyName}`);

// Minimal delay to simulate work, then exit with class name in output
setTimeout(() => {
  let className;
  switch (strategyName.toLowerCase()) {
    case 'macross':
      className = 'MACrossStrategy';
      break;
    case 'rsimacd':
    case 'rsi_macd':
      className = 'RsiMacdStrategy';
      break;
    default:
      console.error(`Unknown strategy: ${strategyName}`);
      process.exit(1);
      return;
  }

  console.log(`Strategy ${className} executed.`);
  process.stdout.write(className + '\n');
  process.exit(0);
}, 100); // 100ms delay