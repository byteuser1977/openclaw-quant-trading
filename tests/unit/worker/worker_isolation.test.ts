// Worker Isolation Test
// Verifies that each strategy runs in a separate worker process without interfering.

import { spawn } from 'child_process';
import path from 'path';

describe('Worker Isolation', () => {
  // Compute project root from test file location: tests/unit/worker/ -> ../../../ to reach project root
  const projectRoot = path.resolve(__dirname, '../../../');
  const workerScript = path.join(projectRoot, 'src/worker/strategyWorker.js');

  // Debug paths
  console.log(`[WorkerTest] __dirname: ${__dirname}`);
  console.log(`[WorkerTest] projectRoot: ${projectRoot}`);
  console.log(`[WorkerTest] workerScript: ${workerScript}`);

  test('two workers execute independent strategies', (done) => {
    console.log('[WorkerTest] Spawning workers...');
    // Run Node directly with JS file
    const workerA = spawn('node', [workerScript, '--strategy', 'macross'], {
      stdio: 'pipe',
      cwd: projectRoot,
    });
    const workerB = spawn('node', [workerScript, '--strategy', 'rsiMacd'], {
      stdio: 'pipe',
      cwd: projectRoot,
    });

    let outA = '';
    let outB = '';
    let aExited = false, bExited = false;
    let aCode, bCode;

    workerA.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log(`[WorkerTest] WorkerA stdout: ${chunk}`);
      outA += chunk;
    });

    workerB.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log(`[WorkerTest] WorkerB stdout: ${chunk}`);
      outB += chunk;
    });

    workerA.stderr.on('data', (data) => {
      console.error(`[WorkerTest] WorkerA stderr: ${data.toString()}`);
    });

    workerB.stderr.on('data', (data) => {
      console.error(`[WorkerTest] WorkerB stderr: ${data.toString()}`);
    });

    workerA.on('exit', (code, signal) => {
      console.log(`[WorkerTest] WorkerA exited with code=${code}, signal=${signal}`);
      aExited = true;
      checkDone();
    });

    workerB.on('exit', (code, signal) => {
      console.log(`[WorkerTest] WorkerB exited with code=${code}, signal=${signal}`);
      bExited = true;
      checkDone();
    });

    const checkDone = () => {
      if (aExited && bExited) {
        console.log(`[WorkerTest] Both exited. outA='${outA}', outB='${outB}'`);
        expect(outA).toContain('MACrossStrategy');
        expect(outB).toContain('RsiMacdStrategy');
        done();
      }
    };
  }, 25000); // 25s timeout
});
