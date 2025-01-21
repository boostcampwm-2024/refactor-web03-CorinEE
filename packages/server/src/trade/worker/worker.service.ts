import { Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';

@Injectable()
export class WorkerService {
  executeWorkerTask(taskData: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./trade.worker.js', { workerData: taskData });

      worker.on('message', (result) => {
        if (result.success) {
          resolve(result.result);
        } else {
          reject(new Error(result.error));
        }
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }
}
