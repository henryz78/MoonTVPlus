import {
  consumeRegistrationEmailCode,
  createRegistrationEmailCode,
  getRegistrationEmailCodeCooldown,
  verifyRegistrationEmailCode,
} from './registration-email-code';

class FakeGlobalStore {
  values = new Map<string, string>();

  async getGlobalValue(key: string) {
    return this.values.get(key) || null;
  }

  async setGlobalValue(key: string, value: string) {
    this.values.set(key, value);
  }

  async deleteGlobalValue(key: string) {
    this.values.delete(key);
  }
}

describe('registration email codes', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores and verifies a code for username plus email', async () => {
    const store = new FakeGlobalStore();
    const code = await createRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
      code: '123456',
    });

    expect(code).toBe('123456');
    await expect(
      verifyRegistrationEmailCode(store, {
        username: 'alice',
        normalizedEmail: 'alice@gmail.com',
        code: '123456',
      })
    ).resolves.toBe(true);
  });

  it('consumes a code after successful use', async () => {
    const store = new FakeGlobalStore();
    await createRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
      code: '123456',
    });

    await consumeRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
    });

    await expect(
      verifyRegistrationEmailCode(store, {
        username: 'alice',
        normalizedEmail: 'alice@gmail.com',
        code: '123456',
      })
    ).resolves.toBe(false);
  });

  it('locks a code after repeated failed verification attempts', async () => {
    const store = new FakeGlobalStore();
    await createRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
      code: '123456',
    });

    for (let i = 0; i < 5; i++) {
      await expect(
        verifyRegistrationEmailCode(store, {
          username: 'alice',
          normalizedEmail: 'alice@gmail.com',
          code: '000000',
        })
      ).resolves.toBe(false);
    }

    await expect(
      verifyRegistrationEmailCode(store, {
        username: 'alice',
        normalizedEmail: 'alice@gmail.com',
        code: '123456',
      })
    ).resolves.toBe(false);
  });

  it('reports resend cooldown for a recent code', async () => {
    const store = new FakeGlobalStore();
    await createRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
      code: '123456',
    });

    await expect(
      getRegistrationEmailCodeCooldown(store, {
        username: 'alice',
        normalizedEmail: 'alice@gmail.com',
      })
    ).resolves.toBeGreaterThan(0);
  });
});
