import {
	BadRequestException,
	Injectable,
	Logger,
	OnApplicationBootstrap,
	OnModuleInit,
	UnprocessableEntityException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import {
	TRADE_TYPES,
	TRANSACTION_CHECK_INTERVAL,
} from './constants/trade.constants';
import { formatQuantity, isMinimumQuantity } from './helpers/trade.helper';
import {
	OrderBookEntry,
	TradeData,
	TradeResponse,
	TradeDataRedis,
} from './dtos/trade.interface';
import { UPBIT_UPDATED_COIN_INFO_TIME } from '../upbit/constants';
import { TradeNotFoundException } from './exceptions/trade.exceptions';
import { TradeAskBidService } from './trade-ask-bid.service';
import { isMainThread, Worker } from 'worker_threads';
import { query } from 'express';
import { User } from '@src/auth/user.entity';
import { Account } from '@src/account/account.entity';

@Injectable()
export class BidService extends TradeAskBidService implements OnModuleInit {
	private isProcessing: { [key: number]: boolean } = {};
	protected readonly logger = new Logger(BidService.name);
    onModuleInit() {
		this.startPendingTradesProcessor();
    }

	private startPendingTradesProcessor() {
		const processBidTrades = async () => {
			try {
				await this.processPendingTrades(
					TRADE_TYPES.BUY,
					this.bidTradeService.bind(this),
				);
			} finally {
				setTimeout(processBidTrades, UPBIT_UPDATED_COIN_INFO_TIME);
			}
		};
		processBidTrades();
	}

	async calculatePercentBuy(
		user: any,
		moneyType: string,
		percent: number,
	): Promise<number> {
		const account = await this.accountRepository.findOne({
			where: { user: { id: user.userId } },
		});

		const balance = account[moneyType];
		return formatQuantity(balance * (percent / 100));
	}

	async createBidTrade(user: any, bidDto: TradeData): Promise<TradeResponse> {
		if (isMinimumQuantity(bidDto.receivedAmount * bidDto.receivedPrice)) {
			throw new BadRequestException('최소 거래 금액보다 작습니다.');
		}
		try {
			let userTrade;
			const transactionResult = await this.executeTransaction(
				async (queryRunner) => {
					if (bidDto.receivedAmount <= 0) {
						throw new BadRequestException('수량은 0보다 커야 합니다.');
					}
					const userAccount = await this.accountRepository.validateUserAccount(
						user.userId, queryRunner
					);
					await this.checkCurrencyBalance(bidDto, userAccount);
					const { receivedPrice, receivedAmount } = bidDto;

					await this.accountRepository.updateAccountCurrency(
						'availableKRW',
						-formatQuantity(receivedPrice * receivedAmount),
						userAccount.id,
						queryRunner,
					);
					userTrade = await this.tradeRepository.createTrade(
						bidDto,
						user.userId,
						TRADE_TYPES.BUY,
						queryRunner,
					);
					return {
						statusCode: 200,
						message: '거래가 정상적으로 등록되었습니다.',
					};
				},
			);

			if (transactionResult.statusCode === 200) {
				const tradeData: TradeDataRedis = {
					tradeId: userTrade.tradeId,
					userId: user.userId,
					tradeType: TRADE_TYPES.BUY,
					tradeCurrency: bidDto.typeGiven,
					assetName: bidDto.typeReceived,
					price: bidDto.receivedPrice,
					quantity: bidDto.receivedAmount,
					createdAt: userTrade.createdAt,
				};
				await this.redisRepository.createTrade(tradeData);
			}
			return transactionResult;
		}catch(error){
			console.log(error);
		}
	}

	private async checkCurrencyBalance(
		bidDto: TradeData,
		account: any,
	): Promise<number> {
		const { receivedPrice, receivedAmount } = bidDto;
		const balance = account.availableKRW;

		const givenAmount = formatQuantity(receivedPrice * receivedAmount);
		const remaining = formatQuantity(balance - givenAmount);

		if (remaining < 0) {
			throw new UnprocessableEntityException('자산이 부족합니다.');
		}

		return remaining;
	}

	private async bidTradeService(bidDto: TradeData): Promise<void> {
		if (this.isProcessing[bidDto.tradeId]) {
			return;
		}

		this.isProcessing[bidDto.tradeId] = true;

		try {
			const { userId, typeGiven } = bidDto;

			const orderbook =
				this.coinDataUpdaterService.getCoinOrderbookByBid(bidDto);

			const user = await this.userRepository.getUser(bidDto.userId);

			const account = await this.accountRepository.getAccount(userId);
					
			bidDto.accountBalance = account[typeGiven];
			bidDto.account = account;

			for (const order of orderbook) {
				try {
					if (order.ask_price > bidDto.receivedPrice) break;
					const remainingQuantity = await this.executeBidTrade(
						bidDto,
						order,
						user,
					);
					const tradeResult = !isMinimumQuantity(remainingQuantity);		


					if (!tradeResult) break;
				} catch (error) {
					if (error instanceof TradeNotFoundException) {
						break;
					}
					throw error;
				}
			}
		} finally {
			delete this.isProcessing[bidDto.tradeId];
		}
	}

	private async executeBidTrade(
		bidDto: TradeData,
		order: OrderBookEntry,
		user: User,
	): Promise<number> {
		const queryRunner = this.dataSource.createQueryRunner();
		await queryRunner.connect();
		await queryRunner.startTransaction('READ COMMITTED');

		try {
			const tradeData = await this.tradeRepository.findTradeWithLock(
				bidDto.tradeId,
				queryRunner,
			);
			if (!tradeData || isMinimumQuantity(tradeData.quantity)) {
				return 0;
			}
			const { ask_price, ask_size } = order;
			const { account, krw } = bidDto;

			const buyData = { ...tradeData };
			buyData.quantity = formatQuantity(
				tradeData.quantity >= ask_size ? ask_size : tradeData.quantity,
			);

			if (isMinimumQuantity(buyData.quantity)) {
				return 0;
			}

			buyData.price = formatQuantity(ask_price * krw);

			const tradeTime = new Date();
			this.tradeHistoryRepository.createTradeHistory(
				user,
				buyData,
				tradeTime
			);
			
			const result =  await this.updateTradeData(tradeData, buyData, queryRunner);
			await queryRunner.commitTransaction();


			bidDto.account.availableKRW += formatQuantity(
				(bidDto.receivedPrice - buyData.price) * buyData.quantity,
			);

			bidDto.account.KRW -= formatQuantity(buyData.price * buyData.quantity);

			this.processAssetUpdate(bidDto, account.id, buyData);
			this.updateAccountBalances(bidDto, buyData, account);

			return result;
		} catch (error) {
			await queryRunner.rollbackTransaction();
			throw error;
		} finally {
			await queryRunner.release();
		}
	}

	private async processAssetUpdate(
		bidDto: TradeData,
		accountId: any,
		buyData: any,
	): Promise<void> {
		const asset = await this.assetRepository.getAsset(
			accountId,
			bidDto.typeReceived,
		);
		if (asset) {
			asset.price = formatQuantity(
				asset.price + buyData.price * buyData.quantity,
			);
			asset.quantity = formatQuantity(asset.quantity + buyData.quantity);
			asset.availableQuantity = formatQuantity(
				asset.availableQuantity + buyData.quantity,
			);

			await this.assetRepository.updateAssetQuantityPrice(asset);
		} else {
			await this.assetRepository.createAsset(
				bidDto.typeReceived,
				bidDto.account,
				formatQuantity(buyData.price * buyData.quantity),
				formatQuantity(buyData.quantity),
			);
		}
	}

	private async updateAccountBalances(
		bidDto: TradeData,
		buyData: any,
		userAccount: Account,
	): Promise<void> {
		const { typeGiven } = bidDto;

		const returnChange = formatQuantity(buyData.price * buyData.quantity);

		const change = formatQuantity(
			(bidDto.receivedPrice - buyData.price) * buyData.quantity,
		);

		await this.accountRepository.updateAccountCurrencyWithBid(
			typeGiven,
			-returnChange,
			change,
			userAccount.id,
		)
	}
}
