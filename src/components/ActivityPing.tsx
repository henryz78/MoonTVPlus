'use client';

import { useEffect } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

const PING_INTERVAL_MS = 60_000;

export default function ActivityPing() {
  useEffect(() => {
    const storageType =
      (window as Window & { RUNTIME_CONFIG?: { STORAGE_TYPE?: string } })
        .RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return;
    }

    let lastSuccessfulPing = 0;
    let inFlight = false;
    let disposed = false;

    const canPing = () => {
      if (document.visibilityState !== 'visible') return false;

      const authInfo = getAuthInfoFromBrowserCookie();
      return Boolean(
        authInfo?.username &&
          authInfo.tokenId &&
          authInfo.refreshToken &&
          authInfo.refreshExpires &&
          Date.now() < authInfo.refreshExpires
      );
    };

    const sendPing = async () => {
      if (inFlight || disposed || !canPing()) return;

      inFlight = true;
      try {
        const response = await window.fetch('/api/auth/activity', {
          method: 'POST',
          credentials: 'include',
        });
        if (response.ok) {
          lastSuccessfulPing = Date.now();
          window.dispatchEvent(new CustomEvent('userActivityUpdated'));
        }
      } catch (error) {
        console.warn('[ActivityPing] Failed to update activity:', error);
      } finally {
        inFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastSuccessfulPing >= PING_INTERVAL_MS
      ) {
        void sendPing();
      }
    };

    void sendPing();
    const intervalId = window.setInterval(() => {
      void sendPing();
    }, PING_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
