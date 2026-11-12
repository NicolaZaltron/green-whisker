// Uso: NODE_PATH=$PWD/node_modules node scripts/test_rolling_days.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rolling-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/utils/dates.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { rollingDays } = require(path.join(outDir, 'dates.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

check('start on Sunday: 7 days end on Saturday', () => {
  const start = new Date(2026, 10, 15); // domenica 15/11/2026
  assert.equal(start.getDay(), 0);
  const { days, label } = rollingDays(start, 7);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map(d => d.dateString),
    ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
  // weekdayIndex Monday-first: domenica = 6, lunedì successivo = 0, sabato = 5
  assert.deepEqual(days.map(d => d.weekdayIndex), [6, 0, 1, 2, 3, 4, 5]);
  assert.equal(days[6].weekdayIndex, 5);
  assert.equal(label, '15 novembre – 21 novembre');
});

check('start on Monday: weekdayIndex runs 0..6', () => {
  const start = new Date(2026, 10, 2); // lunedì 02/11/2026
  assert.equal(start.getDay(), 1);
  const { days } = rollingDays(start, 7);
  assert.deepEqual(days.map(d => d.weekdayIndex), [0, 1, 2, 3, 4, 5, 6]);
});

check('month boundary: consecutive dates (2026-10-29 is a Thursday)', () => {
  const start = new Date(2026, 9, 29);
  const { days, label } = rollingDays(start, 7);
  assert.deepEqual(days.map(d => d.dateString),
    ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  assert.deepEqual(days.map(d => d.dayNumber), [29, 30, 31, 1, 2, 3, 4]);
  assert.deepEqual(days.map(d => d.monthIndex), [9, 9, 9, 10, 10, 10, 10]);
  assert.equal(label, '29 ottobre – 4 novembre');
});

check('label uses zero-padded day and month', () => {
  const start = new Date(2026, 1, 2); // 02/02/2026
  const { label } = rollingDays(start, 7);
  assert.equal(label, '2 febbraio – 8 febbraio');
});

check('start time of day is ignored', () => {
  const start = new Date(2026, 10, 2, 23, 59, 59);
  const { days } = rollingDays(start, 7);
  assert.equal(days[0].dateString, '2026-11-02');
});

console.log(`\n${passed} test passed`);
