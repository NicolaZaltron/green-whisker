// Out-of-home options editing: add, duplicate refusal, rename, delete, order.
// Runs the real database module on an in-memory SQLite. Run: NODE_PATH=$PWD/node_modules node scripts/test_out_of_home_seed.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const raw = new DatabaseSync(':memory:');
const adapter = {
  execAsync: async sql => raw.exec(sql),
  closeAsync: async () => {},
  withTransactionAsync: async task => { await task(); },
  getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params),
  getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
  runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
};

const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (req === 'expo-sqlite') return { openDatabaseAsync: async () => adapter, deleteDatabaseAsync: async () => {} };
  if (req === 'react-native') return { Platform: { OS: 'web' } };
  if (req === 'react-i18next') return { initReactI18next: { type: '3rdParty', init() {} }, useTranslation: () => ({ t: k => k }) };
  if (/^(@expo|expo|react)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};

async function run() {
  const db = require(path.join(ROOT, 'src/db/database.ts'));
  const s = require(path.join(ROOT, 'src/services/outOfHomeService.ts'));
  await db.initDatabase();
  await s.seedOutOfHomeOptions();
  const base = [...(await s.listOutOfHomeOptions())];

  await s.addOutOfHomeOption('  Gastronomia  ');
  let list = [...(await s.listOutOfHomeOptions())];
  assert.strictEqual(list[list.length - 1], 'Gastronomia', 'added trimmed at the end');
  assert.strictEqual(list.length, base.length + 1);
  console.log('PASS add');

  await assert.rejects(s.addOutOfHomeOption('gastronomia'), /outOfHome.errorDuplicate/);
  await assert.rejects(s.addOutOfHomeOption('   '), /outOfHome.errorEmpty/);
  console.log('PASS duplicate and empty refused');

  await s.renameOutOfHomeOption('gastronomia', 'Pizza al taglio');
  await assert.rejects(s.renameOutOfHomeOption('gastronomia', base[0]), /outOfHome.errorDuplicate/);
  await s.renameOutOfHomeOption('gastronomia', 'PIZZA AL TAGLIO'); // own name, other case: allowed
  list = [...(await s.listOutOfHomeOptions())];
  assert.strictEqual(list[list.length - 1], 'PIZZA AL TAGLIO', 'rename keeps the position');
  console.log('PASS rename');

  await s.deleteOutOfHomeOption('gastronomia');
  list = [...(await s.listOutOfHomeOptions())];
  assert.deepStrictEqual(list, base, 'delete restores the base list, order kept');
  await s.addOutOfHomeOption('Gastronomia');
  assert.strictEqual((await s.listOutOfHomeEntries()).length, base.length + 1);
  console.log('PASS delete and order');

  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
