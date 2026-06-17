import { getStorage } from './db';
import { touchRefreshTokenLastUsed } from './refresh-token';

jest.mock('./db', () => ({
  getStorage: jest.fn(),
}));

describe('touchRefreshTokenLastUsed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not update lastUsed when the presented refresh token does not match the stored token', async () => {
    const hGet = jest.fn().mockResolvedValue(
      JSON.stringify({
        token: 'stored-refresh',
        deviceInfo: 'Chrome',
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
        lastUsed: 10,
      })
    );
    const hSet = jest.fn();
    (getStorage as jest.Mock).mockReturnValue({
      adapter: { hGet, hSet },
    });

    const touched = await touchRefreshTokenLastUsed(
      'alice',
      'token-1',
      'presented-refresh'
    );

    expect(touched).toBe(false);
    expect(hSet).not.toHaveBeenCalled();
  });

  it('updates lastUsed only when the presented refresh token matches', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(123_456);
    const hGet = jest.fn().mockResolvedValue(
      JSON.stringify({
        token: 'stored-refresh',
        deviceInfo: 'Chrome',
        createdAt: 1,
        expiresAt: 999_999,
        lastUsed: 10,
      })
    );
    const hSet = jest.fn();
    (getStorage as jest.Mock).mockReturnValue({
      adapter: { hGet, hSet },
    });

    const touched = await touchRefreshTokenLastUsed(
      'alice',
      'token-1',
      'stored-refresh'
    );

    expect(touched).toBe(true);
    expect(hSet).toHaveBeenCalledWith(
      'user_tokens:alice',
      'token-1',
      JSON.stringify({
        token: 'stored-refresh',
        deviceInfo: 'Chrome',
        createdAt: 1,
        expiresAt: 999_999,
        lastUsed: 123_456,
      })
    );
  });
});
