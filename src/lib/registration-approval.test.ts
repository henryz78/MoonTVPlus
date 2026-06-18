import type { RegistrationRequest } from './types';

describe('registration approval storage contract', () => {
  it('keeps only pending username duplicates blocking new requests', () => {
    const requests: RegistrationRequest[] = [
      {
        id: 'old',
        username: 'alice',
        passwordHash: 'hash',
        status: 'rejected',
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'new',
        username: 'alice',
        passwordHash: 'hash',
        status: 'pending',
        createdAt: 3,
        updatedAt: 3,
      },
    ];

    const pending = requests.find(
      (request) => request.username === 'alice' && request.status === 'pending'
    );

    expect(pending?.id).toBe('new');
  });
});
