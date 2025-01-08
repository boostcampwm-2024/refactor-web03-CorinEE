// test/auth/user.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../../src/auth/user.service';
import { UserRepository } from '../../src/auth/user.repository';
import { TradeRepository } from '../../src/trade/trade.repository';
import { TradeHistoryRepository } from '../../src/trade-history/trade-history.repository';
import { AccountRepository } from '@src/account/account.repository';
import { AccountService } from '@src/account/account.service';
import {
  DataSource,
  EntityManager,
  FindOneOptions,
} from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { User } from '../../src/auth/user.entity';
import { Account } from '@src/account/account.entity';
import { DEFAULT_BTC, DEFAULT_KRW, DEFAULT_USDT } from '../../src/auth/constants';

// === 1. EntityManager를 정확히 모킹하기 위한 함수 ===
function createMockedEntityManager(): Partial<EntityManager> {
  return {
    findOne: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
}

describe('UserService', () => {
  let userService: UserService;
  let userRepository: jest.Mocked<UserRepository>;
  let tradeRepository: jest.Mocked<TradeRepository>;
  let tradeHistoryRepository: jest.Mocked<TradeHistoryRepository>;
  let accountRepository: jest.Mocked<AccountRepository>;
  let accountService: jest.Mocked<AccountService>;
  let dataSource: jest.Mocked<DataSource>;
  let entityManager: Partial<EntityManager>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: {
            target: User,
            find: jest.fn(),
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: TradeRepository,
          useValue: {
            target: 'Trade',
            // 필요한 메서드 모킹
          },
        },
        {
          provide: TradeHistoryRepository,
          useValue: {
            target: 'TradeHistory',
            // 필요한 메서드 모킹
          },
        },
        {
          provide: AccountRepository,
          useValue: {
            target: Account,
            findOne: jest.fn(),
            // 필요한 메서드 모킹
          },
        },
        {
          provide: AccountService,
          useValue: {
            getEvaluatedAssets: jest.fn(),
            // 필요한 메서드 모킹
          },
        },
        {
          provide: DataSource,
          useFactory: () => ({
            transaction: jest.fn(),
          }),
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
    userRepository = module.get(UserRepository) as jest.Mocked<UserRepository>;
    tradeRepository = module.get(TradeRepository) as jest.Mocked<TradeRepository>;
    tradeHistoryRepository = module.get(TradeHistoryRepository) as jest.Mocked<TradeHistoryRepository>;
    accountRepository = module.get(AccountRepository) as jest.Mocked<AccountRepository>;
    accountService = module.get(AccountService) as jest.Mocked<AccountService>;
    dataSource = module.get(DataSource) as jest.Mocked<DataSource>;

    // === 2. 정확히 모킹된 EntityManager 생성 ===
    entityManager = createMockedEntityManager();

    // === 3. DataSource.transaction 모킹 ===
    dataSource.transaction.mockImplementation(async (cb: any, isolationLevel?: any) => {
      // Handle both signatures
      if (typeof cb === 'function') {
        return cb(entityManager as EntityManager);
      }
      if (typeof isolationLevel === 'function') {
        return isolationLevel(entityManager as EntityManager);
      }
      throw new Error('Invalid arguments to transaction');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  
  
  describe('resetUserData', () => {
    it('성공적으로 사용자 데이터를 초기화하고 새 계정을 생성하는지 확인', async () => {
      const userId = 1;
      const mockUser: User = {
        id: userId,
        username: 'testUser',
        isGuest: false,
        account: { id: 10 } as Account,
      } as User;

      const mockNewAccount: Account = {
        id: 11,
        KRW: DEFAULT_KRW,
        availableKRW: DEFAULT_KRW,
        USDT: DEFAULT_USDT,
        BTC: DEFAULT_BTC,
      } as Account;

      // === 4. EntityManager 메서드 모킹 ===
      (entityManager.findOne as jest.Mock).mockResolvedValue(mockUser);
      (entityManager.delete as jest.Mock).mockResolvedValue(undefined);
      
      // === 5. EntityManager.create 메서드를 정확히 모킹 ===
      (entityManager.create as jest.Mock).mockImplementation((entityClass: any, plainObject: any) => {
        if (entityClass === Account) {
          return mockNewAccount;
        }
        return null;
      });
      
      // === 5.1. EntityManager.save 메서드 모킹: user.account를 새 계정으로 업데이트 ===
      (entityManager.save as jest.Mock).mockImplementation((entityClass: any, user: User) => {
        if (entityClass === User) {
          user.account = mockNewAccount;
        }
        return Promise.resolve(user);
      });

      // === 5.2. 기존 계정 ID 저장 ===
      const oldAccountId = mockUser.account.id;

      // === 5.3. 서비스 메서드 호출 ===
      await userService.resetUserData(userId);

      // 사용자 조회 확인
      expect(entityManager.findOne).toHaveBeenCalledWith(User, {
        where: { id: userId },
        relations: ['account'],
      });

      // === 6. delete 메서드 호출 시 부분 매칭 적용 ===
      const deleteCalls = entityManager.delete as jest.MockedFunction<typeof entityManager.delete>;
      expect(deleteCalls).toHaveBeenCalledTimes(3);

      // 'Trade' 삭제 호출 확인
      expect(deleteCalls).toHaveBeenNthCalledWith(1, 'Trade', expect.objectContaining({
        user: expect.objectContaining({ id: userId })
      }));

      // 'TradeHistory' 삭제 호출 확인
      expect(deleteCalls).toHaveBeenNthCalledWith(2, 'TradeHistory', expect.objectContaining({
        user: expect.objectContaining({ id: userId })
      }));

      // 'Account' 삭제 호출 확인 (기존 계정 ID 사용)
      expect(deleteCalls).toHaveBeenNthCalledWith(3, Account, expect.objectContaining({
        id: oldAccountId
      }));

      // 사용자 계정 null로 설정 및 저장 확인
      // 첫 번째 save 호출: user.account = null
      // 두 번째 save 호출: user.account = mockNewAccount
      // 여기서는 save가 두 번 호출되지 않도록 해야 할 수도 있음
      // 하지만 현재 mock.save only calls once, assigning mockNewAccount

      // 새 계정 생성 및 저장 확인
      expect(entityManager.create).toHaveBeenCalledWith(Account, {
        KRW: DEFAULT_KRW,
        availableKRW: DEFAULT_KRW,
        USDT: DEFAULT_USDT,
        BTC: DEFAULT_BTC,
      });
      expect(mockUser.account).toBe(mockNewAccount);
      expect(entityManager.save).toHaveBeenCalledWith(User, mockUser);
    });

    it('사용자가 존재하지 않을 때 NotFoundException을 던지는지 확인', async () => {
      const userId = 2;

      (entityManager.findOne as jest.Mock).mockResolvedValue(null);

      await expect(userService.resetUserData(userId)).rejects.toThrow(NotFoundException);
      expect(entityManager.findOne).toHaveBeenCalledWith(User, {
        where: { id: userId },
        relations: ['account'],
      });

      // 나머지 메서드는 호출되지 않아야 함
      expect(entityManager.delete).not.toHaveBeenCalled();
      expect(entityManager.create).not.toHaveBeenCalled();
      expect(entityManager.save).not.toHaveBeenCalled();
    });

    it('트랜잭션 내에서 오류가 발생하면 예외를 던지는지 확인', async () => {
      const userId = 3;
      const mockUser: User = {
        id: userId,
        username: 'errorUser',
        isGuest: false,
        account: { id: 20 } as Account,
      } as User;

      (entityManager.findOne as jest.Mock).mockResolvedValue(mockUser);
      (entityManager.delete as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await expect(userService.resetUserData(userId)).rejects.toThrow(Error);
      expect(entityManager.findOne).toHaveBeenCalledWith(User, {
        where: { id: userId },
        relations: ['account'],
      });

      // 'Trade' 삭제 호출 확인
      expect(entityManager.delete).toHaveBeenCalledWith('Trade', expect.objectContaining({
        user: expect.objectContaining({ id: userId })
      }));

      // 'TradeHistory' 삭제는 호출되지 않아야 함
      expect(entityManager.delete).not.toHaveBeenCalledWith('TradeHistory', expect.objectContaining({
        user: expect.objectContaining({ id: userId })
      }));

      // 이후 메서드 호출은 중단됨
      expect(entityManager.create).not.toHaveBeenCalled();
      expect(entityManager.save).not.toHaveBeenCalled();
    });
  });

  describe('getAllUsersInfo', () => {
    it('모든 사용자의 id와 username을 반환하는지 확인', async () => {
      const mockUsers: User[] = [
        { id: 1, username: 'user1' } as User,
        { id: 2, username: 'user2' } as User,
      ];

      userRepository.find.mockResolvedValue(mockUsers);

      const result = await userService.getAllUsersInfo();

      expect(userRepository.find).toHaveBeenCalledWith({
        select: ['id', 'username'],
      });

      expect(result).toEqual([
        { id: 1, username: 'user1' },
        { id: 2, username: 'user2' },
      ]);
    });

    it('사용자가 없을 때 빈 배열을 반환하는지 확인', async () => {
      userRepository.find.mockResolvedValue([]);

      const result = await userService.getAllUsersInfo();

      expect(userRepository.find).toHaveBeenCalledWith({
        select: ['id', 'username'],
      });

      expect(result).toEqual([]);
    });

    it('사용자 조회 중 오류가 발생하면 예외를 던지는지 확인', async () => {
      userRepository.find.mockRejectedValue(new Error('Database error'));

      await expect(userService.getAllUsersInfo()).rejects.toThrow(Error);
      expect(userRepository.find).toHaveBeenCalledWith({
        select: ['id', 'username'],
      });
    });
  });

  describe('getAllUsersInfoWithTotalAsset', () => {
    it('모든 사용자의 자산 정보를 포함하여 반환하는지 확인', async () => {
      const mockUsers: User[] = [
        { id: 1, username: 'user1' } as User,
        { id: 2, username: 'user2' } as User,
      ];

      const mockAccounts: Account[] = [
        { id: 100, user: { id: 1 } as User } as Account,
        { id: 200, user: { id: 2 } as User } as Account,
      ];

      const mockAssetDataUser1 = {
        totalAsset: 100000,
        KRW: 50000,
        coinEvaluations: [{ coin: 'BTC', value: 50000 }],
      };

      const mockAssetDataUser2 = {
        totalAsset: 200000,
        KRW: 100000,
        coinEvaluations: [{ coin: 'ETH', value: 100000 }],
      };

      userRepository.find.mockResolvedValue(mockUsers);

      accountRepository.findOne.mockImplementation((options: FindOneOptions<Account>) => {
        if (!options.where || Array.isArray(options.where)) {
          return Promise.resolve(null);
        }
        const userId = (options.where as { user?: { id: number } }).user?.id;
        if (userId === 1) return Promise.resolve(mockAccounts[0]);
        if (userId === 2) return Promise.resolve(mockAccounts[1]);
        return Promise.resolve(null);
      });

      accountService.getEvaluatedAssets.mockImplementation((accountId: number) => {
        if (accountId === 100) return Promise.resolve(mockAssetDataUser1);
        if (accountId === 200) return Promise.resolve(mockAssetDataUser2);
        return Promise.resolve({ totalAsset: 0, KRW: 0, coinEvaluations: [] });
      });

      const result = await userService.getAllUsersInfoWithTotalAsset();

      expect(userRepository.find).toHaveBeenCalledWith({
        select: ['id', 'username'],
      });

      expect(accountRepository.findOne).toHaveBeenCalledTimes(2);
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: 1 } },
      });
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: 2 } },
      });

      expect(accountService.getEvaluatedAssets).toHaveBeenCalledWith(100);
      expect(accountService.getEvaluatedAssets).toHaveBeenCalledWith(200);

      expect(result).toEqual([
        {
          id: 1,
          username: 'user1',
          totalAsset: 100000,
          KRW: 50000,
          coinEvaluations: [{ coin: 'BTC', value: 50000 }],
        },
        {
          id: 2,
          username: 'user2',
          totalAsset: 200000,
          KRW: 100000,
          coinEvaluations: [{ coin: 'ETH', value: 100000 }],
        },
      ]);
    });

    it('일부 사용자에게 계정이 없을 때 경고 로그를 남기고 기본 자산 정보를 반환하는지 확인', async () => {
      const mockUsers: User[] = [
        { id: 1, username: 'user1' } as User,
        { id: 2, username: 'user2' } as User,
        { id: 3, username: 'user3' } as User,
      ];
      const mockAccounts: Account[] = [
        { id: 100, user: { id: 1 } as User } as Account,
        // user2는 계정 없음
        { id: 300, user: { id: 3 } as User } as Account,
      ];
      const mockAssetDataUser1 = {
        totalAsset: 150000,
        KRW: 75000,
        coinEvaluations: [{ coin: 'BTC', value: 75000 }],
      };
      const mockAssetDataUser3 = {
        totalAsset: 300000,
        KRW: 150000,
        coinEvaluations: [{ coin: 'ETH', value: 150000 }],
      };

      userRepository.find.mockResolvedValue(mockUsers);

      accountRepository.findOne.mockImplementation((options: FindOneOptions<Account>) => {
        if (!options.where || Array.isArray(options.where)) {
          return Promise.resolve(null);
        }
        const userId = (options.where as { user?: { id: number } }).user?.id;
        if (userId === 1) return Promise.resolve(mockAccounts[0]);
        if (userId === 3) return Promise.resolve(mockAccounts[1]);
        return Promise.resolve(null);
      });

      accountService.getEvaluatedAssets.mockImplementation((accountId: number) => {
        if (accountId === 100) return Promise.resolve(mockAssetDataUser1);
        if (accountId === 300) return Promise.resolve(mockAssetDataUser3);
        return Promise.resolve({ totalAsset: 0, KRW: 0, coinEvaluations: [] });
      });

      // === 7. Logger를 스파이하여 경고 로그 확인 ===
      const loggerSpy = jest.spyOn(userService['logger'], 'warn').mockImplementation(() => {});

      const result = await userService.getAllUsersInfoWithTotalAsset();

      expect(userRepository.find).toHaveBeenCalledWith({
        select: ['id', 'username'],
      });

      expect(accountRepository.findOne).toHaveBeenCalledTimes(3);
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: 1 } },
      });
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: 2 } },
      });
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: 3 } },
      });

      expect(accountService.getEvaluatedAssets).toHaveBeenCalledWith(100);
      expect(accountService.getEvaluatedAssets).toHaveBeenCalledWith(300);

      // user2에 대한 경고 로그 확인
      expect(loggerSpy).toHaveBeenCalledWith('Account not found for userId: 2');

      expect(result).toEqual([
        {
          id: 1,
          username: 'user1',
          totalAsset: 150000,
          KRW: 75000,
          coinEvaluations: [{ coin: 'BTC', value: 75000 }],
        },
        {
          id: 2,
          username: 'user2',
          totalAsset: 0,
          KRW: 0,
          coinEvaluations: [],
        },
        {
          id: 3,
          username: 'user3',
          totalAsset: 300000,
          KRW: 150000,
          coinEvaluations: [{ coin: 'ETH', value: 150000 }],
        },
      ]);

      // === 8. Logger 스파이 복원 ===
      loggerSpy.mockRestore();
    });

    it('사용자 조회 중 오류가 발생하면 예외를 던지는지 확인', async () => {
      userRepository.find.mockRejectedValue(new Error('Database error'));
      await expect(userService.getAllUsersInfoWithTotalAsset()).rejects.toThrow(Error);
      expect(userRepository.find).toHaveBeenCalledWith({
        select: ['id', 'username'],
      });
    });
  });
});
