'use client';

import { AlertTriangle, ArrowLeft, Clock, Heart, Loader2, Maximize, Radio, RotateCcw, Search, Star, Volume2, VolumeX } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { deleteFavorite, isFavorited, saveFavorite, savePlayRecord } from '@/lib/db.client';

import TVNativeVideo from '@/components/tv/player/TVNativeVideo';
import TVVirtualRemote from '@/components/tv/TVVirtualRemote';

type LiveSource = { key: string; name: string; proxyMode?: 'full' | 'm3u8-only' | 'direct' };
type LiveChannel = { id: string; tvgId?: string; name: string; logo?: string; group?: string; url: string };
type EpgProgram = { start: string; end: string; title: string };

function getLogoUrl(logo?: string, source?: string) {
  if (!logo) return '';
  if (!source) return logo;
  return `/api/proxy/logo?url=${encodeURIComponent(logo)}&source=${encodeURIComponent(source)}`;
}

async function resolveLiveUrl(rawUrl: string, source?: LiveSource | null) {
  const proxyMode = source?.proxyMode || 'full';
  const lower = rawUrl.toLowerCase();
  const isM3u8 = lower.includes('.m3u8') || lower.includes('.m3u');
  if (!isM3u8 || proxyMode === 'direct') return rawUrl;
  return `/api/proxy/m3u8?url=${encodeURIComponent(rawUrl)}&moontv-source=${encodeURIComponent(source?.key || '')}`;
}

function TVLivePlayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const needSource = searchParams.get('source');
  const needChannel = searchParams.get('id');

  const [sources, setSources] = useState<LiveSource[]>([]);
  const [source, setSource] = useState<LiveSource | null>(null);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [channel, setChannel] = useState<LiveChannel | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPanel, setShowPanel] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [query, setQuery] = useState('');
  const [digitBuffer, setDigitBuffer] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [favorited, setFavorited] = useState(false);
  const [epgPrograms, setEpgPrograms] = useState<EpgProgram[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const channelButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const digitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/live/sources')
      .then((r) => {
        if (r.status === 401 || r.status === 403) throw new Error('无权限访问电视直播，请先登录或检查权限');
        if (!r.ok) throw new Error('获取直播源失败');
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        const list = data.data || [];
        setSources(list);
        const selected = list.find((s: LiveSource) => s.key === needSource) || list[0] || null;
        setSource(selected);
        if (!selected) setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '获取直播源失败');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [needSource]);

  useEffect(() => {
    if (!source) return;
    let alive = true;
    setLoading(true);
    setError('');
    fetch(`/api/live/channels?source=${encodeURIComponent(source.key)}`)
      .then((r) => {
        if (r.status === 401 || r.status === 403) throw new Error('无权限访问电视直播，请先登录或检查权限');
        if (!r.ok) throw new Error('获取频道列表失败');
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        const list = (data.data || []).map((item: any) => ({
          id: item.id,
          tvgId: item.tvgId || item.name,
          name: item.name,
          logo: item.logo,
          group: item.group || '其他',
          url: item.url,
        }));
        setChannels(list);
        const selected = list.find((c: LiveChannel) => c.id === needChannel) || list[0] || null;
        setChannel(selected);
        setSelectedGroup(selected?.group || list[0]?.group || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '获取频道列表失败'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [source, needChannel]);

  useEffect(() => {
    let alive = true;
    if (!channel) return;
    setVideoUrl('');
    setPlaybackError(false);
    setRetryCount(0);
    resolveLiveUrl(channel.url, source).then((url) => alive && setVideoUrl(url));
    if (source) {
      savePlayRecord(`live_${source.key}`, `live_${channel.id}`, {
        title: channel.name,
        source_name: source.name,
        year: '',
        cover: getLogoUrl(channel.logo, source.key),
        index: 1,
        total_episodes: 1,
        play_time: 0,
        total_time: 0,
        save_time: Date.now(),
        search_title: channel.name,
        origin: 'live',
      }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [channel, source]);

  useEffect(() => {
    if (!source || !channel) return;
    isFavorited(`live_${source.key}`, `live_${channel.id}`).then(setFavorited).catch(() => undefined);
  }, [channel, source]);

  useEffect(() => {
    if (!source || !channel?.tvgId) {
      setEpgPrograms([]);
      return;
    }
    let alive = true;
    setEpgLoading(true);
    fetch(`/api/live/epg?source=${encodeURIComponent(source.key)}&tvgId=${encodeURIComponent(channel.tvgId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!alive) return;
        setEpgPrograms((data?.data?.programs || []).slice(0, 12));
      })
      .catch(() => alive && setEpgPrograms([]))
      .finally(() => alive && setEpgLoading(false));
    return () => { alive = false; };
  }, [channel?.tvgId, source]);

  useEffect(() => {
    if (!playbackError || !channel || retryCount >= 3) return;
    const timer = window.setTimeout(() => {
      setRetryCount((value) => value + 1);
      setPlaybackError(false);
      setVideoUrl('');
      resolveLiveUrl(channel.url, source).then(setVideoUrl).catch(() => setPlaybackError(true));
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [channel, playbackError, retryCount, source]);

  const groups = useMemo(() => Array.from(new Set(channels.map((item) => item.group || '其他'))), [channels]);
  const filteredChannels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return channels.filter((item) => {
      const groupMatched = (item.group || '其他') === selectedGroup;
      const queryMatched = !keyword || item.name.toLowerCase().includes(keyword) || (item.group || '').toLowerCase().includes(keyword);
      return groupMatched && queryMatched;
    });
  }, [channels, query, selectedGroup]);

  const precheckChannel = async (next: LiveChannel) => {
    if (!source) return;
    try {
      await fetch(`/api/live/precheck?url=${encodeURIComponent(next.url)}&moontv-source=${encodeURIComponent(source.key)}`, { cache: 'no-store' });
    } catch {
      // 预检查失败不阻止切台，播放器错误层会给出重试/换台。
    }
  };

  const switchChannel = (next: LiveChannel) => {
    precheckChannel(next);
    setChannel(next);
    setSelectedGroup(next.group || '其他');
    setShowPanel(true);
    if (source) router.replace(`/tv/live/play?source=${encodeURIComponent(source.key)}&id=${encodeURIComponent(next.id)}`);
  };

  const switchSource = (next: LiveSource) => {
    setSource(next);
    setChannel(null);
    setChannels([]);
    setSelectedGroup('');
    setQuery('');
    setShowPanel(true);
    router.replace(`/tv/live/play?source=${encodeURIComponent(next.key)}`);
  };

  const toggleFavorite = async () => {
    if (!source || !channel) return;
    if (favorited) {
      await deleteFavorite(`live_${source.key}`, `live_${channel.id}`);
      setFavorited(false);
    } else {
      await saveFavorite(`live_${source.key}`, `live_${channel.id}`, {
        title: channel.name,
        source_name: source.name,
        year: '',
        cover: getLogoUrl(channel.logo, source.key),
        total_episodes: 1,
        save_time: Date.now(),
        search_title: channel.name,
        origin: 'live',
      });
      setFavorited(true);
    }
  };

  const setVideoVolume = (next: number) => {
    const safe = Math.max(0, Math.min(1, next));
    const video = document.querySelector<HTMLVideoElement>('[data-tv-player-root] video');
    if (video) {
      video.volume = safe;
      video.muted = safe <= 0;
    }
    setVolume(safe);
    setMuted(safe <= 0);
  };

  const toggleMute = () => {
    const video = document.querySelector<HTMLVideoElement>('[data-tv-player-root] video');
    const next = !muted;
    if (video) video.muted = next;
    setMuted(next);
  };

  const toggleFullscreen = () => {
    const root = document.querySelector<HTMLElement>('[data-tv-player-root]');
    if (!root) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else root.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => {
    if (!videoUrl) return;
    window.requestAnimationFrame(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-tv-player-root] video');
      if (!video) return;
      video.volume = volume;
      video.muted = muted;
    });
  }, [muted, videoUrl, volume]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key) && channels.length) {
        event.preventDefault();
        const nextBuffer = `${digitBuffer}${event.key}`.slice(-4);
        setDigitBuffer(nextBuffer);
        if (digitTimerRef.current) window.clearTimeout(digitTimerRef.current);
        digitTimerRef.current = window.setTimeout(() => {
          const target = Number(nextBuffer);
          const next = channels[target - 1];
          if (next) switchChannel(next);
          setDigitBuffer('');
        }, 850);
      }
      if (event.key === 'Enter') {
        const active = document.activeElement;
        const isControlFocused = active instanceof HTMLElement && Boolean(active.closest('[data-tv-live-control]'));
        if (!isControlFocused) {
          event.preventDefault();
          setShowPanel((v) => !v);
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (showPanel) setShowPanel(false);
        else router.back();
      }
      if (event.key === 'PageUp' || event.key === 'PageDown') {
        const currentIndex = channels.findIndex((item) => item.id === channel?.id);
        if (currentIndex >= 0) {
          const nextIndex = event.key === 'PageUp' ? currentIndex - 1 : currentIndex + 1;
          const next = channels[Math.max(0, Math.min(channels.length - 1, nextIndex))];
          if (next) switchChannel(next);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channel?.id, channels, digitBuffer, router, showPanel, source]);

  useEffect(() => {
    if (!showPanel || !channel?.id) return;
    window.requestAnimationFrame(() => {
      channelButtonRefs.current[channel.id]?.focus({ preventScroll: true });
      channelButtonRefs.current[channel.id]?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }, [channel?.id, selectedGroup, showPanel]);

  if (loading) {
    return <main className='fixed inset-0 flex items-center justify-center bg-black text-3xl font-bold text-white'><Loader2 className='mr-4 h-10 w-10 animate-spin text-rose-500' />正在进入电视直播...</main>;
  }

  if (error || !channel) {
    return (
      <main className='fixed inset-0 flex items-center justify-center bg-black p-10 text-center text-white'>
        <section role='alert' className='max-w-3xl rounded-[36px] border border-red-500/40 bg-red-950/50 p-10 shadow-2xl shadow-red-950/40'>
          <AlertTriangle className='mx-auto mb-5 h-16 w-16 text-red-300' />
          <h1 className='text-4xl font-black text-red-100'>{error || '没有可播放频道'}</h1>
          <div className='mt-8 flex justify-center gap-4'>
            <button onClick={() => window.location.reload()} className='tv-focusable flex cursor-pointer items-center gap-3 rounded-2xl bg-rose-600 px-7 py-4 text-2xl font-black outline-none focus:ring-4 focus:ring-rose-300'><RotateCcw className='h-7 w-7' />重试</button>
            <button onClick={() => router.back()} className='tv-focusable rounded-2xl bg-white/10 px-7 py-4 text-2xl font-black outline-none focus:ring-4 focus:ring-white/40'>返回</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main data-tv-player-root className='fixed inset-0 overflow-hidden bg-black text-white' onMouseMove={() => setShowPanel(true)}>
      {videoUrl ? <TVNativeVideo key={videoUrl} url={videoUrl} poster={getLogoUrl(channel.logo, source?.key)} live title={channel.name} onError={() => setPlaybackError(true)} /> : <div className='flex h-full items-center justify-center text-3xl font-bold'><Loader2 className='mr-4 h-10 w-10 animate-spin text-rose-500' />正在解析直播地址...</div>}

      {playbackError && (
        <div role='alert' className='absolute inset-0 z-30 flex items-center justify-center bg-black/72 p-8 text-white backdrop-blur-sm'>
          <section className='max-w-3xl rounded-[36px] border border-white/10 bg-slate-950/92 p-9 text-center shadow-2xl shadow-black/70'>
            <AlertTriangle className='mx-auto mb-5 h-14 w-14 text-amber-300' />
            <h2 className='text-4xl font-black'>当前频道播放失败</h2>
            <p className='mt-3 text-2xl text-slate-300'>{retryCount < 3 ? `正在自动重连（${retryCount + 1}/3）...` : '可以重试当前频道，或打开频道面板切换频道/直播源。'}</p>
            <div className='mt-8 flex justify-center gap-4'>
              <button onClick={() => { setPlaybackError(false); setVideoUrl(''); if (channel) resolveLiveUrl(channel.url, source).then(setVideoUrl); }} className='tv-focusable flex cursor-pointer items-center gap-3 rounded-2xl bg-rose-600 px-7 py-4 text-2xl font-black outline-none focus:ring-4 focus:ring-rose-300'><RotateCcw className='h-7 w-7' />重试</button>
              <button onClick={() => { setPlaybackError(false); setShowPanel(true); }} className='tv-focusable rounded-2xl bg-white/10 px-7 py-4 text-2xl font-black outline-none focus:ring-4 focus:ring-white/40'>频道列表</button>
            </div>
          </section>
        </div>
      )}

      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${showPanel ? 'opacity-100' : 'opacity-0'}`}>
        <div className='absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/90 to-transparent' />
        <div className='absolute inset-y-0 left-0 w-[560px] bg-gradient-to-r from-black/90 to-transparent' />
      </div>

      <div className={`absolute left-8 right-8 top-8 flex items-center justify-between transition-opacity duration-300 ${showPanel ? 'opacity-100' : 'opacity-0'}`}>
        <button onClick={() => router.back()} data-tv-live-control className='tv-focusable flex cursor-pointer items-center gap-3 rounded-2xl bg-black/70 px-5 py-4 text-2xl font-black outline-none backdrop-blur focus:ring-4 focus:ring-rose-300'><ArrowLeft className='h-7 w-7' />返回</button>
        <div className='flex items-center gap-4 rounded-2xl bg-black/70 px-6 py-4 backdrop-blur'>
          {channel.logo ? <img src={getLogoUrl(channel.logo, source?.key)} alt='' className='h-12 w-12 rounded-xl object-contain' /> : <Radio className='h-10 w-10 text-rose-500' />}
          <div><div className='text-3xl font-black'>{channel.name}</div><div className='text-xl text-slate-300'>{source?.name} · {channel.group}</div></div>
        </div>
        <div className='flex items-center gap-3'>
          <button onClick={toggleMute} data-tv-live-control className='tv-focusable rounded-2xl bg-black/70 p-4 outline-none backdrop-blur focus:ring-4 focus:ring-rose-300'>{muted ? <VolumeX className='h-7 w-7' /> : <Volume2 className='h-7 w-7' />}</button>
          <input aria-label='直播音量' data-tv-live-control type='range' min='0' max='1' step='0.05' value={muted ? 0 : volume} onChange={(e) => setVideoVolume(Number(e.target.value))} className='tv-focusable w-28 accent-rose-600' />
          <button onClick={toggleFullscreen} data-tv-live-control className='tv-focusable rounded-2xl bg-black/70 p-4 outline-none backdrop-blur focus:ring-4 focus:ring-rose-300'><Maximize className='h-7 w-7' /></button>
          <button onClick={toggleFavorite} data-tv-live-control className={`tv-focusable flex cursor-pointer items-center gap-3 rounded-2xl px-5 py-4 text-2xl font-black outline-none backdrop-blur focus:ring-4 focus:ring-rose-300 ${favorited ? 'bg-rose-600' : 'bg-black/70'}`}><Heart className={`h-7 w-7 ${favorited ? 'fill-current' : ''}`} />收藏</button>
        </div>
      </div>

      {showPanel && (
        <aside data-tv-live-control className='absolute bottom-8 left-8 top-28 grid w-[720px] grid-cols-[220px_1fr] gap-4 rounded-[34px] border border-white/10 bg-slate-950/88 p-5 shadow-2xl shadow-black/70 backdrop-blur-2xl'>
          <div className='overflow-y-auto pr-2'>
            {sources.length > 1 && (
              <>
                <h2 className='mb-3 text-2xl font-black'>直播源</h2>
                <div className='mb-5 space-y-3'>
                  {sources.map((item) => <button key={item.key} onClick={() => switchSource(item)} className={`tv-focusable w-full cursor-pointer rounded-2xl px-4 py-4 text-left text-xl font-black outline-none focus:ring-4 focus:ring-rose-300 ${source?.key === item.key ? 'bg-rose-600' : 'bg-white/10'}`}>{item.name}</button>)}
                </div>
              </>
            )}
            <h2 className='mb-4 text-2xl font-black'>分类</h2>
            <div className='space-y-3'>
              {groups.map((group) => <button key={group} onClick={() => setSelectedGroup(group)} className={`tv-focusable w-full cursor-pointer rounded-2xl px-4 py-4 text-left text-xl font-black outline-none focus:ring-4 focus:ring-rose-300 ${selectedGroup === group ? 'bg-rose-600' : 'bg-white/10'}`}>{group}</button>)}
            </div>
          </div>
          <div className='overflow-y-auto pr-2'>
            <h2 className='mb-4 flex items-center gap-2 text-2xl font-black'><Star className='h-6 w-6 text-rose-500' />频道</h2>
            <section className='mb-4 rounded-2xl bg-white/[0.06] p-4'>
              <h3 className='mb-3 flex items-center gap-2 text-xl font-black text-slate-100'><Clock className='h-5 w-5 text-rose-400' />节目单</h3>
              {epgLoading ? <div className='text-lg text-slate-400'>正在加载 EPG...</div> : epgPrograms.length > 0 ? (
                <div className='max-h-36 space-y-2 overflow-y-auto pr-2'>
                  {epgPrograms.map((program, index) => <div key={`${program.start}-${index}`} className='rounded-xl bg-black/25 px-3 py-2 text-base text-slate-200'><span className='mr-2 text-slate-400'>{program.start?.slice(8, 12)}-{program.end?.slice(8, 12)}</span>{program.title}</div>)}
                </div>
              ) : <div className='text-lg text-slate-400'>暂无节目单</div>}
            </section>
            <label className='mb-4 flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 focus-within:border-rose-500'>
              <Search className='h-6 w-6 text-slate-300' />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='搜索频道' className='tv-focusable h-12 flex-1 bg-transparent text-xl font-bold text-white outline-none placeholder:text-slate-500' />
            </label>
            <div className='grid grid-cols-1 gap-3'>
              {filteredChannels.map((item) => {
                const absoluteIndex = channels.findIndex((c) => c.id === item.id) + 1;
                return <button key={item.id} ref={(el) => { channelButtonRefs.current[item.id] = el; }} onClick={() => switchChannel(item)} className={`tv-focusable flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-xl font-black outline-none focus:ring-4 focus:ring-rose-300 ${item.id === channel.id ? 'bg-rose-600' : 'bg-white/10'}`}>{item.logo ? <img src={getLogoUrl(item.logo, source?.key)} alt='' className='h-9 w-9 rounded-lg object-contain' /> : <Radio className='h-8 w-8 text-rose-400' />}<span className='min-w-12 text-slate-300'>#{absoluteIndex}</span><span className='line-clamp-1'>{item.name}</span></button>;
              })}
            </div>
          </div>
        </aside>
      )}
      {digitBuffer && <div className='absolute right-10 top-32 rounded-3xl bg-black/75 px-7 py-5 text-5xl font-black text-white shadow-2xl'>频道 {digitBuffer}</div>}
      <TVVirtualRemote />
    </main>
  );
}

export default function TVLivePlayPage() {
  return <Suspense fallback={null}><TVLivePlayClient /></Suspense>;
}
