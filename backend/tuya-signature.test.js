const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

test('status logs paginate, sort, deduplicate and reject broken cursors', async () => {
  const source = fs.readFileSync(require.resolve('./tuya-client'), 'utf8');
  const context = vm.createContext({ module: { exports: {} }, URLSearchParams,
    process: { env: {} }, require: name => name === './load-env' ? {} : name === 'crypto' ? crypto : {} });
  vm.runInContext(source, context);
  const paths = [];
  context.mockRequest = async (method, path) => {
    paths.push(path);
    return { result: paths.length === 1 ? { logs: [{ code: 'phase_a', event_time: 200, value: 'second' }], has_more: true, last_row_key: 'next' }
      : { list: [{ code: 'phase_a', event_time: 100, value: 'first' }, { code: 'phase_a', event_time: 200, value: 'second' }], has_more: false } };
  };
  vm.runInContext('request = mockRequest', context);
  const logs = await vm.runInContext("readStatusLogs('device', 0, 300, ['phase_a'])", context);
  assert.deepEqual(Array.from(logs, log => log.timestamp), [100, 200]);
  assert.ok(paths[1].includes('last_row_key=next'));
  context.mockRequest = async () => ({ result: { has_more: true } });
  vm.runInContext('request = mockRequest', context);
  await assert.rejects(vm.runInContext("readStatusLogs('device', 0, 300, ['phase_a'])", context), /incompleta/);
});

test('historical requests sign sorted parameters and send the identical URL, including pagination', async () => {
  const sent = [];
  const source = fs.readFileSync(require.resolve('./tuya-client'), 'utf8');
  const context = vm.createContext({
    module: { exports: {} }, URLSearchParams,
    process: { env: { TUYA_CLIENT_ID: 'test-client', TUYA_CLIENT_SECRET: 'test-secret' } },
    require: name => name === './load-env' ? {} : name === 'crypto' ? crypto : async options => {
      sent.push(options);
      return { status: 200, data: { success: true } };
    }
  });
  vm.runInContext(source, context);
  for (const query of [
    '/report-logs?codes=add_ele&start_time=100&end_time=200&size=100',
    '/report-logs?codes=add_ele&start_time=100&end_time=200&size=100&last_row_key=a%2Bb%3D',
    '/v1.0/token?grant_type=1', '/device/status'
  ]) {
    context.path = query;
    await vm.runInContext("rawRequest('GET', path, { accessToken: 'test-token' })", context);
  }
  assert.equal(new URL(sent[0].url).search, '?codes=add_ele&end_time=200&size=100&start_time=100');
  assert.equal(new URL(sent[1].url).search, '?codes=add_ele&end_time=200&last_row_key=a%2Bb%3D&size=100&start_time=100');
  assert.equal(new URL(sent[2].url).search, '?grant_type=1');
  for (const request of sent) {
    const url = new URL(request.url);
    const hash = crypto.createHash('sha256').update('').digest('hex');
    const input = 'test-clienttest-token' + request.headers.t + 'GET\n' + hash + '\n\n' + url.pathname + url.search;
    const expected = crypto.createHmac('sha256', 'test-secret').update(input).digest('hex').toUpperCase();
    assert.equal(request.headers.sign, expected);
  }
});
