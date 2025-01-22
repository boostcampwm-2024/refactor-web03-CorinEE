import { DataSource, Repository, QueryRunner } from 'typeorm';
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Account } from '@src/account/account.entity';
import { Asset } from './asset.entity';
import { Coin } from './dtos/asset.interface';
import { ensureMax8Decimals } from './utils/util';
import { query } from 'express';

@Injectable()
export class AssetRepository extends Repository<Asset> {
  // 원래는 this.logger = new Logger(AssetRepository.name) 사용 가능
  // 여기서는 DI로 Logger를 주입받도록 수정된 상태
  constructor(
    private readonly dataSource: DataSource,
    private readonly logger: Logger,
  ) {
    super(Asset, dataSource.createEntityManager());
  }

  /**
   * 자산 생성
   * price, quantity가 소수점 8자리를 넘으면 예외
   */
  async createAsset(
    typeReceived: string,
    account: Account,
    price: number,
    quantity: number,
  ): Promise<Asset> {
    this.logger.log(`자산 생성 시작: type=${typeReceived}, accountId=${account.id}`);
    try {
      // --- [추가] 8자리 검사 ---
      ensureMax8Decimals(price, 'price');
      ensureMax8Decimals(quantity, 'quantity');

      const asset = new Asset();
      asset.assetName = typeReceived;
      asset.price = price;
      asset.quantity = quantity;
      asset.availableQuantity = quantity;
      asset.account = account;

      const savedAsset = await this.save(asset);
      this.logger.log(`자산 생성 완료: assetId=${savedAsset.assetId}`);

      return savedAsset;
    } catch (error) {
      this.logger.error(`자산 생성 실패: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        '자산 생성 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * 수량+가격 업데이트
   * price, quantity가 소수점 8자리를 넘으면 예외
   */
  async updateAssetQuantityPrice(
    asset: Asset,
  ): Promise<void> {
    this.logger.log(`자산 수량/가격 업데이트 시작: assetId=${asset.assetId}`);
    try {
      // --- [추가] 8자리 검사 ---
      ensureMax8Decimals(asset.price, 'price');
      ensureMax8Decimals(asset.quantity, 'quantity');
      ensureMax8Decimals(asset.availableQuantity, 'availableQuantity');

      await this
        .createQueryBuilder()
        .update(Asset)
        .set({
          quantity: asset.quantity,
          price: asset.price,
          availableQuantity: asset.availableQuantity,
        })
        .where('assetId = :assetId', { assetId: asset.assetId })
        .execute();

      this.logger.log(`자산 수량/가격 업데이트 완료: assetId=${asset.assetId}`);
    } catch (error) {
      this.logger.error(
        `자산 수량/가격 업데이트 실패: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        '자산 업데이트 중 오류가 발생했습니다.',
      );
    }
  }

  async updateAssetQuantityPriceWithQR(
    asset: Asset,
    queryRunner: QueryRunner,
  ): Promise<void> {
    this.logger.log(`자산 수량/가격 업데이트 시작: assetId=${asset.assetId}`);
    try {
      // --- [추가] 8자리 검사 ---
      ensureMax8Decimals(asset.price, 'price');
      ensureMax8Decimals(asset.quantity, 'quantity');
      ensureMax8Decimals(asset.availableQuantity, 'availableQuantity');

      await queryRunner.manager
        .createQueryBuilder()
        .update(Asset)
        .set({
          quantity: asset.quantity,
          price: asset.price,
          availableQuantity: asset.availableQuantity,
        })
        .where('assetId = :assetId', { assetId: asset.assetId })
        .execute();

      this.logger.log(`자산 수량/가격 업데이트 완료: assetId=${asset.assetId}`);
    } catch (error) {
      this.logger.error(
        `자산 수량/가격 업데이트 실패: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        '자산 업데이트 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * 수량만 업데이트
   * quantity가 소수점 8자리를 넘으면 예외
   */
  async updateAssetQuantity(
    asset: Asset,
    queryRunner: QueryRunner,
  ): Promise<void> {
    this.logger.log(`자산 수량 업데이트 시작: assetId=${asset.assetId}`);
    try {
      ensureMax8Decimals(asset.quantity, 'quantity');

      await queryRunner.manager
        .createQueryBuilder()
        .update(Asset)
        .set({ quantity: asset.quantity })
        .where('assetId = :assetId', { assetId: asset.assetId })
        .execute();

      this.logger.log(`자산 수량 업데이트 완료: assetId=${asset.assetId}`);
    } catch (error) {
      this.logger.error(
        `자산 수량 업데이트 실패: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        '자산 수량 업데이트 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * 거래가능 수량만 업데이트
   * availableQuantity가 소수점 8자리를 넘으면 예외
   */
  async updateAssetAvailableQuantity(
    asset: Asset,
    queryRunner: QueryRunner,
  ): Promise<void> {
    this.logger.log(`거래가능 수량 업데이트 시작: assetId=${asset.assetId}`);
    try {
      ensureMax8Decimals(asset.availableQuantity, 'availableQuantity');

      await queryRunner.manager
        .createQueryBuilder()
        .update(Asset)
        .set({ availableQuantity: asset.availableQuantity })
        .where('assetId = :assetId', { assetId: asset.assetId })
        .execute();

      this.logger.log(`거래가능 수량 업데이트 완료: assetId=${asset.assetId}`);
    } catch (error) {
      this.logger.error(
        `거래가능 수량 업데이트 실패: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        '거래가능 수량 업데이트 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * 가격만 업데이트
   * price, quantity가 소수점 8자리를 넘으면 예외 (quantity도 업데이트하는 부분이 있어서)
   */
  async updateAssetPrice(
    asset: Asset,
    queryRunner: QueryRunner,
  ): Promise<void> {
    this.logger.log(`자산 가격 업데이트 시작: assetId=${asset.assetId}`);
    try {
      ensureMax8Decimals(asset.price, 'price');
      ensureMax8Decimals(asset.quantity, 'quantity');

      await queryRunner.manager
        .createQueryBuilder()
        .update(Asset)
        .set({
          price: asset.price,
          quantity: asset.quantity,
        })
        .where('assetId = :assetId', { assetId: asset.assetId })
        .execute();

      this.logger.log(`자산 가격 업데이트 완료: assetId=${asset.assetId}`);
    } catch (error) {
      this.logger.error(
        `자산 가격 업데이트 실패: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        '자산 가격 업데이트 중 오류가 발생했습니다.',
      );
    }
  }

  async getAssetWithQR(
    id: number,
    assetName: string,
    queryRunner: QueryRunner,
  ): Promise<Asset> {
    this.logger.log(`자산 조회 시작: accountId=${id}, assetName=${assetName}`);
    try {
      const asset = await queryRunner.manager.findOne(Asset, {
        where: {
          account: { id },
          assetName,
        },
      });

      this.logger.log(
        `자산 조회 완료: ${asset ? `assetId=${asset.assetId}` : '자산 없음'}`,
      );
      return asset;
    } catch (error) {
      this.logger.error(`자산 조회 실패: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        '자산 조회 중 오류가 발생했습니다.',
      );
    }
  }

  async getAsset(
    id: number,
    assetName: string,
  ): Promise<Asset> {
    this.logger.log(`자산 조회 시작: accountId=${id}, assetName=${assetName}`);
    try {
      const asset = await this.findOne({
        where: {
          account: { id },
          assetName,
        },
      });

      this.logger.log(
        `자산 조회 완료: ${asset ? `assetId=${asset.assetId}` : '자산 없음'}`,
      );
      return asset;
    } catch (error) {
      this.logger.error(`자산 조회 실패: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        '자산 조회 중 오류가 발생했습니다.',
      );
    }
  }

  async getAssets(accountId: number): Promise<Coin[]> {
    try {
      const assets = await this.find({
        where: { account: { id: accountId } },
      });

      const assetsWithPrices = assets.map((asset) => ({
        code: `KRW-${asset.assetName}`,
        price: asset.price,
        quantity: asset.quantity,
      }));

      this.logger.log(
        `계정의 자산별 가격 조회 완료: accountId=${accountId}, assets=${JSON.stringify(
          assetsWithPrices,
        )}`,
      );
      return assetsWithPrices;
    } catch (error) {
      this.logger.error(`자산별 가격 조회 실패: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        '자산별 가격 조회 중 오류가 발생했습니다.',
      );
    }
  }
}