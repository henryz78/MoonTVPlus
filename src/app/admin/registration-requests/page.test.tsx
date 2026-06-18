import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import RegistrationRequestsPage from './page';

jest.mock('@/components/PageLayout', () => {
  return function MockPageLayout({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  };
});

describe('RegistrationRequestsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes('/api/admin/registration-requests/reg_1')) {
          return {
            ok: true,
            json: async () => ({
              request: {
                id: 'reg_1',
                username: 'alice',
                email: 'alice@gmail.com',
                approvalQuestion: '你是谁？',
                approvalAnswer: '朋友邀请',
                status: init?.body?.toString().includes('approve')
                  ? 'approved'
                  : 'rejected',
                createdAt: 1_700_000_000_000,
                updatedAt: 1_700_000_000_001,
              },
            }),
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            requests: [
              {
                id: 'reg_1',
                username: 'alice',
                email: 'alice@gmail.com',
                approvalQuestion: '你是谁？',
                approvalAnswer: '朋友邀请',
                status: 'pending',
                createdAt: 1_700_000_000_000,
                updatedAt: 1_700_000_000_000,
              },
            ],
          }),
        } as Response;
      }
    );
  });

  it('loads requests and approves one', async () => {
    render(<RegistrationRequestsPage />);

    expect(await screen.findByText('注册审批')).toBeInTheDocument();
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('朋友邀请')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '通过' }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        '/api/admin/registration-requests/reg_1',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'approve' }),
        })
      );
    });
  });
});
