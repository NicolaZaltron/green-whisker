// Out-of-home options (table seeded from the constant): seed order, and a user change survives a new seed.
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
  const service = require(path.join(ROOT, 'src/services/outOfHomeService.ts'));
  const constant = require(path.join(ROOT, 'src/constants/outOfHome.ts')).OUT_OF_HOME_OPTIONS;

  await db.initDatabase();
  await service.seedOutOfHomeOptions();
  const list = await service.listOutOfHomeOptions();
  assert.deepStrictEqual([...list], [...constant], 'seeded in the constant order');
  console.log(`PASS ${list.length} options seeded in order`);

  raw.prepare("UPDATE out_of_home_option SET label = 'Trattoria' WHERE id = 'ristorante'").run();
  await service.seedOutOfHomeOptions();
  const after = await service.listOutOfHomeOptions();
  assert.strictEqual(after[0], 'Trattoria', 'a user change survives a new seed');
  assert.strictEqual(after.length, constant.length, 'no duplicates after a new seed');
  console.log('PASS a user change survives a new seed without duplicates');

  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
