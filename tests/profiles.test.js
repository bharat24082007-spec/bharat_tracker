import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileUsername, profileUrl} from '../public/profiles.js';

// Extract public usernames while rejecting arbitrary hosts and executable or private URLs.
test('profile links and unsafe inputs', () => {
  assert.equal(profileUsername('leetcode', 'https://leetcode.com/u/student_1/'), 'student_1');
  assert.equal(profileUsername('gfg', 'https://www.geeksforgeeks.org/user/student/'), 'student');
  assert.equal(profileUsername('codechef', 'student-1'), 'student-1');
  assert.equal(profileUsername('hackerrank', 'https://www.hackerrank.com/profile/student?x=1'), 'student');
  for (const url of ['https://evil.com/student', 'http://localhost/user', 'https://leetcode.com@evil.com/u/a', 'https://leetcode.com/problems/two-sum/', 'javascript:alert(1)']) assert.throws(() => profileUsername('leetcode', url));
  assert.equal(profileUsername('leetcode', ''), '');
  assert.equal(profileUrl('leetcode', 'student'), 'https://leetcode.com/u/student');
});
