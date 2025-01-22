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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: Logger,
          useValue: loggerMock,
        },
        AccountRepository,
      ],
    }).compile();

    accountRepository = module.get<AccountRepository>(AccountRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAccountForAdmin', () => {
    it('관리자 계정 생성이 성공적으로 수행된다.', async () => {
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
        execute: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      // When & Then
      await expect(
        accountRepository.updateAccountCurrency(typeGiven, change, accountId, queryRunner),
      ).rejects.toThrow(Error);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // Additional test cases for other methods can be added similarly.
});
