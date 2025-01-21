import { Injectable } from '@nestjs/common';
import { Worker } from 'worker_threads';
import { BidService } from './trade-bid.service';
import { join } from 'path';

@Injectable()
export class WorkerPoolService {
  private pool: Worker[] = [];
  private taskQueue: any[] = [];
  private readonly maxWorkers: number = 4; // 워커 풀 크기

  constructor(private readonly bidService: BidService) {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker();
    }
  }

  private createWorker() {
    const workerPath = join(__dirname, 'worker', 'trade.worker.js');
    const worker = new Worker(workerPath); // 워커 파일 경로

    worker.on('message', (result) => {
      const task = this.taskQueue.shift();
      if (task) {
        worker.postMessage(task.data);
        task.resolve(result);
      } else {
        this.pool.push(worker); // 작업 완료 후 워커를 다시 풀에 추가
      }
    });

    worker.on('error', (error) => {
      console.error('Worker error:', error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker exited with code ${code}`);
      }
    });
  }

  async executeTask(user: any, taskData: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const availableWorker = this.pool.pop();
      if (availableWorker) {
        // `user`와 `taskData`를 함께 워커로 전달
        availableWorker.postMessage({ user, data: taskData });
        availableWorker.on('message', resolve);
        availableWorker.on('error', reject);
      } else {
        // 대기열에 작업 추가
        this.taskQueue.push({ user, data: taskData, resolve, reject });
      }
    });
  }
}
