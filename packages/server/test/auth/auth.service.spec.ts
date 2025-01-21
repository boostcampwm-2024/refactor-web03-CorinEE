// test/auth/auth.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { UserRepository } from '../../src/auth/user.repository';
import { AccountRepository } from '../../src/account/account.repository';
import { JwtService } from '@nestjs/jwt';
import { AuthRedisRepository } from '../../src/redis/auth-redis.repository';
import { UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { User } from '../../src/auth/user.entity';
import { SignUpDto } from '../../src/auth/dtos/sign-up.dto';
import { jwtConstants, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, DEFAULT_KRW, DEFAULT_USDT, DEFAULT_BTC, GUEST_ID_TTL } from '../../src/auth/constants';
import { v4 as uuidv4 } from 'uuid';

// UUID 모킹
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: jest.Mocked<UserRepository>;
  let accountRepository: jest.Mocked<AccountRepository>;
  let jwtService: jest.Mocked<JwtService>;
  let authRedisRepository: jest.Mocked<AuthRedisRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserRepository,
          useValue: {
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: AccountRepository,
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: AuthRedisRepository,
          useValue: {
            setAuthData: jest.fn(),
            getAuthData: jest.fn(),
            deleteAuthData: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userRepository = module.get<UserRepository>(UserRepository) as jest.Mocked<UserRepository>;
    accountRepository = module.get<AccountRepository>(AccountRepository) as jest.Mocked<AccountRepository>;
    jwtService = module.get<JwtService>(JwtService) as jest.Mocked<JwtService>;
    authRedisRepository = module.get<AuthRedisRepository>(AuthRedisRepository) as jest.Mocked<AuthRedisRepository>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signIn', () => {
    it('사용자 로그인 성공 시 액세스 및 리프레시 토큰 반환 확인', async () => {
      const mockUser: User = { id: 1, username: 'validUser', isGuest: false } as User;
      userRepository.findOneBy.mockResolvedValue(mockUser);
      
      // signAsync의 첫 번째 호출은 accessToken, 두 번째 호출은 refreshToken을 반환하도록 설정
      jwtService.signAsync
        .mockResolvedValueOnce('mockAccessToken')  // 첫 번째 호출: accessToken
        .mockResolvedValueOnce('mockRefreshToken'); // 두 번째 호출: refreshToken

      const result = await authService.signIn('validUser');

      expect(userRepository.findOneBy).toHaveBeenCalledWith({ username: 'validUser' });
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { userId: 1, userName: 'validUser' },
        { secret: jwtConstants.secret, expiresIn: ACCESS_TOKEN_TTL }
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { userId: 1 },
        { secret: jwtConstants.refreshSecret, expiresIn: REFRESH_TOKEN_TTL }
      );
      expect(authRedisRepository.setAuthData).toHaveBeenCalledWith('refresh:1', 'mockRefreshToken', REFRESH_TOKEN_TTL);
      expect(result).toEqual({ access_token: 'mockAccessToken', refresh_token: 'mockRefreshToken' });
    });

    it('존재하지 않는 사용자 로그인 시 UnauthorizedException 발생', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expect(authService.signIn('invalidUser')).rejects.toThrow(UnauthorizedException);
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ username: 'invalidUser' });
    });
  });

  describe('guestSignIn', () => {
    it('게스트 로그인 시 토큰 반환 및 게스트 사용자 등록 확인', async () => {
      const guestName = `guest_mock-uuid`;
      const mockGuestUser: User = { id: 2, username: guestName, isGuest: true } as User;

      // signUp 메서드를 실제로 실행하게 하고, userRepository.save를 모킹
      userRepository.save.mockResolvedValue(mockGuestUser);

      // 첫 번째 findOneBy 호출 시 null 반환 (사용자 없음)
      // 두 번째 findOneBy 호출 시 mockGuestUser 반환
      userRepository.findOneBy
        .mockResolvedValueOnce(null) // 사용자 존재하지 않음
        .mockResolvedValueOnce(mockGuestUser); // 사용자 존재

      // signAsync 호출 시 accessToken과 refreshToken을 반환하도록 설정
      jwtService.signAsync
        .mockResolvedValueOnce('mockAccessToken')  // accessToken
        .mockResolvedValueOnce('mockRefreshToken'); // refreshToken

      // cacheGuestUser 메서드도 정상적으로 수행되도록 모킹
      authRedisRepository.setAuthData.mockResolvedValue(undefined);

      const result = await authService.guestSignIn();

      expect(uuidv4).toHaveBeenCalled();
      // signUp 메서드를 직접 모킹하지 않으므로, signUp이 호출되었는지 확인할 필요 없음
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ username: guestName });
      expect(userRepository.save).toHaveBeenCalledWith({
        username: guestName,
        email: undefined, // 게스트 사용자일 경우 email이 undefined일 수 있음
        provider: undefined, // 게스트 사용자의 provider가 'local'로 설정되어 있을 수 있음
        providerId: undefined, // 게스트 사용자의 providerId가 undefined일 수 있음
        isGuest: true,
      });
      expect(authRedisRepository.setAuthData).toHaveBeenCalledWith('guest:2', JSON.stringify({ userId: 2 }), GUEST_ID_TTL);
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ access_token: 'mockAccessToken', refresh_token: 'mockRefreshToken' });
    });
  });


  describe('signUp', () => {
    it('신규 사용자 등록이 정상적으로 수행되는지 확인', async () => {
      const signUpDto: SignUpDto = { name: 'newUser', email: 'new@example.com', provider: 'local', providerId: '12345', isGuest: false };
      const mockSavedUser: User = { id: 3, username: 'newUser', email: 'new@example.com', isGuest: false } as User;

      userRepository.findOne.mockResolvedValue(null); // 사용자 없음
      userRepository.save.mockResolvedValue(mockSavedUser);
      accountRepository.save.mockResolvedValue(null); // 계정 저장 성공

      const result = await authService.signUp(signUpDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { provider: 'local', providerId: '12345' } });
      
      // signUpDto의 'name'이 'username'으로 매핑되어 save 호출됨
      expect(userRepository.save).toHaveBeenCalledWith({
        username: 'newUser',
        email: 'new@example.com',
        provider: 'local',
        providerId: '12345',
        isGuest: false,
      });
      
      expect(accountRepository.save).toHaveBeenCalledWith({
        user: mockSavedUser,
        KRW: DEFAULT_KRW,
        availableKRW: DEFAULT_KRW,
        USDT: DEFAULT_USDT,
        BTC: DEFAULT_BTC,
      });
      expect(result).toEqual({ message: 'User successfully registered' });
    });

    it('이미 존재하는 사용자 등록 시 ConflictException 발생', async () => {
      const signUpDto: SignUpDto = { name: 'existingUser', email: 'existing@example.com', provider: 'local', providerId: 'existing123', isGuest: false };
      const mockExistingUser: User = { id: 4, username: 'existingUser', email: 'existing@example.com', isGuest: false } as User;

      userRepository.findOne.mockResolvedValue(mockExistingUser); // 사용자 존재

      await expect(authService.signUp(signUpDto)).rejects.toThrow(ConflictException);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { provider: 'local', providerId: 'existing123' } });
    });
  });

  describe('validateOAuthLogin', () => {
    it('OAuth 로그인 시 기존 사용자에 대한 토큰 반환 확인', async () => {
      const signUpDto: SignUpDto = { provider: 'google', providerId: 'google123', name: 'googleUser', isGuest: false };
      const mockUser: User = { id: 5, username: 'googleUser', isGuest: false } as User;

      userRepository.findOne.mockResolvedValue(mockUser);
      
      // signAsync의 첫 번째 호출은 accessToken, 두 번째 호출은 refreshToken을 반환하도록 설정
      jwtService.signAsync
        .mockResolvedValueOnce('mockAccessToken')  // 첫 번째 호출: accessToken
        .mockResolvedValueOnce('mockRefreshToken'); // 두 번째 호출: refreshToken

      const result = await authService.validateOAuthLogin(signUpDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { provider: 'google', providerId: 'google123' } });
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { userId: 5, userName: 'googleUser' },
        { secret: jwtConstants.secret, expiresIn: ACCESS_TOKEN_TTL }
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { userId: 5 },
        { secret: jwtConstants.refreshSecret, expiresIn: REFRESH_TOKEN_TTL }
      );
      expect(authRedisRepository.setAuthData).toHaveBeenCalledWith('refresh:5', 'mockRefreshToken', REFRESH_TOKEN_TTL);
      expect(result).toEqual({ access_token: 'mockAccessToken', refresh_token: 'mockRefreshToken' });
    });

    it('OAuth 로그인 시 신규 사용자 등록 후 토큰 반환 확인', async () => {
      const signUpDto: SignUpDto = { provider: 'facebook', providerId: 'fb123', name: 'fbUser', isGuest: false };
      const mockUser: User = { id: 6, username: 'fbUser', isGuest: false } as User;

      // 첫 번째 findOne 호출 시 null (사용자 없음), 두 번째 호출 시 mockUser
      userRepository.findOne
        .mockResolvedValueOnce(null) // 사용자 없음
        .mockResolvedValueOnce(mockUser); // 사용자 존재

      // signUp 메서드 모킹
      authService.signUp = jest.fn().mockResolvedValue({ message: 'User successfully registered' });

      // signAsync 호출 시 accessToken과 refreshToken을 반환하도록 설정
      jwtService.signAsync
        .mockResolvedValueOnce('mockAccessToken')  // 첫 번째 호출: accessToken
        .mockResolvedValueOnce('mockRefreshToken'); // 두 번째 호출: refreshToken

      const result = await authService.validateOAuthLogin(signUpDto);

      expect(authService.signUp).toHaveBeenCalledWith(signUpDto);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { provider: 'facebook', providerId: 'fb123' } });
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { userId: 6, userName: 'fbUser' },
        { secret: jwtConstants.secret, expiresIn: ACCESS_TOKEN_TTL }
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { userId: 6 },
        { secret: jwtConstants.refreshSecret, expiresIn: REFRESH_TOKEN_TTL }
      );
      expect(authRedisRepository.setAuthData).toHaveBeenCalledWith('refresh:6', 'mockRefreshToken', REFRESH_TOKEN_TTL);
      expect(result).toEqual({ access_token: 'mockAccessToken', refresh_token: 'mockRefreshToken' });
    });

    it('OAuth 사용자 생성 실패 시 UnauthorizedException 발생', async () => {
      const signUpDto: SignUpDto = { provider: 'github', providerId: 'gh123', name: 'ghUser', isGuest: false };

      // 첫 번째 findOne 호출 시 null (사용자 없음), 두 번째 호출 시 null (사용자 생성 실패)
      userRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // signUp 메서드 모킹
      authService.signUp = jest.fn().mockResolvedValue({ message: 'User successfully registered' });

      await expect(authService.validateOAuthLogin(signUpDto)).rejects.toThrow(UnauthorizedException);
      expect(authService.signUp).toHaveBeenCalledWith(signUpDto);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { provider: 'github', providerId: 'gh123' } });
    });
  });

  describe('refreshTokens', () => {
    it('유효한 리프레시 토큰으로 액세스 및 리프레시 토큰 재발급 확인', async () => {
      const payload = { userId: 7 };
      jwtService.verifyAsync.mockResolvedValue(payload);
      authRedisRepository.getAuthData.mockResolvedValue('validRefreshToken');
      const mockUser: User = { id: 7, username: 'refreshUser', isGuest: false } as User;

      userRepository.findOneBy.mockResolvedValue(mockUser);

      // signAsync의 첫 번째 호출은 accessToken, 두 번째 호출은 refreshToken을 반환하도록 설정
      jwtService.signAsync
        .mockResolvedValueOnce('newAccessToken')   // 첫 번째 호출: accessToken
        .mockResolvedValueOnce('newRefreshToken'); // 두 번째 호출: refreshToken

      const result = await authService.refreshTokens('validRefreshToken');

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('validRefreshToken', { secret: jwtConstants.refreshSecret });
      expect(authRedisRepository.getAuthData).toHaveBeenCalledWith('refresh:7');
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 7 });
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { userId: 7, userName: 'refreshUser' },
        { secret: jwtConstants.secret, expiresIn: ACCESS_TOKEN_TTL }
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { userId: 7 },
        { secret: jwtConstants.refreshSecret, expiresIn: REFRESH_TOKEN_TTL }
      );
      expect(authRedisRepository.setAuthData).toHaveBeenCalledWith('refresh:7', 'newRefreshToken', REFRESH_TOKEN_TTL);
      expect(result).toEqual({ access_token: 'newAccessToken', refresh_token: 'newRefreshToken' });
    });

    it('무효한 리프레시 토큰 시 UnauthorizedException 발생', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(authService.refreshTokens('invalidRefreshToken')).rejects.toThrow(UnauthorizedException);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('invalidRefreshToken', { secret: jwtConstants.refreshSecret });
    });
  });

  describe('logout', () => {
    it('정상적인 로그아웃 시 성공 메시지 반환 및 토큰 삭제 확인', async () => {
      const mockUser: User = { id: 8, username: 'regularUser', isGuest: false } as User;
      userRepository.findOneBy.mockResolvedValue(mockUser);

      const result = await authService.logout(8);

      expect(authRedisRepository.deleteAuthData).toHaveBeenCalledWith('refresh:8');
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 8 });
      expect(result).toEqual({ message: 'User logged out successfully' });
    });

    it('게스트 사용자의 로그아웃 시 계정 삭제 및 성공 메시지 반환', async () => {
      const mockGuestUser: User = { id: 9, username: 'guestUser', isGuest: true } as User;
      userRepository.findOneBy.mockResolvedValue(mockGuestUser);
      userRepository.delete.mockResolvedValue(null);

      const result = await authService.logout(9);

      expect(authRedisRepository.deleteAuthData).toHaveBeenCalledWith('refresh:9');
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 9 });
      expect(userRepository.delete).toHaveBeenCalledWith({ id: 9 });
      expect(result).toEqual({ message: 'Guest user data successfully deleted' });
    });
  });
});
