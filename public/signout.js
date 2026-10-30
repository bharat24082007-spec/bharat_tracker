// Always end authentication after bounded best-effort notification cleanup.
export async function completeSignOut(cleanup, logout, timeoutMs = 2500) {
  let timer, cleaned = false;
  try {
    cleaned = await Promise.race([
      Promise.resolve().then(cleanup).then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })
    ]);
  } catch { cleaned = false; }
  finally { clearTimeout(timer); }
  await logout();
  return cleaned;
}
