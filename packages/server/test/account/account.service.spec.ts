import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, Logger } from '@nestjs/common';
import { AccountService } from '@src/account/account.service';
import { AccountRepository } from '@src/account/account.repository';
import { AssetRepository } from '@src/asset/asset.repository';
import { AssetService } from '@src/asset/asset.service';
import { CoinListService } from '@src/upbit/coin-list.service';
import { CoinDataUpdaterService } from '@src/upbit/coin-data-updater.service';
import { UserDto } from '@src/account/dtos/my-account.response.dto';
import { CURRENCY_CONSTANTS } from '@src/account/constants/currency.constants';


describe('AccountService', () => {
  let accountService: AccountService;
  let accountRepositoryMock: Partial<AccountRepository>;
  let assetRepositoryMock: Partial<AssetRepository>;
  let assetServiceMock: Partial<AssetService>;
  let coinListServiceMock: Partial<CoinListService>;
  let coinDataUpdaterServiceMock: Partial<CoinDataUpdaterService>;
  let loggerMock: Partial<Logger>;

  beforeEach(async () => {
    accountRepositoryMock = {
      findOne: jest.fn(),
    };

    assetRepositoryMock = {
      find: jest.fn(),
      getAssets: jest.fn(),
    };

    assetServiceMock = {
      calculateEvaluations: jest.fn(),
    };

    coinListServiceMock = {
      getCoinTickers: jest.fn(),
    };

    coinDataUpdaterServiceMock = {
      getCoinNameList: jest.fn(),
    };

    loggerMock = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AccountRepository,
          useValue: accountRepositoryMock,
        },
        {
          provide: AssetRepository,
          useValue: assetRepositoryMock,
        },
        {
          provide: AssetService,
          useValue: assetServiceMock,
        },
        {
          provide: CoinListService,
          useValue: coinListServiceMock,
        },
        {
          provide: CoinDataUpdaterService,
          useValue: coinDataUpdaterServiceMock,
        },
        {
          provide: Logger,
          useValue: loggerMock,
        },
        AccountService,
      ],
    })
    .compile();

    accountService = module.get<AccountService>(AccountService);
  });

  describe('getMyAccountData', () => {
    it('사용자 계정 데이터를 정상적으로 반환한다.', async () => {
      const user = { userId: 1 } as UserDto;
      const mockAccount = { id: 1, KRW: 1000, availableKRW: 800 };
      const mockAssets = [{ assetName: 'BTC', quantity: 2, price: 50000 }];
      const coinNameMap = new Map([['KRW-BTC', '비트코인']]);

      accountRepositoryMock.findOne = jest.fn().mockResolvedValue(mockAccount);
      assetRepositoryMock.find = jest.fn().mockResolvedValue(mockAssets);
      coinDataUpdaterServiceMock.getCoinNameList = jest.fn().mockReturnValue(coinNameMap);

      const result = await accountService.getMyAccountData(user);

      expect(result).toEqual({
        KRW: 1000,
        availableKRW: 800,
        total_bid: 50000,
        coins: [
          {
            img_url: `${CURRENCY_CONSTANTS.UPBIT_IMAGE_URL}BTC.png`,
            koreanName: '비트코인',
            market: 'BTC',
            quantity: 2,
            availableQuantity: undefined,
            price: 50000,
            averagePrice: 25000,
          },
        ],
      });
      expect(loggerMock.log).toHaveBeenCalledWith('계정 데이터 조회 완료: 1'); // 호출 메시지 검증
    });

    it('등록되지 않은 사용자 접근 시 예외를 반환한다.', async () => {
      const user = { userId: 999 } as UserDto;
      accountRepositoryMock.findOne = jest.fn().mockResolvedValue(null);

      await expect(accountService.getMyAccountData(user)).rejects.toThrow(UnauthorizedException);
      expect(loggerMock.warn).toHaveBeenCalledWith('등록되지 않은 사용자 접근: 999');
    });
  });

  describe('getTotalAssetData', () => {
    it('사용자의 총 자산 데이터를 계산하여 반환한다.', async () => {
      const accountId = 1;
      const mockUserCoins = [{ assetName: 'BTC', quantity: 2, price: 50000 }];
      const mockCoinTickers = [{ market: 'KRW-BTC', trade_price: 60000 }];
      const mockEvaluations = [
        { assetName: 'BTC', evaluation_amount: 120000 },
      ];

      assetRepositoryMock.getAssets = jest.fn().mockResolvedValue(mockUserCoins);
      coinListServiceMock.getCoinTickers = jest.fn().mockResolvedValue(mockCoinTickers);
      assetServiceMock.calculateEvaluations = jest.fn().mockResolvedValue(mockEvaluations);

      const result = await accountService.getTotalAssetData(accountId);

      expect(result).toEqual(mockEvaluations);
    });
  });

  describe('getEvaluatedAssets', () => {
    it('총 평가 자산 데이터를 반환한다.', async () => {
      const accountId = 1;
      const mockEvaluations = [
        { assetName: 'BTC', evaluation_amount: 120000 },
      ];
      const mockAccount = { KRW: 1000 };

      jest.spyOn(accountService, 'getTotalAssetData').mockResolvedValue(mockEvaluations);
      accountRepositoryMock.findOne = jest.fn().mockResolvedValue(mockAccount);

      const result = await accountService.getEvaluatedAssets(accountId);

      expect(result).toEqual({
        totalAsset: 121000,
        coinEvaluations: mockEvaluations,
        KRW: 1000,
      });
    });
  });
});
