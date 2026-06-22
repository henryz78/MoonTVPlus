const WATCH_TIME_USER_PREFIX = 'watch_time.user.';

export function getWatchTimeUserKey(username: string) {
  return `${WATCH_TIME_USER_PREFIX}${encodeURIComponent(username)}`;
}
