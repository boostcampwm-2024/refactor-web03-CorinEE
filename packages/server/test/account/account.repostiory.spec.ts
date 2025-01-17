import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, UnprocessableEntityException, Logger } from '@nestjs/common';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Account } from '@src/account/account.entity';
import { User } from '@src/auth/user.entity';
import { AccountRepository } from '@src/account/account.repository';
import { CURRENCY_CONSTANTS } from '@src/account/constants/currency.constants';
import { UserDto } from '@src/account/dtos/my-account.response.dto';
import { formatQuantity } from '@src/trade/helpers/trade.helper';

describe('AccountRepository', () => {
  let accountRepository: AccountRepository;
  let queryRunnerMock: Partial<QueryRunner>;
  let loggerMock: Partial<Logger>;

  beforeEach(async () => {
    queryRunnerMock = {
      manager: {
        save: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        }),
        findOne: jest.fn(),
      } as any,
    };

    loggerMock = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const dataSourceMock = {
      createEntityManager: jest.fn().mockReturnValue(queryRunnerMock.manager),
    } as Partial<DataSource>;
  
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: Logger,
          useValue: loggerMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        AccountRepository,
      ],
    })    
    .compile();

    accountRepository = module.get<AccountRepository>(AccountRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAccountForAdmin', () => {
    it('관리자 계정 생성이 정상적으로 수행된다.', async () => {
      // Given
      const adminUser = { id: 1 } as User;
      const accountMock = new Account();

      accountRepository.save = jest.fn().mockResolvedValue(accountMock);

      // When
      await accountRepository.createAccountForAdmin(adminUser);

      // Then
      expect(accountRepository.save).toHaveBeenCalledTimes(1);
      expect(loggerMock.log).toHaveBeenCalledWith(
        `관리자 계정 생성 완료: ${adminUser.id}`,
      );
    });

    it('관리자 계정 생성 실패 시 예외 처리 확인.', async () => {
      // Given
      const adminUser = { id: 1 } as User;
      accountRepository.save = jest.fn().mockRejectedValue(new Error('DB Error'));

      // When & Then
      await expect(
        accountRepository.createAccountForAdmin(adminUser),
      ).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('getMyMoney', () => {
    it('잔액 조회가 정상적으로 수행된다.', async () => {
      // Given
      const userDto = { userId: 1 } as UserDto;
      const accountMock = { KRW: 1000 } as Account;
      accountRepository.findOne = jest.fn().mockResolvedValue(accountMock);

      // When
      const result = await accountRepository.getMyMoney(userDto, 'KRW');

      // Then
      expect(result).toEqual(1000);
    });

    it('잔액 조회 실패 시 예외 처리 확인.', async () => {
      // Given
      const userDto = { userId: 1 } as UserDto;
      accountRepository.findOne = jest.fn().mockRejectedValue(new Error('DB Error'));

      // When & Then
      await expect(accountRepository.getMyMoney(userDto, 'KRW')).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('updateAccountCurrency', () => {
    it('계정 통화 업데이트가 성공적으로 수행된다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const accountId = 1;
      const typeGiven = 'KRW';
      const change = 500;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      // When
      await accountRepository.updateAccountCurrency(typeGiven, change, accountId, queryRunner);

      // Then
      expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalledWith(
        `계정 통화 업데이트 완료: accountId=${accountId}`,
      );
    });

    it('계정 통화 업데이트 실패 시 예외 처리 확인.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const accountId = 1;
      const typeGiven = 'KRW';
      const change = 500;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      // When & Then
      await expect(
        accountRepository.updateAccountCurrency(typeGiven, change, accountId, queryRunner),
      ).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('소수점 8자리 초과 입력 처리 확인.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const accountId = 1;
      const typeGiven = 'KRW';
      const change = 0.123456789;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      // When & Then
      await expect(
        accountRepository.updateAccountCurrency(typeGiven, change, accountId, queryRunner),
      ).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('validateUserAccount', () => {
    it('사용자 계정 검증이 정상적으로 수행된다.', async () => {
      // Given
      const userId = 1;
      const accountMock = new Account();
      accountRepository.findOne = jest.fn().mockResolvedValue(accountMock);

      // When
      const result = await accountRepository.validateUserAccount(userId);

      // Then
      expect(result).toEqual(accountMock);
    });

    it('없는 사용자 계정 입력 시 예외 처리 확인.', async () => {
      // Given
      const userId = 999;
      accountRepository.findOne = jest.fn().mockResolvedValue(null);

      // When & Then
      await expect(accountRepository.validateUserAccount(userId)).rejects.toThrow(UnprocessableEntityException);
      expect(loggerMock.warn).toHaveBeenCalled();
    });
  });

  describe('getAvailableKRW', () => {
    it('계정의 가용 KRW 조회가 정상적으로 수행된다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const accountId = 1;
      const accountMock = { availableKRW: 1000 } as Account;
      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(accountMock),
      });
  

      // When
      const result = await accountRepository.getAvailableKRW(accountId, queryRunner);

      // Then
      expect(result).toEqual(1000);
    });

    it('존재하지 않는 계정의 가용 KRW 조회 시 예외 처리 확인.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const accountId = 999;
      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
  

      // When & Then
      await expect(accountRepository.getAvailableKRW(accountId, queryRunner)).rejects.toThrow(Error);
    });
  });

  describe('updateAccountBTC', () => {
    it('BTC 잔액 업데이트가 정상적으로 수행된다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const accountId = 1;
      const quantity = 0.12345678;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      // When
      await accountRepository.updateAccountBTC(accountId, quantity, queryRunner);

      // Then
      expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalledWith(
        `BTC 잔액 업데이트 완료: accountId=${accountId}`,
      );
    });

    it('BTC 잔액 업데이트 실패 시 예외 처리 확인.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const accountId = 1;
      const quantity = 0.12345678;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      // When & Then
      await expect(accountRepository.updateAccountBTC(accountId, quantity, queryRunner)).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
