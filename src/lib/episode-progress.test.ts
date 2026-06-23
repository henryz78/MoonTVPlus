import {
  buildEpisodeProgressContentKey,
  clearAllLocalEpisodeProgressStorage,
  clearLocalEpisodeProgressForPlayRecord,
  getEpisodeProgressStorageKey,
  loadLocalEpisodeProgress,
  rememberEpisodeProgressContentKeyForPlayRecord,
  saveLocalEpisodeProgress,
} from './episode-progress';

describe('episode progress cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes remembered episode progress when a play record is deleted', () => {
    const contentKey = 'tmdb:tv:123';
    saveLocalEpisodeProgress(contentKey, 0, 120, 1800);
    rememberEpisodeProgressContentKeyForPlayRecord('source+movie', contentKey);

    clearLocalEpisodeProgressForPlayRecord('source+movie');

    expect(loadLocalEpisodeProgress(contentKey, 0)).toBeNull();
  });

  it('removes legacy title progress when no play-record index exists', () => {
    const contentKey = buildEpisodeProgressContentKey({
      title: '双喜',
      year: '2026',
      searchType: 'tv',
    });
    saveLocalEpisodeProgress(contentKey, 0, 90, 1800);

    clearLocalEpisodeProgressForPlayRecord('source+movie', {
      title: '双喜',
      year: '2026',
      search_title: '双喜',
    });

    expect(loadLocalEpisodeProgress(contentKey, 0)).toBeNull();
  });

  it('clears every local episode progress entry when all play records are cleared', () => {
    const firstKey = 'tmdb:tv:123';
    const secondKey = 'douban:456';
    saveLocalEpisodeProgress(firstKey, 0, 90, 1800);
    saveLocalEpisodeProgress(secondKey, 1, 120, 1800);
    rememberEpisodeProgressContentKeyForPlayRecord('source+first', firstKey);
    rememberEpisodeProgressContentKeyForPlayRecord('source+second', secondKey);

    clearAllLocalEpisodeProgressStorage();

    expect(
      localStorage.getItem(getEpisodeProgressStorageKey(firstKey))
    ).toBeNull();
    expect(
      localStorage.getItem(getEpisodeProgressStorageKey(secondKey))
    ).toBeNull();
    expect(loadLocalEpisodeProgress(firstKey, 0)).toBeNull();
    expect(loadLocalEpisodeProgress(secondKey, 1)).toBeNull();
  });
});
