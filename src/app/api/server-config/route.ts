/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // 禁用缓存

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  const isLiteMode = process.env.MOONTV_LITE === 'true';

  const buildWatchRoomConfig = (config: {
    Enabled?: boolean;
    ServerType?: 'internal' | 'external';
    ExternalServerUrl?: string;
  }) => {
    const enabled = !isLiteMode && Boolean(config.Enabled);
    const serverType = config.ServerType || 'internal';

    return {
      enabled,
      serverType,
      externalServerUrl:
        enabled && serverType === 'external'
          ? config.ExternalServerUrl || ''
          : undefined,
    };
  };

  // 如果使用 localStorage，返回默认配置
  if (storageType === 'localstorage') {
    const watchRoomConfig = buildWatchRoomConfig({
      Enabled: process.env.WATCH_ROOM_ENABLED === 'true',
      ServerType:
        process.env.WATCH_ROOM_SERVER_TYPE === 'external'
          ? 'external'
          : 'internal',
      ExternalServerUrl: process.env.WATCH_ROOM_EXTERNAL_SERVER_URL,
    });

    return NextResponse.json({
      SiteName: process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTVPlus',
      StorageType: 'localstorage',
      Version: CURRENT_VERSION,
      TVModeEnabled: process.env.ENABLE_TV_MODE !== 'false',
      WatchRoom: watchRoomConfig,
      EnableOfflineDownload:
        process.env.NEXT_PUBLIC_ENABLE_OFFLINE_DOWNLOAD === 'true',
      DanmakuAutoLoadDefault: true,
    });
  }

  // 非 localStorage 模式，从数据库读取配置
  const config = await getConfig();
  const watchRoomConfig = buildWatchRoomConfig(config.WatchRoomConfig || {});
  const result = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: storageType,
    Version: CURRENT_VERSION,
    TVModeEnabled: process.env.ENABLE_TV_MODE !== 'false',
    WatchRoom: watchRoomConfig,
    EnableOfflineDownload:
      process.env.NEXT_PUBLIC_ENABLE_OFFLINE_DOWNLOAD === 'true',
    EnableRegistration: config.SiteConfig.EnableRegistration || false,
    RequireRegistrationInviteCode:
      config.SiteConfig.RequireRegistrationInviteCode || false,
    RegistrationRequireEmailVerification:
      config.SiteConfig.RegistrationRequireEmailVerification || false,
    RegistrationEmailDomainAllowlist:
      config.SiteConfig.RegistrationEmailDomainAllowlist || [],
    RegistrationBlockEmailAliases:
      config.SiteConfig.RegistrationBlockEmailAliases || false,
    RegistrationRequireApproval:
      config.SiteConfig.RegistrationRequireApproval || false,
    RegistrationApprovalQuestion:
      config.SiteConfig.RegistrationApprovalQuestion || '',
    RegistrationRequireTurnstile:
      config.SiteConfig.RegistrationRequireTurnstile || false,
    LoginRequireTurnstile: config.SiteConfig.LoginRequireTurnstile || false,
    TurnstileSiteKey: config.SiteConfig.TurnstileSiteKey || '',
    EnableOIDCLogin: config.SiteConfig.EnableOIDCLogin || false,
    EnableOIDCRegistration: config.SiteConfig.EnableOIDCRegistration || false,
    OIDCButtonText: config.SiteConfig.OIDCButtonText || '',
    DanmakuAutoLoadDefault: config.SiteConfig.DanmakuAutoLoadDefault !== false,
    loginBackgroundImage: config.ThemeConfig?.loginBackgroundImage || '',
    registerBackgroundImage: config.ThemeConfig?.registerBackgroundImage || '',
    homeBackgroundImage: config.ThemeConfig?.homeBackgroundImage || '',
    progressThumbType: config.ThemeConfig?.progressThumbType || 'default',
    progressThumbPresetId: config.ThemeConfig?.progressThumbPresetId || '',
    progressThumbCustomUrl: config.ThemeConfig?.progressThumbCustomUrl || '',
    // AI配置（只暴露功能开关，不暴露API密钥等敏感信息）
    AIEnabled: config.AIConfig?.Enabled || false,
    AIEnableHomepageEntry: config.AIConfig?.EnableHomepageEntry || false,
    AIEnableVideoCardEntry: config.AIConfig?.EnableVideoCardEntry || false,
    AIEnablePlayPageEntry: config.AIConfig?.EnablePlayPageEntry || false,
    AIDefaultMessageNoVideo: config.AIConfig?.DefaultMessageNoVideo || '',
    AIDefaultMessageWithVideo: config.AIConfig?.DefaultMessageWithVideo || '',
  };
  return NextResponse.json(result);
}
