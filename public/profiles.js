export const profileHosts = {leetcode: 'leetcode.com', codechef: 'codechef.com', gfg: 'geeksforgeeks.org', hackerrank: 'hackerrank.com'};

// Accept only supported profile URLs or simple usernames, never arbitrary fetch targets.
export function profileUsername(platform, input) {
  let value = input.trim();
  if (!value) return '';
  if (/^(https?:\/\/|www\.)/i.test(value) || value.includes('/') || value.includes('.')) {
    let url;
    try { url = new URL(value.startsWith('http') ? value : 'https://' + value); }
    catch { throw Error('Invalid profile link. Paste a supported profile URL or a username.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw Error('Invalid profile link. Use an HTTPS link without credentials or a port.');
    const host = url.hostname.replace(/^www\./, '');
    if (![profileHosts[platform], ...(platform === 'gfg' ? ['auth.geeksforgeeks.org'] : [])].includes(host)) throw Error(`Invalid profile link. Use a ${profileHosts[platform]} profile link.`);
    const parts = url.pathname.split('/').filter(Boolean);
    const routes = {leetcode: ['u'], codechef: ['users'], gfg: ['user', 'profile'], hackerrank: ['profile']};
    if (!routes[platform] || !routes[platform].includes(parts[0])) throw Error('Invalid profile link. Paste the platform profile page, not a problem or contest link.');
    parts.shift();
    if (parts.length !== 1) throw Error('Invalid profile link. Paste the platform profile page, not a problem or contest link.');
    value = parts[0];
  }
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(value)) throw Error('Invalid profile link or username. Usernames may contain letters, numbers, underscores, or hyphens.');
  return value;
}

// Build canonical profile links from validated usernames.
export function profileUrl(platform, username) {
  const prefixes = {leetcode: 'https://leetcode.com/u/', codechef: 'https://www.codechef.com/users/', gfg: 'https://www.geeksforgeeks.org/user/', hackerrank: 'https://www.hackerrank.com/profile/'};
  return prefixes[platform] + encodeURIComponent(username);
}
