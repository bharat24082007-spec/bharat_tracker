export const profileHosts = {leetcode: 'leetcode.com', codechef: 'codechef.com', gfg: 'geeksforgeeks.org', hackerrank: 'hackerrank.com'};
const INVALID_LINK = 'It is an invalid link. Please re-enter the correct link.';

// Accept only supported profile URLs or simple usernames, never arbitrary fetch targets.
export function profileUsername(platform, input) {
  let value = input.trim();
  if (!value) return '';
  if (/^(https?:\/\/|www\.)/i.test(value) || value.includes('/') || value.includes('.')) {
    let url;
    try { url = new URL(value.startsWith('http') ? value : 'https://' + value); }
    catch { throw Error(INVALID_LINK); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw Error(INVALID_LINK);
    const host = url.hostname.replace(/^www\./, '');
    if (![profileHosts[platform], ...(platform === 'gfg' ? ['auth.geeksforgeeks.org'] : [])].includes(host)) throw Error(INVALID_LINK);
    const parts = url.pathname.split('/').filter(Boolean);
    const routes = {leetcode: ['u'], codechef: ['users'], gfg: ['user', 'profile'], hackerrank: ['profile']};
    if (!routes[platform] || !routes[platform].includes(parts[0])) throw Error(INVALID_LINK);
    parts.shift();
    if (parts.length !== 1) throw Error(INVALID_LINK);
    value = parts[0];
  }
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(value)) throw Error(INVALID_LINK);
  return value;
}

// Build canonical profile links from validated usernames.
export function profileUrl(platform, username) {
  const prefixes = {leetcode: 'https://leetcode.com/u/', codechef: 'https://www.codechef.com/users/', gfg: 'https://www.geeksforgeeks.org/user/', hackerrank: 'https://www.hackerrank.com/profile/'};
  return prefixes[platform] + encodeURIComponent(username);
}
