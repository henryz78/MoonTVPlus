import {
  createWatchRoomAccessToken,
  verifyWatchRoomAccessToken,
} from './watch-room-access-token';

describe('watch room access token', () => {
  it('creates a signed token without embedding the shared secret', () => {
    const token = createWatchRoomAccessToken('alice', 'shared-secret', 300);

    expect(token).not.toContain('shared-secret');
    expect(verifyWatchRoomAccessToken(token, 'shared-secret')).toEqual(
      expect.objectContaining({ username: 'alice' })
    );
  });

  it('rejects a token signed with another secret', () => {
    const token = createWatchRoomAccessToken('alice', 'shared-secret', 300);

    expect(verifyWatchRoomAccessToken(token, 'other-secret')).toBeNull();
  });
});
