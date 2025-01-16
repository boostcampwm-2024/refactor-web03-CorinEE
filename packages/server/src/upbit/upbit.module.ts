import { Module, Global, Logger } from '@nestjs/common';
import { CoinTickerService } from './SSE/coin-ticker-websocket.service';
import { UpbitController } from './upbit.controller';
import { CoinListService } from './coin-list.service';
import { HttpModule } from '@nestjs/axios';
import { SseService } from './SSE/sse.service';
import { OrderbookService } from './SSE/orderbook-websocket.service';
import { CoinDataUpdaterService } from './coin-data-updater.service';
import { ChartService } from './chart.service';
import { CustomLogger } from '@src/common/custom-logger';

@Global()
@Module({
  imports: [HttpModule],
  providers: [
    CoinTickerService,
    CoinListService,
    SseService,
    OrderbookService,
    CoinDataUpdaterService,
    ChartService,
    Logger,
    {
      provide: 'CoinUpdaterLogger',
      useFactory: () => {
        return new CustomLogger('CoinDataUpdaterService');
      },
    },
  ],
  controllers: [UpbitController],
  exports: [CoinDataUpdaterService],
})
export class UpbitModule {}
