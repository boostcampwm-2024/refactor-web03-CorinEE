// asset.repository.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';
import { AssetRepository } from '../../src/asset/asset.repository';
import { Asset } from '../../src/asset/asset.entity';
import { Account } from '../../src/account/account.entity';
import { Coin } from '../../src/asset/dtos/asset.interface';

/**
 * 주의:
 * - 본 테스트가 통과하려면, AssetRepository 내부에
 *   "소수점 8자리를 초과하는 price/quantity 입력 시 예외를 던지는 로직"이 있어야 합니다.
 * - 예: createAsset 안에서:
 *     function ensureMax8Decimals(value: number) { ... }
 *     if (...소수점 길이 > 8...) throw new InternalServerErrorException(...)
 */

describe('AssetRepository', () => {
  let assetRepository: AssetRepository;
  let dataSourceMock: Partial<DataSource>;
  let queryRunnerMock: Partial<QueryRunner>;
  let loggerMock: Partial<Logger>;

  beforeEach(async () => {
    // QueryRunner Mock 설정
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
      } as Partial<EntityManager> as EntityManager,
      // "as Partial<EntityManager> as EntityManager"를 쓰는 이유:
      //   테스트 시 manager 프로퍼티가 실제 EntityManager가 아닌 Mock 객체이므로,
      //   TypeScript 호환성을 맞추기 위해 'as EntityManager' 형태로 강제 캐스팅
    };

    // DataSource Mock 설정
    dataSourceMock = {
      createEntityManager: jest.fn().mockReturnValue({}),
    };

    // Logger Mock 설정
    loggerMock = {
      log: jest.fn(),
      error: jest.fn(),
    };

    // NestJS TestingModule 생성
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: Logger,
          useValue: loggerMock,
        },
        AssetRepository, // 테스트 대상
      ],
    }).compile();

    // 실제 Repository 인스턴스 가져오기
    assetRepository = module.get<AssetRepository>(AssetRepository);
  });

  // 개별 테스트 후에 mock을 초기화
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------
  // createAsset
  // ---------------------------------------------------------
  describe('createAsset', () => {
    it('자산 생성에 성공하면 생성된 자산을 반환해야 한다.', async () => {
      // Given
      const account: Account = { id: 1 } as Account;
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 10;

      queryRunner.manager.save = jest.fn().mockResolvedValue(mockAsset);

      // When
      const result = await assetRepository.createAsset(
        'BTC',
        account,
        30000,
        2,
        queryRunner,
      );

      // Then
      expect(queryRunner.manager.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockAsset);
      expect(loggerMock.log).toHaveBeenCalledWith(
        `자산 생성 완료: assetId=${mockAsset.assetId}`,
      );
    });

    it('자산 생성 도중 예외가 발생하면 InternalServerErrorException을 던져야 한다.', async () => {
      // Given
      const account: Account = { id: 1 } as Account;
      const queryRunner = queryRunnerMock as QueryRunner;

      queryRunner.manager.save = jest.fn().mockRejectedValue(new Error('DB Error'));

      // When & Then
      await expect(
        assetRepository.createAsset('BTC', account, 30000, 2, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    /**
     * 추가 테스트:
     *  price 또는 quantity가 소수점 8자리를 초과할 경우, 예외를 던지는지 확인.
     *  -> 실제 AssetRepository 내부에 8자리 초과 검사 로직 필요 (없으면 이 테스트 실패)
     */
    it('소수점 8자리를 초과하는 price/quantity가 들어오면 예외를 던진다.', async () => {
      // Given
      const account: Account = { id: 1 } as Account;
      const queryRunner = queryRunnerMock as QueryRunner;

      // 9자리 소수
      const invalidPrice = 123.4567890123;
      const invalidQuantity = 0.123456789; // 9자리

      // When & Then
      await expect(
        assetRepository.createAsset('BTC', account, invalidPrice, invalidQuantity, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);

      // 예외 발생 시 logger.error 호출
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------
  // updateAssetQuantityPrice
  // ---------------------------------------------------------
  describe('updateAssetQuantityPrice', () => {
    it('자산의 수량과 가격을 정상적으로 업데이트한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 10;
      mockAsset.price = 35000;
      mockAsset.quantity = 3;
      mockAsset.availableQuantity = 2;

      // When
      await assetRepository.updateAssetQuantityPrice(mockAsset, queryRunner);

      // Then
      expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalledWith(
        `자산 수량/가격 업데이트 완료: assetId=${mockAsset.assetId}`,
      );
    });

    it('자산의 수량/가격 업데이트 중 예외가 발생하면 InternalServerErrorException을 던져야 한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 10;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      // When & Then
      await expect(
        assetRepository.updateAssetQuantityPrice(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('소수점 8자리를 초과하는 price/quantity/availableQuantity가 들어오면 예외를 던진다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 10;
      mockAsset.price = 123.4567899999; // 10자리 소수
      mockAsset.quantity = 9999.999999999; // 9자리 소수
      mockAsset.availableQuantity = 123.4567891234; // 10자리 소수

      // When & Then
      await expect(
        assetRepository.updateAssetQuantityPrice(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------
  // updateAssetQuantity
  // ---------------------------------------------------------
  describe('updateAssetQuantity', () => {
    it('자산의 수량을 업데이트한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 11;
      mockAsset.quantity = 5;

      // When
      await assetRepository.updateAssetQuantity(mockAsset, queryRunner);

      // Then
      expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalledWith(
        `자산 수량 업데이트 완료: assetId=${mockAsset.assetId}`,
      );
    });

    it('자산 수량 업데이트 중 예외가 발생하면 InternalServerErrorException을 던져야 한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 11;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      // When & Then
      await expect(
        assetRepository.updateAssetQuantity(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('소수점 8자리를 초과하는 quantity가 들어오면 예외를 던진다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 11;
      mockAsset.quantity = 0.123456789012; // 12자리 소수

      // When & Then
      await expect(
        assetRepository.updateAssetQuantity(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------
  // updateAssetAvailableQuantity
  // ---------------------------------------------------------
  describe('updateAssetAvailableQuantity', () => {
    it('거래가능 수량을 업데이트한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 12;
      mockAsset.availableQuantity = 10;

      // When
      await assetRepository.updateAssetAvailableQuantity(mockAsset, queryRunner);

      // Then
      expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalledWith(
        `거래가능 수량 업데이트 완료: assetId=${mockAsset.assetId}`,
      );
    });

    it('거래가능 수량 업데이트 중 예외 발생 시 InternalServerErrorException을 던져야 한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 12;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      // When & Then
      await expect(
        assetRepository.updateAssetAvailableQuantity(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('소수점 8자리를 초과하는 availableQuantity가 들어오면 예외를 던진다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 12;
      mockAsset.availableQuantity = 9999.999999999; // 9자리 소수

      // When & Then
      await expect(
        assetRepository.updateAssetAvailableQuantity(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------
  // updateAssetPrice
  // ---------------------------------------------------------
  describe('updateAssetPrice', () => {
    it('자산의 가격을 업데이트한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 13;
      mockAsset.price = 40000;
      mockAsset.quantity = 1;

      // When
      await assetRepository.updateAssetPrice(mockAsset, queryRunner);

      // Then
      expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalled();
      expect(loggerMock.log).toHaveBeenCalledWith(
        `자산 가격 업데이트 완료: assetId=${mockAsset.assetId}`,
      );
    });

    it('자산 가격 업데이트 중 예외 발생 시 InternalServerErrorException을 던져야 한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 13;

      queryRunner.manager.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      // When & Then
      await expect(
        assetRepository.updateAssetPrice(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('소수점 8자리를 초과하는 price/quantity가 들어오면 예외를 던진다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 13;
      mockAsset.price = 1.123456789; // 9자리
      mockAsset.quantity = 2.9999999999; // 10자리

      // When & Then
      await expect(
        assetRepository.updateAssetPrice(mockAsset, queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------
  // getAsset
  // ---------------------------------------------------------
  describe('getAsset', () => {
    it('자산을 정상적으로 조회한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      const mockAsset = new Asset();
      mockAsset.assetId = 21;
      mockAsset.assetName = 'BTC';
      queryRunner.manager.findOne = jest.fn().mockResolvedValue(mockAsset);

      // When
      const foundAsset = await assetRepository.getAsset(1, 'BTC', queryRunner);

      // Then
      expect(foundAsset).toEqual(mockAsset);
      expect(loggerMock.log).toHaveBeenCalledWith(
        `자산 조회 완료: assetId=${mockAsset.assetId}`,
      );
    });

    it('자산이 존재하지 않을 경우 null을 반환한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      queryRunner.manager.findOne = jest.fn().mockResolvedValue(null);

      // When
      const foundAsset = await assetRepository.getAsset(1, 'BTC', queryRunner);

      // Then
      expect(foundAsset).toBeNull();
      expect(loggerMock.log).toHaveBeenCalledWith('자산 조회 완료: 자산 없음');
    });

    it('조회 중 예외 발생 시 InternalServerErrorException을 던져야 한다.', async () => {
      // Given
      const queryRunner = queryRunnerMock as QueryRunner;
      queryRunner.manager.findOne = jest.fn().mockRejectedValue(new Error('DB Error'));

      // When & Then
      await expect(
        assetRepository.getAsset(1, 'BTC', queryRunner),
      ).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------
  // getAssets
  // ---------------------------------------------------------
  describe('getAssets', () => {
    it('해당 accountId의 모든 자산을 정상적으로 반환한다.', async () => {
      // Given
      const mockAssets: Asset[] = [
        { assetName: 'BTC', price: 30000, quantity: 2 } as Asset,
        { assetName: 'ETH', price: 1500, quantity: 10 } as Asset,
      ];
      jest.spyOn(assetRepository, 'find').mockResolvedValue(mockAssets);

      // When
      const result = await assetRepository.getAssets(1);

      // Then
      expect(result).toEqual([
        { code: 'KRW-BTC', price: 30000, quantity: 2 },
        { code: 'KRW-ETH', price: 1500, quantity: 10 },
      ]);
      expect(loggerMock.log).toHaveBeenCalledWith(
        `계정의 자산별 가격 조회 완료: accountId=1, assets=${JSON.stringify(result)}`,
      );
    });

    it('DB 조회 중 예외 발생 시 InternalServerErrorException을 던져야 한다.', async () => {
      // Given
      jest.spyOn(assetRepository, 'find').mockRejectedValue(new Error('DB Error'));

      // When & Then
      await expect(assetRepository.getAssets(1)).rejects.toThrow(InternalServerErrorException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
