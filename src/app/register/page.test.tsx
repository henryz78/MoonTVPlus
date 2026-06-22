import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import RegisterPage from './page';

const replace = jest.fn();
const push = jest.fn();
const mockRouter = {
  replace,
  push,
};
type RuntimeWindow = Window & {
  RUNTIME_CONFIG?: {
    ENABLE_REGISTRATION?: boolean;
    REGISTRATION_REQUIRE_APPROVAL?: boolean;
    REGISTRATION_APPROVAL_QUESTION?: string;
  };
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => ({
    get: () => null,
  }),
}));

jest.mock('@/components/SiteProvider', () => ({
  useSite: () => ({ siteName: 'HYTV' }),
}));

jest.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button type='button'>切换主题</button>,
}));

jest.mock('@/lib/version', () => ({
  CURRENT_VERSION: 'test',
}));

jest.mock('@/lib/version_check', () => ({
  UpdateStatus: {
    FETCH_FAILED: 'FETCH_FAILED',
    HAS_UPDATE: 'HAS_UPDATE',
    NO_UPDATE: 'NO_UPDATE',
  },
  checkForUpdates: jest.fn(async () => 'FETCH_FAILED'),
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window as RuntimeWindow).RUNTIME_CONFIG = {
      ENABLE_REGISTRATION: true,
      REGISTRATION_REQUIRE_APPROVAL: true,
      REGISTRATION_APPROVAL_QUESTION: '你是谁？',
    };
    window.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        pendingApproval: true,
        message: '申请已提交，请等待管理员审核',
      }),
    })) as jest.Mock;
  });

  afterEach(() => {
    delete (window as RuntimeWindow).RUNTIME_CONFIG;
  });

  it('shows an approval submitted panel after pending approval registration', async () => {
    render(<RegisterPage />);

    fireEvent.change(await screen.findByPlaceholderText('输入用户名'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByPlaceholderText('输入密码（至少6位）'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByPlaceholderText('再次输入密码'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByPlaceholderText('你是谁？'), {
      target: { value: '朋友邀请' },
    });

    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('已提交申请')).toBeInTheDocument();
    expect(
      screen.getByText(
        '申请已经提交成功，管理员会尽快处理。通常 24 小时内会完成审核，审核后就可以返回登录页尝试登录。'
      )
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('输入用户名')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回登录' }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/login');
    });
  });
});
