import {
  clearAllPlayRecords,
  deletePlayRecord,
  deletePlayRecords,
  generateStorageKey,
  PlayRecord,
} from './db.client';
import {
  loadLocalEpisodeProgress,
  rememberEpisodeProgressContentKeyForPlayRecord,
  saveLocalEpisodeProgress,
} from './episode-progress';

const PLAY_RECORDS_KEY = 'moontv_play_records';

const record = (title: string): PlayRecord => ({
  title,
  source_name: '测试源',
  year: '2026',
  cover: '',
  index: 1,
  total_episodes: 1,
  play_time: 120,
  total_time: 1800,
  save_time: 1,
  search_title: title,
});

describe('play record deletion cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes local episode progress when deleting one play record', async () => {
    const key = generateStorageKey('source', 'movie');
    localStorage.setItem(
      PLAY_RECORDS_KEY,
      JSON.stringify({ [key]: record('双喜') })
    );
    saveLocalEpisodeProgress('tmdb:tv:123', 0, 120, 1800);
    rememberEpisodeProgressContentKeyForPlayRecord(key, 'tmdb:tv:123');

    await deletePlayRecord('source', 'movie');

    expect(loadLocalEpisodeProgress('tmdb:tv:123', 0)).toBeNull();
  });

  it('removes local episode progress when deleting selected play records', async () => {
    const firstKey = generateStorageKey('source', 'first');
    const secondKey = generateStorageKey('source', 'second');
    localStorage.setItem(
      PLAY_RECORDS_KEY,
      JSON.stringify({
        [firstKey]: record('双喜'),
        [secondKey]: record('别的片'),
      })
    );
    saveLocalEpisodeProgress('tmdb:tv:123', 0, 120, 1800);
    saveLocalEpisodeProgress('douban:456', 0, 90, 1800);
    rememberEpisodeProgressContentKeyForPlayRecord(firstKey, 'tmdb:tv:123');
    rememberEpisodeProgressContentKeyForPlayRecord(secondKey, 'douban:456');

    await deletePlayRecords([firstKey, secondKey]);

    expect(loadLocalEpisodeProgress('tmdb:tv:123', 0)).toBeNull();
    expect(loadLocalEpisodeProgress('douban:456', 0)).toBeNull();
  });

  it('removes all local episode progress when clearing all play records', async () => {
    const key = generateStorageKey('source', 'movie');
    localStorage.setItem(
      PLAY_RECORDS_KEY,
      JSON.stringify({ [key]: record('双喜') })
    );
    saveLocalEpisodeProgress('tmdb:tv:123', 0, 120, 1800);
    rememberEpisodeProgressContentKeyForPlayRecord(key, 'tmdb:tv:123');

    await clearAllPlayRecords();

    expect(loadLocalEpisodeProgress('tmdb:tv:123', 0)).toBeNull();
  });
});
