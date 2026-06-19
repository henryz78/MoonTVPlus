import {
  getUserPresence,
  getUserPresenceKey,
  recordUserPresence,
} from './user-presence';
import { db } from './db';

jest.mock('./db', () => ({
  db: {
    getGlobalValue: jest.fn(),
    setGlobalValue: jest.fn(),
  },
}));

describe('user presence helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores the latest presence timestamp for a username', async () => {
    await recordUserPresence('Henry 亨利', 1_800_000_000_000);

    expect(db.setGlobalValue).toHaveBeenCalledWith(
      'user_presence:Henry%20%E4%BA%A8%E5%88%A9',
      '1800000000000'
    );
  });

  it('reads a valid presence timestamp', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValue('1800000000000');

    await expect(getUserPresence('alice')).resolves.toBe(1_800_000_000_000);
    expect(db.getGlobalValue).toHaveBeenCalledWith(getUserPresenceKey('alice'));
  });

  it('ignores missing or invalid presence values', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValueOnce(null);
    await expect(getUserPresence('alice')).resolves.toBeNull();

    (db.getGlobalValue as jest.Mock).mockResolvedValueOnce('not-a-number');
    await expect(getUserPresence('alice')).resolves.toBeNull();
  });
});
