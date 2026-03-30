import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './logger';

/**
 * 工作线程运行的任务函数类型
 */
export type WorkerTask<TInput, TOutput> = (input: TInput) => Promise<TOutput> | TOutput;

/**
 * Worker 选项
 */
export interface WorkerOptions {
  /**
   * 超时时间 (毫秒)
   */
  timeout?: number;
  /**
   * 资源限制 (内存限制)
   */
  maxMemory?: number;  // MB
  /**
   * 策略代码路径 (E.g., /path/to/strategy.ts)
   */
  strategyPath?: string;
}

/**
 * 运行在线程池中的工作者
 */
export class ThreadWorker<TInput = any, TOutput = any> {
  private worker: Worker;
  private timeout: number;
  private logger = getLogger().child({ module: 'ThreadWorker' });
  private resolveMap: Map<number, (value: any) => void> = new Map();
  private rejectMap: Map<number, (reason?: any) => void> = new Map();
  private taskIdCounter: number = 0;
  private isReady: boolean = false;

  constructor(
    entry: string,
    options: WorkerOptions = {}
  ) {
    this.timeout = options.timeout || 30000;

    // Worker options: resource limits if needed
    const workerOptions: any = {};
    if (options.maxMemory) {
      workerOptions.resourceLimits = {
        maxOldGenerationSizeMb: options.maxMemory,
      };
    }

    this.worker = new Worker(entry, {
      ...workerOptions,
      workerData: { strategyPath: options.strategyPath },
    });

    this.worker.on('message', (msg: any) => {
      if (msg.type === 'ready') {
        this.isReady = true;
        this.logger.info('Worker ready', { entry });
      } else if (msg.type === 'result') {
        const { taskId, result } = msg;
        const resolve = this.resolveMap.get(taskId);
        if (resolve) {
          resolve(result);
          this.resolveMap.delete(taskId);
        }
      } else if (msg.type === 'error') {
        const { taskId, error } = msg;
        const reject = this.rejectMap.get(taskId);
        if (reject) {
          reject(new Error(error));
          this.rejectMap.delete(taskId);
        }
      }
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error('Worker error', { err, entry });
      // Reject all pending tasks
      for (const [taskId, reject] of this.rejectMap.entries()) {
        reject(err);
        this.rejectMap.delete(taskId);
      }
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        this.logger.warn(`Worker exited with code ${code}`);
      }
    });
  }

  /**
   * 执行任务
   */
  async execute(input: TInput, options?: { timeoutMs?: number }): Promise<TOutput> {
    if (!this.isReady) {
      await new Promise(resolve => {
        const checkReady = setInterval(() => {
          if (this.isReady) {
            clearInterval(checkReady);
            resolve(undefined);
          }
        }, 10);
      });
    }

    const taskId = ++this.taskIdCounter;
    const timeoutMs = options?.timeoutMs || this.timeout;

    return new Promise((resolve, reject) => {
      this.resolveMap.set(taskId, resolve);
      this.rejectMap.set(taskId, reject);

      // 设置超时
      const timer = setTimeout(() => {
        this.resolveMap.delete(taskId);
        this.rejectMap.delete(taskId);
        this.worker.terminate().catch(() => {});
        reject(new Error(`Task ${taskId} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // 发送任务
      this.worker.postMessage({
        type: 'task',
        taskId,
        input,
      });

      // 清理定时器
      const originalResolve = resolve;
      const wrappedResolve = (value: any) => {
        clearTimeout(timer);
        originalResolve(value);
      };
      const originalReject = reject;
      const wrappedReject = (reason?: any) => {
        clearTimeout(timer);
        originalReject(reason);
      };

      // Replace maps with wrapped versions
      this.resolveMap.set(taskId, wrappedResolve);
      this.rejectMap.set(taskId, wrappedReject);
    });
  }

  /**
   * 终止 worker
   */
  async terminate(): Promise<void> {
    return this.worker.terminate();
  }
}

/**
 * 运行一次性任务
 */
export async function runInWorker<TInput, TOutput>(
  strategyPath: string,
  task: WorkerTask<TInput, TOutput>,
  input: TInput,
  options: WorkerOptions = {}
): Promise<TOutput> {
  const worker = new ThreadWorker<TInput, TOutput>(strategyPath, {
    ...options,
    strategyPath,
  });

  try {
    const result = await worker.execute(input);
    return result;
  } finally {
    await worker.terminate();
  }
}

/**
 * 如果是主线程，可以导出 worker 内容
 */
if (!isMainThread) {
  // 在 worker 线程中运行
  const { strategyPath } = workerData as { strategyPath?: string };
  
  if (strategyPath) {
    // 动态加载策略模块
    import(strategyPath).then(module => {
      const strategyFn = module.default || module;
      // 通知主线程已就绪
      parentPort?.postMessage({ type: 'ready' });

      // 处理任务
      parentPort?.on('message', async (msg: any) => {
        if (msg.type === 'task') {
          const { taskId, input } = msg;
          try {
            const result = await strategyFn(input);
            parentPort?.postMessage({ type: 'result', taskId, result });
          } catch (error: any) {
            parentPort?.postMessage({ type: 'error', taskId, error: error.message });
          }
        }
      });
    }).catch(err => {
      parentPort?.postMessage({ type: 'error', error: err.message });
    });
  }
}
