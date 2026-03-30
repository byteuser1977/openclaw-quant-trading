// Worker Isolation Test
// Verifies that each strategy runs in a separate worker process without interfering.

import { spawn } from 'child_process';
import path from 'path';

describe('Worker Isolation', () => {
  const workerScript = path.resolve(__dirname, '../../src/worker/strategyWorker.ts');

  test('two workers execute independent strategies', (done) => {
    const workerA = spawn('node', [workerScript, '--strategy', 'macross']);
    const workerB = spawn('node', [workerScript, '--strategy', 'rsiMacd']);

    let outA = '';
    let outB = '';

    workerA.stdout.on('data', (data) => (outA += data.toString()));
    workerB.stdout.on('data', (data) => (outB += data.toString()));

    let exitCount = 0;
    const checkDone = () => {
      if (++exitCount === 2) {
        expect(outA).toContain('MACrossStrategy');
        expect(outB).toContain('RsiMacdStrategy');
        done();
      }
    };

    workerA.on('close', checkDone);
    workerB.on('close', checkDone);
  }, 15000);
});
