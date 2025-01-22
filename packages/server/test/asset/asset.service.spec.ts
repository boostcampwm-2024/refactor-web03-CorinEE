// asset.service.spec.ts

import { AssetService } from '../../src/asset/asset.service';
import { Coin, CurrentPrice } from '../../src/asset/dtos/asset.interface';

describe('AssetService', () => {
  let assetService: AssetService;

  beforeEach(() => {
    assetService = new AssetService();
  });

  describe('calculateEvaluations', () => {
    it('단일 코인 - 정상 케이스', () => {
      // Arrange
      const coins: Coin[] = [
        { code: 'KRW-BTC', price: 40000, quantity: 2 },
      ];
      const currentPrices: CurrentPrice[] = [
        { code: 'KRW-BTC', trade_price: 45000 },
      ];

      // Act
      const result = assetService.calculateEvaluations(coins, currentPrices);

      // Assert
      expect(result).toHaveLength(1);
      const [btc] = result;
      expect(btc.code).toBe('KRW-BTC');
      expect(btc.avg_purchase_price).toBe(20000); // 40000 / 2
      expect(btc.trade_price).toBe(45000);
      expect(btc.quantity).toBe(2);
      expect(btc.evaluation_amount).toBe(90000); // 45000 * 2
      expect(btc.profit_loss).toBe(50000);       // (45000 - 20000) * 2
      expect(btc.profit_loss_rate).toBeCloseTo(125); // 부동소수점 대비 toBeCloseTo
    });

    it('여러 코인 - 모두 정상 매칭', () => {
      // Arrange
      const coins: Coin[] = [
        { code: 'KRW-BTC', price: 200000, quantity: 10 },
        { code: 'KRW-ETH', price: 1500, quantity: 5 },
      ];
      const currentPrices: CurrentPrice[] = [
        { code: 'KRW-BTC', trade_price: 23000 },
        { code: 'KRW-ETH', trade_price: 1600 },
      ];

      // Act
      const result = assetService.calculateEvaluations(coins, currentPrices);

      // Assert
      expect(result).toHaveLength(2);

      const btc = result.find((r) => r.code === 'KRW-BTC');
      expect(btc.avg_purchase_price).toBe(20000); // 200000 / 10
      expect(btc.trade_price).toBe(23000);
      expect(btc.quantity).toBe(10);
      expect(btc.evaluation_amount).toBe(230000);
      expect(btc.profit_loss).toBe(30000);
      expect(btc.profit_loss_rate).toBeCloseTo(15);

      const eth = result.find((r) => r.code === 'KRW-ETH');
      expect(eth.avg_purchase_price).toBe(300); // 1500 / 5
      expect(eth.trade_price).toBe(1600);
      expect(eth.quantity).toBe(5);
      expect(eth.evaluation_amount).toBe(8000);
      expect(eth.profit_loss).toBe(6500);           // (1600-300)*5
      expect(eth.profit_loss_rate).toBeCloseTo(433.33);
    });

    it('현재가가 없는 경우 에러 발생', () => {
      // Arrange
      const coins: Coin[] = [
        { code: 'KRW-BTC', price: 40000, quantity: 2 },
      ];
      const currentPrices: CurrentPrice[] = []; // 비어있음

      // Act & Assert
      expect(() =>
        assetService.calculateEvaluations(coins, currentPrices),
      ).toThrowError('현재가 데이터가 없습니다: KRW-BTC');
    });

    it('음수 price/quantity 등 엣지 케이스 (비즈니스 규칙에 따라 처리가능)', () => {
      // Arrange
      const coins: Coin[] = [
        { code: 'KRW-BTC', price: -1, quantity: 2 }, // 음수 price
      ];
      const currentPrices: CurrentPrice[] = [
        { code: 'KRW-BTC', trade_price: 1000 },
      ];

      // Act
      // 현재 코드상 단순 계산은 가능 (avg_purchase_price가 -0.5)
      // 적절히 Truncate 하긴 하지만, 비즈니스적으로 말이 안 되므로 에러 처리할 수도 있음

      // 여기서는 "그냥 계산된다"고 가정
      const [btcEval] = assetService.calculateEvaluations(coins, currentPrices);

      // Assert
      // 확인: avg_purchase_price = -0.5 (Truncate 8자리 => -0.5)
      expect(btcEval.avg_purchase_price).toBeCloseTo(-0.5, 8);
      // evaluation_amount = 1000 * 2 = 2000
      // profit_loss = (1000 - -0.5) * 2 = 2001
      expect(btcEval.profit_loss).toBeCloseTo(2001, 8);
    });
  });
});
