import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore, collection, doc, getDoc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, runTransaction, writeBatch} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './config.js?v=push1';
import {profileUsername, profileUrl} from './profiles.js';
import {platforms, today, shift, delta, streak, goalProgress} from './metrics.js';
import {taskStatus, selectTasks, reschedule} from './planner.js';
import {initializeNotifications} from './notifications.js';
import {completeSignOut} from './signout.js';
import {weeklyReview} from './review.js';
import {exportWorkspace, requestAccountDeletion} from './account.js';

const names = {leetcode: 'LeetCode', codechef: 'CodeChef', gfg: 'GeeksforGeeks', hackerrank: 'HackerRank'};
let db, auth, rows = [], allRows = [], todos = [], goals = [], skills = [], routines = [], subscriptions = [], taskFilter = 'today', ownerUid = null, profiles = {}, account = {}, generation = 0;
// Select one dashboard element by its CSS selector.
const $ = selector => document.querySelector(selector);

// Create safe DOM content from strings, including user-entered task names.
function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

// Display an actionable error without injecting HTML.
function report(error) {
  $('#message').textContent = error.message || String(error);
}

// Remove a terminal DNS dot so Firebase sees the authorized canonical host.
function canonicalizeHost() {
  if (!location.hostname.endsWith('.')) return false;
  const url = new URL(location.href);
  url.hostname = url.hostname.replace(/\.$/, '');
  location.replace(url.href);
  return true;
}

// Return the owner's collection after successful authentication.
function records(name) {
  return collection(db, 'users', ownerUid, name);
}

// Find the latest measured total while leaving missing observations visible.
function latest(platform) {
  return rows.filter(r => r.platform === platform && r.solved != null).sort((a, b) => b.day.localeCompare(a.day))[0];
}

// Render current totals, daily changes, badges, and measured streaks.
function renderCards() {
  $('#cards').replaceChildren();
  for (const platform of platforms) {
    const value = latest(platform), current = rows.find(r => r.platform === platform && r.day === today());
    const card = element('article', '', 'card'), heading = element('div', names[platform], 'heading');
    card.dataset.platform = platform;
    if (!profiles[platform]) {
      const connect = element('button', 'Connect profile', 'explore');
      connect.onclick = () => showView('connections');
      card.append(heading, element('strong', '—'), element('p', 'Add your profile to start tracking.', 'muted'), connect);
      $('#cards').append(card);
      continue;
    }
    const status = current?.status || (value ? 'not fetched today' : 'awaiting first fetch');
    if (status !== 'ok') heading.append(element('span', status, 'badge'));
    else if (current?.source === 'unofficial-api') heading.append(element('span', 'unofficial API', 'badge'));
    const change = delta(rows, platform, today());
    card.append(heading, element('strong', value?.solved ?? '—'), element('span', 'problems solved', 'muted'),
      element('small', `${change == null ? 'Unknown' : (change >= 0 ? '+' : '') + change} today · ${streak(rows, platform, today())} day streak`),
      element('small', `Rating ${value?.rating == null ? '—' : Math.round(value.rating)} · ${value?.day || 'No snapshot yet'}`, 'muted'));
    if (value?.fetched_at) {
      const fetched = new Date(value.fetched_at);
      const minutes = Math.max(0, Math.floor((Date.now() - fetched.getTime()) / 60000));
      card.append(element('small', `Updated ${minutes < 1 ? 'just now' : minutes + ' min ago'} · ${fetched.toLocaleTimeString('en-IN', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit'})} IST`, 'muted'));
    }
    const explore = element('button', 'Explore areas →', 'explore');
    explore.onclick = () => { $('#topic-platform').value = platform; $('#topic-search').value = ''; showView('skills'); renderTopics(); };
    card.append(explore);
    const link = element('a', '@' + profiles[platform], 'profile-link');
    link.href = profileUrl(platform, profiles[platform]); link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
    const health = element('details', '', 'connection-health'), title = element('summary', 'Connection health');
    const descriptions = {HTTPError: 'The provider rejected the request or is temporarily blocking access.', URLError: 'The provider could not be reached.', TimeoutError: 'The provider took too long to respond.', ValueError: 'The public profile could not be read. Check the username; the provider may have changed its response.'};
    health.append(title, element('p', status === 'unavailable' ? descriptions[current?.error] || 'The last fetch failed. Your last known count is preserved.' : !value ? 'Waiting for the first server fetch.' : 'The latest saved profile snapshot is available.', 'muted'));
    if (current?.last_attempt_at || current?.fetched_at) health.append(element('p', 'Last attempt: ' + new Date(current.last_attempt_at || current.fetched_at).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}) + ' IST', 'muted'));
    const retry = element('button', 'Request another sync'); retry.disabled = Boolean(account.syncRequest && account.syncRequest !== account.lastSyncRequest);
    retry.onclick = () => requestSync().catch(report); health.append(retry); card.append(health);
    $('#cards').append(card);
  }
}

// Draw a dependency-free line chart and a per-platform daily heatmap.
function renderChart() {
  const platform = $('#chart-platform').value, svg = $('#chart');
  const days = Array.from({length: 90}, (_, i) => shift(today(), i - 89));
  const points = days.map(day => rows.find(r => r.platform === platform && r.day === day)?.solved ?? null);
  const max = Math.max(1, ...points.filter(v => v != null));
  svg.replaceChildren();
  for (let i = 0; i <= 4; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M40 ${15 + i * 40} H690`); line.setAttribute('stroke', '#e7ece5'); svg.append(line);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', '0'); label.setAttribute('y', String(19 + i * 40)); label.setAttribute('font-size', '11'); label.setAttribute('fill', '#72837b'); label.textContent = Math.round(max * (1 - i / 4)); svg.append(label);
  }
  let path = '', connected = false;
  points.forEach((value, i) => {
    if (value == null) { connected = false; return; }
    const x = 40 + i * 650 / 89, y = 175 - value * 160 / max;
    path += `${connected ? 'L' : 'M'}${x},${y} `; connected = true;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', '2.5'); dot.setAttribute('fill', '#216551'); svg.append(dot);
  });
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', path); line.setAttribute('stroke', '#216551'); line.setAttribute('stroke-width', '2'); line.setAttribute('fill', 'none'); svg.append(line);
  $('#heatmap').replaceChildren();
  for (let i = -90; i <= 0; i++) {
    const day = shift(today(), i), count = delta(rows, platform, day), cell = element('span');
    cell.title = `${day}: ${count == null ? 'unknown' : count + ' solved'}`;
    cell.setAttribute('aria-label', cell.title);
    cell.style.background = count == null ? '#e5e8e4' : count <= 0 ? '#edf3e8' : count < 3 ? '#a7c99a' : count < 6 ? '#5e9973' : '#216551';
    $('#heatmap').append(cell);
  }
}

// Render overlapping LeetCode topics and its difficulty split.
function renderTopics() {
  const platform = $('#topic-platform').value, value = latest(platform);
  const entries = platform === 'leetcode' ? Object.entries(value?.topics || {}) : skills.filter(s => s.platform === platform && (!s.username || s.username === profiles[platform])).map(s => [s.topic, s.count]);
  const topics = entries.filter(([name]) => name.toLowerCase().includes($('#topic-search').value.toLowerCase())).sort((a, b) => b[1] - a[1]);
  $('#difficulty').textContent = value?.difficulty ? `Easy ${value.difficulty.easy} · Medium ${value.difficulty.medium} · Hard ${value.difficulty.hard}` : `${names[platform]} · ${value?.solved ?? 'Unknown'} total solved`;
  $('#topic-note').textContent = platform === 'leetcode' ? `Automatic topic counts · snapshot ${value?.day || 'pending'}. Topics overlap; one problem can appear in several areas.` : 'Manually recorded topic totals. Use the form below to add or correct an area; these are separate from automatic platform totals.';
  $('#topics').replaceChildren();
  if (!topics.length) $('#topics').append(element('p', entries.length ? 'No matching topics.' : 'No topic counts yet. Start with your first area.', 'muted'));
  for (const [name, count] of topics) {
    const item = element('div', name, 'topic'), bar = element('progress');
    bar.max = Math.max(1, ...topics.map(t => t[1])); bar.value = count;
    bar.setAttribute('aria-label', `${name}: ${count} solved`);
    item.append(element('span', `${count} solved`), bar);
    if (platform !== 'leetcode') {
      const saved = skills.find(s => s.platform === platform && s.topic === name && (!s.username || s.username === profiles[platform]));
      const remove = element('button', 'Remove'); remove.onclick = () => deleteDoc(doc(records('skills'), saved.id)).catch(report);
      item.append(remove);
    }
    $('#topics').append(item);
  }
}

// Select a workspace page, update its heading, and keep navigation accessible.
function showView(view) {
  const topics = view === 'skills';
  if (topics) view = 'platforms';
  const pages = {today: ['Today', 'Your tasks, deadlines, and daily progress.'], platforms: ['Practice', 'Your coding profiles and areas of practice.'], planner: ['Planner', 'Make a plan for today and what comes next.'], review: ['Insights', 'Review your week and track your goals.'], connections: ['Settings', 'Profiles, reminders, and your account.']};
  if (!pages[view]) view = 'today';
  for (const name of Object.keys(pages)) {
    $(`#view-${name}`).hidden = name !== view;
    $(`[data-view="${name}"]`).setAttribute('aria-pressed', String(name === view));
  }
  $('#page-title').textContent = pages[view][0];
  $('#page-description').textContent = pages[view][1];
  if (topics) $('#view-skills').scrollIntoView({behavior: 'smooth', block: 'start'});
}

// Save a task edit and keep the control disabled until Firestore acknowledges it.
async function changeTask(task, changes, control) {
  control.disabled = true;
  try { await updateDoc(doc(records('todos'), task.id), changes); }
  catch (error) { report(error); renderTodos(); renderToday(); }
  finally { control.disabled = false; }
}

// Render missed-task reminders, date filters, completion, and explicit rescheduling.
function renderTodos() {
  const day = today(), missed = todos.filter(t => taskStatus(t, day) === 'missed');
  const due = todos.filter(t => t.due === day), completed = due.filter(t => t.done).length;
  $('#planner-summary').textContent = `${completed}/${due.length} today's tasks complete · ${missed.length} missed`;
  $('#planner-alert').hidden = !missed.length;
  $('#planner-alert').replaceChildren(element('span', `${missed.length} task${missed.length === 1 ? '' : 's'} missed their due date. Bring them into your next plan.`));
  const review = element('button', 'Review missed tasks');
  review.onclick = () => { taskFilter = 'missed'; showView('planner'); renderTodos(); };
  $('#planner-alert').append(review);
  const labels = {today: 'Today + unfinished work', tomorrow: 'Tomorrow', missed: 'Missed deadlines', upcoming: 'Coming up', all: 'All tasks', done: 'Completed', date: $('#task-date').value};
  $('#task-list-title').textContent = labels[taskFilter];
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === taskFilter)));
  $('#todos').replaceChildren();
  const visible = selectTasks(todos, taskFilter, day, $('#task-date').value);
  if (!visible.length) $('#todos').append(element('p', 'Nothing here. Plan a small step or enjoy a clear slate.', 'empty-state'));
  for (const task of visible) $('#todos').append(taskRow(task));
}

// Build a compact task row with completion and expandable scheduling controls.
function taskRow(task) {
  const day = today();
  const item = element('div', '', 'item'), body = element('div', task.title, 'body' + (task.done ? ' done' : ''));
  const check = element('input'); check.type = 'checkbox'; check.checked = task.done; check.setAttribute('aria-label', `Complete ${task.title}`);
  check.onchange = () => changeTask(task, {done: check.checked, completedAt: check.checked ? new Date().toISOString() : ''}, check);
  const remove = element('button', 'Delete'); remove.onclick = () => deleteDoc(doc(records('todos'), task.id)).catch(report);
  const status = taskStatus(task, day);
  body.append(element('small', `${task.category || 'General'} · ${task.priority} priority · ${task.due || 'No date'} · ${status}`));
  if (status === 'missed') item.classList.add('missed');

  if (task.originalDue && task.originalDue !== task.due) body.append(element('small', `Originally due ${task.originalDue}`));
  const actions = element('details', '', 'task-actions'); actions.append(element('summary', 'Details & actions'));
  const routine = routines.find(routine => routine.id === task.seriesId);
  if (routine) {
    body.append(element('small', routine.enabled ? `Repeats ${routine.frequency}` : 'Repeating schedule stopped'));
    if (routine.enabled) {
      const stop = element('button', 'Stop repeating'); stop.onclick = () => updateDoc(doc(records('routines'), routine.id), {enabled: false}).catch(report); actions.append(stop);
    }
  }
  if (!task.done) {
    const tomorrow = element('button', 'Move to tomorrow');
    tomorrow.onclick = () => changeTask(task, reschedule(task, shift(today(), 1)), tomorrow);
    const date = element('input'); date.type = 'date'; date.value = task.due; date.setAttribute('aria-label', `Reschedule ${task.title}`);
    const move = element('button', 'Set date');
    move.onclick = () => { try { changeTask(task, reschedule(task, date.value), move); } catch (error) { report(error); } };
    actions.append(tomorrow, date, move);
  }
  if (task.notes) actions.append(element('p', task.notes, 'task-notes'));
  actions.append(remove); body.append(actions);
  item.dataset.priority = task.priority;
  item.append(check, body);
  return item;
}

// Summarize today's real task and coding data without treating missing history as zero.
function renderToday() {
  const day = today(), due = todos.filter(t => t.due === day), done = due.filter(t => t.done).length;
  const missed = todos.filter(t => taskStatus(t, day) === 'missed');
  const linked = platforms.filter(p => profiles[p]), changes = linked.map(p => delta(rows, p, day));
  const measured = changes.filter(v => v != null);
  const solved = measured.length ? measured.reduce((sum, n) => sum + Math.max(0, n), 0) : '—';
  $('#today-stats').replaceChildren();
  for (const [label, value, note] of [['Tasks complete', `${done} / ${due.length}`, 'Due today'], ['Problems solved', solved, `${measured.length}/${linked.length} platform changes measured`], ['Overdue tasks', missed.length, missed.length ? 'Ready to reschedule' : 'No missed deadlines']]) {
    const stat = element('div', '', 'today-stat'); stat.append(element('span', label, 'muted'), element('strong', value), element('small', note, 'muted')); $('#today-stats').append(stat);
  }
  const focus = selectTasks(todos, 'today', day, day);
  $('#today-tasks').replaceChildren();
  for (const task of focus) $('#today-tasks').append(taskRow(task));
  if (!focus.length) {
    const empty = element('div', '', 'empty-state'); empty.append(element('span', '✓', 'empty-icon'), element('h3', done ? "Today's tasks are complete." : 'A clear day starts here.'), element('p', done ? 'Your completed tasks are saved in Planner and Insights.' : 'Add a task to plan your next step.'));
    const add = element('button', done ? '+ Plan another task' : '+ Add your first task', 'primary'); add.onclick = openTask; empty.append(add); $('#today-tasks').append(empty);
  }
  const goal = goals.filter(g => (!g.username || g.username === profiles[g.platform]) && latest(g.platform)?.solved < g.target).sort((a,b) => a.deadline.localeCompare(b.deadline))[0];
  $('#today-goal-title').textContent = goal ? `${goal.target} on ${names[goal.platform]}` : 'Set a goal';
  $('#today-goal-note').textContent = goal ? `${goalProgress(goal, latest(goal.platform).solved, day).perDay}/day needed · due ${goal.deadline}` : 'Choose a target and deadline to see your daily pace here.';
  $('#today-upcoming').replaceChildren();
  const upcoming = todos.filter(t => !t.done && t.due > day && t.due <= shift(day, 7)).sort((a,b) => a.due.localeCompare(b.due)).slice(0, 5);
  for (const task of upcoming) { const row = element('div', '', 'upcoming-task'); row.append(element('span', task.title), element('small', `${task.due === shift(day, 1) ? 'Tomorrow' : task.due} · ${task.priority}`, 'muted')); $('#today-upcoming').append(row); }
  if (!upcoming.length) $('#today-upcoming').append(element('p', 'No deadlines in the next 7 days.', 'muted'));
}

// Open the quick task dialog with today's date and focus the task title.
function openTask() {
  $('#todo-form [name="due"]').value = today();
  $('#task-dialog').showModal();
  $('#todo-form [name="title"]').focus();
}

// Queue a user's refresh request without allowing changes to server-owned sync metadata.
async function requestSync() {
  $('#sync').disabled = true;
  try { await setDoc(doc(db, 'users', ownerUid), {syncRequest: new Date().toISOString()}, {merge: true}); }
  catch (error) { $('#sync').disabled = false; throw error; }
}

// Render a factual weekly review using the current account's measured history.
function renderReview() {
  const review = weeklyReview(rows, todos, $('#review-date').value || today(), today(), profiles);
  $('#review-range').textContent = `${review.start} — ${review.end} · IST`;
  $('#review-stats').replaceChildren();
  for (const [label, value] of [['Known new solves', review.solved], ['Tasks completed', review.completed.length], ['Unfinished deadlines', review.missed.length]]) {
    const item = element('article', '', 'card'); item.append(element('div', label, 'heading'), element('strong', value)); $('#review-stats').append(item);
  }
  $('#review-platforms').replaceChildren();
  for (const [platform, count] of Object.entries(review.counts)) {
    const item = element('div', '', 'item'); item.append(element('span', names[platform], 'body'), element('span', `${count.solved} solved · ${count.measured}/${count.days} daily changes measured`, 'muted')); $('#review-platforms').append(item);
  }
  if (!Object.keys(review.counts).length) $('#review-platforms').append(element('p', 'Connect a profile to include coding progress.', 'muted'));
  $('#review-topics').replaceChildren();
  if (!review.topics?.length) $('#review-topics').append(element('p', review.topics ? 'No measured topic increases this week.' : 'A topic baseline is not available for this week yet.', 'muted'));
  for (const [name, count] of (review.topics || []).slice(0, 12)) $('#review-topics').append(element('div', `${name} · +${count}`, 'topic'));
  $('#review-tasks').replaceChildren();
  for (const task of review.completed) $('#review-tasks').append(element('div', task.title, 'item'));
  if (!review.completed.length) $('#review-tasks').append(element('p', 'No timestamped completions in this week yet.', 'muted'));
}

// Show target pace from a saved baseline, deadline, and latest observed count.
function renderGoals() {
  $('#goals').replaceChildren();
  if (!goals.length) $('#goals').append(element('p', 'Choose a target worth showing up for.', 'muted'));
  for (const goal of goals) {
    const value = !goal.username || goal.username === profiles[goal.platform] ? latest(goal.platform) : null, item = element('div', '', 'item'), body = element('div', `${names[goal.platform]} → ${goal.target}`, 'body');
    if (value) {
      const progress = goalProgress(goal, value.solved, today());
      body.append(element('small', `${progress.label} · ${progress.remaining} left · ${progress.perDay}/day needed · due ${goal.deadline} · count as of ${value.day}`));
    } else body.append(element('small', goal.username && goal.username !== profiles[goal.platform] ? `For @${goal.username}. Reconnect that profile to track this goal.` : 'Waiting for a measured total'));
    const remove = element('button', 'Delete'); remove.onclick = () => deleteDoc(doc(records('goals'), goal.id)).catch(report);
    item.append(body, remove); $('#goals').append(item);
  }
}

// Refresh all date-sensitive displays from the current local cache.
function render() {
  rows = allRows.filter(r => profiles[r.platform] && r.username === profiles[r.platform]);
  $('#date').textContent = new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long'}).format(new Date());
  $('#connection-count').textContent = `${Object.keys(profiles).length} / 4 connected`;
  const pending = account.syncRequest && account.syncRequest !== account.lastSyncRequest;
  $('#sync-status').textContent = pending ? 'Refresh queued. Keep working; your cards update when the worker finishes.' : account.lastSyncAt ? `Last sync ${new Date(account.lastSyncAt).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} IST` : 'Connect a public profile to start your history.';
  $('#sync').disabled = !Object.keys(profiles).length || Boolean(pending);
  renderCards(); renderChart(); renderTopics(); renderTodos(); renderGoals(); renderReview(); renderToday();
}

// Subscribe only to the verified user's own private workspace.
async function session(user) {
  subscriptions.forEach(stop => stop()); subscriptions = []; rows = []; allRows = []; todos = []; goals = []; skills = []; routines = []; profiles = {}; account = {};
  ownerUid = user?.uid || null;
  const version = ++generation;
  const allowed = user && user.emailVerified;
  if (!allowed) $('#account-name').textContent = 'Your student workspace.';
  $('#login').hidden = allowed; $('#dashboard').hidden = !allowed; $('#logout').hidden = !user;
  $('#identity').textContent = user && !allowed ? 'Use a verified Google account to continue.' : '';
  $('#push-received').textContent = '';
  $('#account-status').textContent = '';
  $('#connections-form').reset();
  for (const name of ['cards', 'todos', 'today-tasks', 'today-upcoming', 'today-stats', 'topics', 'goals', 'review-stats', 'review-platforms', 'review-topics', 'review-tasks']) $('#' + name).replaceChildren();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  render();
  document.body.classList.toggle('signed-in', Boolean(allowed));
  if (!allowed) return;
  try {
    const deletion = await getDoc(doc(db, 'users', ownerUid, 'accountRequests', 'deletion'));
    if (deletion.exists()) { await signOut(auth); $('#message').textContent = 'Your account deletion is queued. Workspace access is disabled while the worker removes it.'; return; }
    await runTransaction(db, async transaction => {
      const root = doc(db, 'users', user.uid), existing = await transaction.get(root);
      if (!existing.exists()) transaction.set(root, {profiles: {}, syncRequest: ''});
    });
  } catch (error) { if (generation === version && auth.currentUser?.uid === user.uid) report(error); return; }
  if (generation !== version) return;
  const initialView = new URLSearchParams(location.search).get('view');
  showView(initialView || 'today');
  $('#account-name').textContent = user.displayName || user.email || 'Your workspace';
  $('#message').textContent = '';
  subscriptions.push(onSnapshot(doc(db, 'users', ownerUid), snapshot => {
    if (generation !== version) return;
    account = snapshot.data() || {};
    const connected = Object.fromEntries(Object.entries(account.profiles || {}).filter(([platform, handle]) => platforms.includes(platform) && typeof handle === 'string' && handle.trim()));
    const changed = JSON.stringify(profiles) !== JSON.stringify(connected);
    profiles = connected;
    if (changed) for (const platform of platforms) $('#connections-form').elements[platform].value = profiles[platform] ? profileUrl(platform, profiles[platform]) : '';
    if (!Object.keys(profiles).length && changed) showView('connections');
    render();
  }, error => { if (generation === version && auth.currentUser?.uid === user.uid) report(error); }));
  for (const name of ['snapshots', 'todos', 'goals', 'skills', 'routines']) {
    subscriptions.push(onSnapshot(records(name), snapshot => {
      if (generation !== version) return;
      const values = snapshot.docs.map(doc => ({...doc.data(), id: doc.id}));
      if (name === 'snapshots') allRows = values;
      if (name === 'todos') todos = values;
      if (name === 'goals') goals = values;
      if (name === 'skills') skills = values;
      if (name === 'routines') routines = values;
      render();
    }, error => { if (generation === version && auth.currentUser?.uid === user.uid) report(error); }));
  }
  render();
}

// Save a form once at a time and show network or validation failures.
async function submit(event, action) {
  event.preventDefault();
  const savingUid = ownerUid;
  const form = event.target, button = form.querySelector('button[type="submit"], button:not([type])'); button.disabled = true;
  try { const feedback = await action(new FormData(form)); if (ownerUid !== savingUid) return; if (form.id !== 'connections-form') form.reset(); if (form.id === 'todo-form') { form.elements.due.value = today(); $('#task-dialog').close(); } $('#message').textContent = feedback || 'Saved.'; setTimeout(() => { if ($('#message').textContent === (feedback || 'Saved.')) $('#message').textContent = ''; }, 3500); }
  catch (error) { if (ownerUid === savingUid) report(error); }
  finally { button.disabled = false; }
}

// Start Firebase and wire dashboard forms without requiring a build step.
function start() {
  if (canonicalizeHost()) return;
  $('#view-platforms').append($('#view-skills')); $('#view-skills').hidden = false;
  $('#view-review').append($('#goal-form').closest('.panel'));
  document.querySelectorAll('[data-add-task]').forEach(button => { button.onclick = openTask; });
  document.querySelectorAll('[data-go]').forEach(button => { button.onclick = () => showView(button.dataset.go); });
  $('#task-cancel').onclick = () => $('#task-dialog').close();
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, select, dialog, [contenteditable]') && auth?.currentUser && !document.querySelector('dialog[open]')) { event.preventDefault(); openTask(); }
  });
  for (const select of [$('#chart-platform'), $('#goal-form select'), $('#topic-platform')]) {
    for (const platform of platforms) { const option = element('option', names[platform]); option.value = platform; select.append(option); }
  }
  if (['apiKey', 'appId', 'authDomain', 'projectId'].some(key => !firebaseConfig[key] || firebaseConfig[key].includes('REPLACE'))) {
    $('#setup').hidden = false;
    $('#setup').textContent = 'Google sign-in needs your Firebase web-app configuration. Open Firebase Console → Project settings → General → Your apps → Web app → Config, then copy those values into public/config.js.';
    $('#signin').textContent = 'Firebase setup required';
    $('#signin').disabled = true;
    return;
  }
  const app = initializeApp(firebaseConfig); db = getFirestore(app); auth = getAuth(app);
  const notifications = initializeNotifications(app, auth, db);
  $('#signin').onclick = async () => {
    $('#signin').disabled = true; $('#message').textContent = '';
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) {
      if (error.code === 'auth/unauthorized-domain') report(Error('Firebase rejected this site address. Open https://momentum-student-workspace.web.app/ and try again.'));
      else if (error.code !== 'auth/popup-closed-by-user') report(error);
    }
    finally { $('#signin').disabled = false; }
  };
  $('#logout').onclick = async () => {
    const button = $('#logout'); button.disabled = true; button.textContent = 'Signing out…';
    try {
      const cleaned = await completeSignOut(notifications.beforeSignOut, () => signOut(auth));
      $('#message').textContent = cleaned ? 'Signed out.' : 'Signed out. Notification cleanup could not finish; check this browser’s notification settings.';
    } catch (error) { report(error); }
    finally { button.disabled = false; button.textContent = 'Sign out'; }
  };
  onAuthStateChanged(auth, session);
  $('#chart-platform').onchange = renderChart;
  $('#topic-platform').onchange = renderTopics;
  $('#topic-search').oninput = renderTopics;
  $('#sync').onclick = () => requestSync().catch(report);
  $('#review-date').value = today(); $('#review-date').onchange = renderReview;
  $('#export-data').onclick = async () => {
    $('#export-data').disabled = true;
    try { await exportWorkspace(db, auth); $('#account-status').textContent = 'Export downloaded. Keep this file private.'; }
    catch (error) { report(error); } finally { $('#export-data').disabled = false; }
  };
  $('#delete-account').onclick = () => { $('#delete-text').value = ''; $('#delete-confirm').disabled = true; $('#delete-dialog').showModal(); };
  $('#delete-cancel').onclick = () => $('#delete-dialog').close();
  $('#delete-text').oninput = () => { $('#delete-confirm').disabled = $('#delete-text').value !== 'DELETE'; };
  $('#delete-form').onsubmit = async event => {
    event.preventDefault(); if ($('#delete-text').value !== 'DELETE') return;
    $('#delete-confirm').disabled = true;
    try {
      await requestAccountDeletion(db, auth, notifications.beforeSignOut);
      subscriptions.forEach(stop => stop()); subscriptions = [];
      $('#delete-dialog').close(); await signOut(auth);
      $('#message').textContent = 'Deletion queued. Your workspace is locked while the worker removes your records and Firebase login.';
    } catch (error) { report(error); $('#delete-confirm').disabled = false; }
  };
  $('#connections-form').onsubmit = event => submit(event, async data => {
    const links = {};
    for (const platform of platforms) { const value = profileUsername(platform, data.get(platform)); if (value) links[platform] = value; }
    const fields = {profiles: links};
    if (Object.keys(links).length) fields.syncRequest = new Date().toISOString();
    await setDoc(doc(db, 'users', ownerUid), fields, {mergeFields: Object.keys(fields)});
    showView('platforms');
    return Object.keys(links).length ? 'Profiles saved. Sync requested.' : 'No profiles connected. No sync requested.';
  });
  $('#todo-form [name="due"]').value = today();
  $('#task-date').value = today();
  $('#due-today').onclick = () => { $('#todo-form [name="due"]').value = today(); };
  $('#due-tomorrow').onclick = () => { $('#todo-form [name="due"]').value = shift(today(), 1); };
  document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => showView(button.dataset.view); });
  document.querySelectorAll('[data-filter]').forEach(button => { button.onclick = () => { taskFilter = button.dataset.filter; renderTodos(); }; });
  $('#task-date').onchange = () => { taskFilter = 'date'; renderTodos(); };
  $('#manual-form').onsubmit = event => submit(event, async data => {
    const platform = data.get('platform'), solved = Number(data.get('solved')), day = today();
    if (!profiles[platform]) throw Error('Connect this platform first.');
    if (!Number.isSafeInteger(solved) || solved < 0) throw Error('Enter a non-negative whole total.');
    await setDoc(doc(records('snapshots'), `${day}_${platform}`), {platform, username: profiles[platform], solved, rating: null, status: 'manual', fetched_at: new Date().toISOString(), day});
  });
  $('#todo-form').onsubmit = event => submit(event, async data => {
    const title = data.get('title').trim(); if (!title) throw Error('Enter a task name.');
    const fields = {title, due: data.get('due'), priority: data.get('priority'), category: data.get('category'), notes: data.get('notes').trim(), done: false, createdAt: new Date().toISOString()};
    const frequency = data.get('frequency');
    if (frequency === 'none') await addDoc(records('todos'), fields);
    else {
      const routine = doc(records('routines')), batch = writeBatch(db);
      batch.set(routine, {title, priority: fields.priority, category: fields.category, notes: fields.notes, frequency, startDay: fields.due, generatedThrough: fields.due, enabled: true});
      batch.set(doc(records('todos'), routine.id + '_' + fields.due), {...fields, seriesId: routine.id});
      await batch.commit();
    }
  });
  $('#skill-form').onsubmit = event => submit(event, async data => {
    const platform = data.get('platform'), topic = data.get('topic').trim(), count = Number(data.get('count'));
    if (!profiles[platform]) throw Error('Connect this platform first.');
    if (!topic || !Number.isSafeInteger(count) || count < 0) throw Error('Enter a topic and a whole solved count.');
    const id = platform + '_' + profiles[platform] + '_' + encodeURIComponent(topic.toLowerCase());
    await setDoc(doc(records('skills'), id), {platform, username: profiles[platform], topic, count});
  });
  $('#goal-form').onsubmit = event => submit(event, async data => {
    const platform = data.get('platform'), target = Number(data.get('target')), baseline = latest(platform), deadline = data.get('deadline');
    if (!baseline) throw Error('Fetch or log a starting total before creating this goal.');
    if (deadline < today() || target <= baseline.solved || !Number.isSafeInteger(target)) throw Error('Choose a future deadline and a target above your current total.');
    await addDoc(records('goals'), {platform, username: profiles[platform], target, deadline, startDay: today(), startSolved: baseline.solved});
  });
  setInterval(() => { if (auth.currentUser?.uid === ownerUid) render(); }, 60000);
}

start();
