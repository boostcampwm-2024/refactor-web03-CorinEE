import { NestFactory } from '@nestjs/core';
import { TradeModule } from '../trade.module';
import { parentPort, workerData } from 'worker_threads';
import { BidService } from '../trade-bid.service';

(async () => {
  const { bidService } = workerData; // 메인 프로세스에서 전달된 BidService 가져오기

  try {
    const { user, data } = workerData;
    if (data.type === 'bid') {
      const result = await bidService.createBidTrade(user, data); // 서비스 호출
      parentPort?.postMessage({ success: true, result });
    } else {
      throw new Error('Invalid trade type');
    }
  } catch (error) {
    parentPort?.postMessage({ success: false, error: error.message });
  }
})();