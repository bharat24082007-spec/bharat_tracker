const {spawn} = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
const lock = net.createServer();

// Check due accounts serially each minute, including retries after a failed run.
function refresh() {
  console.log(new Date().toISOString() + ' Refreshing platform snapshots');
  const child = spawn(process.execPath, [path.join(__dirname, 'fetch-local.cjs'), '--due-only'], {cwd: root, stdio: 'inherit', windowsHide: true});
  let scheduled = false;
  // Schedule once even when process startup emits both error and close events.
  function next() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(refresh, 60 * 1000);
  }
  child.once('error', next);
  child.once('close', next);
}

// Avoid duplicate polling workers on this computer without writing credentials to disk.
lock.on('error', () => { console.error('Local refresh worker already running, or port 18764 is unavailable.'); process.exit(1); });
lock.listen(18764, '127.0.0.1', refresh);
