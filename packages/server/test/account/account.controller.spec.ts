import { Test, TestingModule } from '@nestjs/testing';
import { AccountController } from '@src/account/account.controller';
import { AccountService } from '@src/account/account.service';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { MockAuthGuard } from './mockGuard';
import { AuthGuard } from '@src/auth/auth.guard';
import { CustomLogger } from '@src/common/custom-logger';

describe('AccountController', () => {
  let accountController: AccountController;
  let accountServiceMock: Partial<AccountService>;
  let loggerMock: Partial<Logger>;

  beforeEach(async () => {
    accountServiceMock = {
      getMyAccountData: jest.fn(),
      getEvaluatedAssets: jest.fn(),
    };

    loggerMock = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        {
          provide: AccountService,
          useValue: accountServiceMock,
        },
        {
          provide: Logger,
          useValue: loggerMock, 
          // 또는 useClass, useValue, etc. 어떤 식으로든 'AccountLogger' 토큰을 등록해야 함
        },
      ],
    })
    .overrideProvider('AccountLogger')
    .useValue(loggerMock)  // 여기서만 mock 주입
    .overrideGuard(AuthGuard) // 실제 AuthGuard를 MockAuthGuard로 대체
    .useValue(new MockAuthGuard())
    .compile();

    accountController = module.get<AccountController>(AccountController);
  });

  describe('getMyAccount', () => {
    it('사용자 계정 정보를 정상적으로 반환한다.', async () => {
      // Given
      const req = { user: { userId: 1 } } as Request;
      const mockResponse = {
        KRW: 1000,
        availableKRW: 800,
        total_bid: 50000,
        coins: [
          {
            market: 'BTC',
            price: 50000,
            img_url: 'https://static.upbit.com/logos/BTC.png',
            koreanName: '비트코인',
            quantity: 1,
            averagePrice: 50000,
          },
        ],
      };
      jest.spyOn(accountServiceMock, 'getMyAccountData').mockResolvedValue(mockResponse);

      // When
      const result = await accountController.getMyAccount(req);

      // Then
      expect(result).toEqual(mockResponse);
      expect(accountServiceMock.getMyAccountData).toHaveBeenCalledWith(req.user);
    });

    it('인증되지 않은 사용자의 접근을 방지한다.', async () => {
      // Given
      const req = { user: null } as unknown as Request;

      // When & Then
      await expect(accountController.getMyAccount(req)).rejects.toThrow(UnauthorizedException);
    });

    it('서비스 로직에서 오류 발생 시 예외를 반환한다.', async () => {
      // Given
      const req = { user: { userId: 1 } } as Request;
      jest.spyOn(accountServiceMock, 'getMyAccountData').mockRejectedValue(new Error('DB Error'));

      // When & Then
      await expect(accountController.getMyAccount(req)).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('계정 정보 조회 실패: DB Error'),
        expect.any(String), // 스택 트레이스를 포함
      );
    });
  });

  describe('getTotalAsset', () => {
    it('사용자 총 자산 정보를 정상적으로 반환한다.', async () => {
      // Given
      const req = { user: { userId: 1 } } as Request;
      const mockResponse = {
        totalAsset: 120000,
        coinEvaluations: [{ market: 'BTC', evaluation_amount: 120000 }],
        KRW: 1000,
      };
      jest.spyOn(accountServiceMock, 'getEvaluatedAssets').mockResolvedValue(mockResponse);

      // When
      const result = await accountController.getTotalAsset(req);

      // Then
      expect(result).toEqual(mockResponse);
      expect(accountServiceMock.getEvaluatedAssets).toHaveBeenCalledWith(req.user['userId']);
    });

    it('인증되지 않은 사용자의 접근을 방지한다.', async () => {
      // Given
      const req = { user: null } as unknown as Request;

      // When & Then
      await expect(accountController.getTotalAsset(req)).rejects.toThrow(UnauthorizedException);
    });

    it('서비스 로직에서 오류 발생 시 예외를 반환한다.', async () => {
      // Given
      const req = { user: { userId: 1 } } as Request;
      jest.spyOn(accountServiceMock, 'getEvaluatedAssets').mockRejectedValue(new Error('DB Error'));

      // When & Then
      await expect(accountController.getTotalAsset(req)).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('총 자산 조회 실패: DB Error'),
        expect.any(String), // 스택 트레이스를 포함
      );

    });
  });
});
