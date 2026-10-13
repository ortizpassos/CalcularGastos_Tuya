const test = require('node:test');
const assert = require('node:assert/strict');
const { advance, measurement, findMeasurement, installRoutes, hourlyReadingUsage, accumulatedReadingUsage } = require('./bath-monitor');
const config = { usuario: 'teste', kitinete: 'maior', deviceId: 'device', revision: 'v1', thresholdA: 16 };
const sample = (seconds, currentA, powerW = 5000) => ({ at: new Date(seconds * 1000), currentA, powerW });

test('threshold is strictly greater than 16 A; duration and energy accumulate until falling edge', () => {
  assert.equal(advance(null, sample(0, 16), config).active, null);
  let state = advance(null, sample(0, 17), config).active;
  state = advance(state, sample(30, 20), config).active;
  const result = advance(state, sample(60, 15, 0), config);
  assert.equal(result.active, null);
  assert.equal(result.closed.seconds, 60);
  assert.equal(result.closed.energySeconds, 60);
  assert.ok(Math.abs(result.closed.energyKwh - 5000 / 60 / 1000) < 1e-10);
  assert.equal(result.closed.peakA, 20);
  assert.equal(result.closed.status, 'concluido');
});

test('gap never counts unknown duration or energy and requests a new event', () => {
  const first = advance(null, sample(0, 20), config).active;
  const result = advance(first, sample(120, 20), config);
  assert.equal(result.closed.seconds, 0);
  assert.equal(+new Date(result.closed.end), 0);
  assert.equal(result.closed.status, 'interrompido');
  assert.equal(result.retry, true);
});

test('unavailable power preserves time but never invents energy', () => {
  let state = advance(null, sample(0, 20, null), config).active;
  state = advance(state, sample(30, 20, 5000), config).active;
  const result = advance(state, sample(60, 0, 0), config).closed;
  assert.equal(result.seconds, 60);
  assert.equal(result.energySeconds, 30);
  assert.ok(Math.abs(result.energyKwh - 5000 * 30 / 3600000) < 1e-10);
});

test('event retains its original threshold across configuration changes', () => {
  const active = advance(null, sample(0, 20), config).active;
  assert.equal(advance(active, sample(30, 17), { ...config, thresholdA: 19 }).active.thresholdA, 16);
});

test('DP conversion respects metadata unit and scale, including milliamps', () => {
  const status = [{ code: 'cur_current', value: 17000 }, { code: 'cur_power', value: 50000 }];
  const spec = { status: [{ code: 'cur_current', values: '{"scale":0,"unit":"mA"}' }, { code: 'cur_power', values: { scale: 1, unit: 'W' } }] };
  assert.equal(measurement(status, spec, 'cur_current', null, 'A'), 17);
  assert.equal(measurement(status, spec, 'cur_power', null, 'W'), 5000);
  assert.equal(measurement(status, {}, 'cur_current', null, 'A'), null);
  assert.equal(measurement(status, {}, 'cur_current', 1000, 'A'), 17);
  assert.equal(measurement([{ code: 'x', value: true }], {}, 'x', 1, 'A'), null);
});

test('monitor finds alternate current DP and accepts numeric strings', () => {
  const status = [{ code: 'electric_current', value: '18500' }];
  const spec = { status: [{ code: 'electric_current', values: { scale: 0, unit: 'mA' } }] };
  assert.equal(findMeasurement(status, spec, 'cur_current', null, 'A', ['cur_current', 'electric_current']), 18.5);
});

test('device scale takes priority over an old divisor', () => {
  const status = [{ code: 'cur_current', value: 7 }];
  const spec = { status: [{ code: 'cur_current', values: { scale: 1, unit: 'A' } }] };
  assert.equal(measurement(status, spec, 'cur_current', 1000, 'A'), 0.7);
});

test('live diagnostics expose zero raw current and alternate DPs for the authenticated device', async () => {
  const tuya = require('./tuya-client');
  const original = { getDeviceInfo: tuya.getDeviceInfo, getDeviceSpecification: tuya.getDeviceSpecification, getDeviceStatus: tuya.getDeviceStatus };
  const calls = [];
  const routes = {};
  const app = { get: (path, ...handlers) => { routes[path] = handlers.at(-1); }, post() {} };
  const queries = [];
  const db = { collection: name => ({ findOne: async query => {
    queries.push(query);
    return name === 'bath_configs' ? { currentCode: 'cur_current' } : { pessoa1: { deviceId: 'diagnostic-device' } };
  } }) };
  tuya.getDeviceInfo = async id => { calls.push(id); return { online: true }; };
  tuya.getDeviceSpecification = async () => ({ status: [
    { code: 'cur_current', values: { scale: 0, unit: 'mA' } },
    { code: 'electric_current', values: { scale: 1, unit: 'A' } }
  ] });
  tuya.getDeviceStatus = async () => [{ code: 'cur_current', value: 0 }, { code: 'electric_current', value: 185 }];
  try {
    installRoutes(app, () => {}, () => db);
    let result;
    const request = { params: { kitinete: 'maior' }, usuario: { email: 'test-user' }, query: { diagnostico: '1' } };
    await routes['/api/banhos/:kitinete/leitura-atual'](request, { json: value => { result = value; } });
    assert.equal(result.currentA, 0);
    assert.deepEqual(result.diagnostics.readings[1], { code: 'electric_current', rawValue: 185, unit: 'A', scale: 1, currentA: 18.5 });
    assert.equal(result.diagnostics.configuredCode, 'cur_current');
    assert.ok(queries.every(query => query.usuario === 'test-user'));
    assert.deepEqual(calls, ['diagnostic-device']);
    await routes['/api/banhos/:kitinete/leitura-atual']({ ...request, query: {} }, { json: value => { result = value; } });
    assert.equal(result.diagnostics, undefined);
  } finally { Object.assign(tuya, original); }
});

test('all monitor endpoints require auth, reject superior and invalid threshold', async () => {
  const routes = {};
  const auth = () => {};
  const app = { get: (p, ...h) => { routes['GET ' + p] = h; }, post: (p, ...h) => { routes['POST ' + p] = h; } };
  installRoutes(app, auth, () => { throw Error('Invalid requests must not access DB'); });
  for (const handlers of Object.values(routes)) assert.equal(handlers[0], auth);
  const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await routes['GET /api/banhos/:kitinete'][1]({ params: { kitinete: 'superior' } }, res);
  assert.equal(res.code, 400);
  await routes['POST /api/banhos/:kitinete'][1]({ params: { kitinete: 'maior' }, body: { enabled: true, thresholdA: -1 } }, res);
  assert.equal(res.code, 400);
  await routes['GET /api/banhos-relatorio'][1]({ query: { inicio: 'invalid', fim: 'invalid' } }, res);
  assert.equal(res.code, 400);
});

test('report scopes by authenticated user and aggregates both kitinetes without active events', async () => {
  const routes = {}; let filter;
  const app = { get: (p, ...h) => { routes[p] = h.at(-1); }, post() {} };
  const rows = [{ kitinete: 'maior', seconds: 60, energyKwh: 0.1, energySeconds: 60, status: 'concluido' },
    { kitinete: 'menor', seconds: 30, energyKwh: 0, energySeconds: 0, status: 'interrompido' }];
  installRoutes(app, () => {}, () => ({ collection: () => ({ findOne: async () => ({ valorTotal: 200, consumoTotal: 100 }), find: q => { filter = q; return { sort: () => ({ toArray: async () => rows }) }; } }) }));
  let result;
  await routes['/api/banhos-relatorio']({ usuario: { email: 'only-me' }, query: { inicio: '2026-01-01', fim: '2026-02-01' } }, { json: r => { result = r; } });
  assert.equal(filter.usuario, 'only-me');
  assert.deepEqual(filter.status, { $ne: 'ativo' });
  assert.equal(result.totalKwh, 0.1);
  assert.equal(result.totals.menor.incomplete, 1);
  assert.equal(result.totals.maior.seconds, 60);
  assert.equal(result.tariff, 2);
  assert.equal(result.events[0].cost, 0.2);
  assert.equal(result.events[1].cost, null);
});

test('hourly usage splits intervals at hour boundaries and never ranks missing hours as minimum', () => {
  const { hourlyUsage } = require('./bath-monitor');
  const start = new Date('2026-01-01T03:00:00Z');
  const at = hours => new Date(+start + hours * 3600000);
  const hours = hourlyUsage([{ start, end: at(1), powerW: 1000 }, { start: at(1), end: at(2), powerW: 2000 },
    { start: at(2.99), end: at(3.01), powerW: 1000 }], start, at(4));
  assert.equal(hours[0].energyKwh, 1);
  assert.equal(hours[1].energyKwh, 2);
  assert.equal(hours[0].rank, 'menor');
  assert.equal(hours[1].rank, 'maior');
  assert.equal(hours[2].rank, null);
  assert.equal(hours[2].seconds, 36);
  assert.equal(hours[3].seconds, 36);
  assert.equal(hourlyUsage([], start, at(1))[0].energyKwh, null);
});

test('hourly Tuya readings calculate cost and highlight the highest period', () => {
  const start = new Date('2026-01-01T12:00:00Z');
  const hours = hourlyReadingUsage([
    { timestamp: +start - 3600000, kwh: 10 },
    { timestamp: +start + 1800000, kwh: 11 },
    { timestamp: +start + 3600000, kwh: 13 },
    { timestamp: +start + 5400000, kwh: 16 }
  ], start, new Date(+start + 2 * 3600000), 2.5);
  assert.equal(hours[0].energyKwh, 1);
  assert.equal(hours[0].cost, 2.5);
  assert.equal(hours[1].energyKwh, 3);
  assert.equal(hours[1].cost, 7.5);
  assert.equal(hours[1].rank, 'maior');
});

test('selected period total uses the accumulated readings around its boundaries', () => {
  const start = new Date('2026-01-01T12:00:00Z');
  const readings = [{ timestamp: +start - 1800000, kwh: 10 }, { timestamp: +start + 1800000, kwh: 11.5 }, { timestamp: +start + 2 * 3600000, kwh: 14 }];
  assert.equal(accumulatedReadingUsage(readings, start, new Date(+start + 2 * 3600000)), 4);
});

test('selected kitinete is applied in DB query and response; missing tariff is not zero', async () => {
  const routes = {}; let query;
  installRoutes({ get: (p, ...h) => { routes[p] = h.at(-1); }, post() {} }, () => {}, () => ({ collection: () => ({
    findOne: async () => null,
    find: q => { query = q; return { sort: () => ({ toArray: async () => [] }) }; }
  }) }));
  let result;
  await routes['/api/banhos-relatorio']({ usuario: { email: 'luiza' }, query: { kitinete: 'menor', inicio: '2026-01-01', fim: '2026-01-02' } }, { json: r => { result = r; } });
  assert.equal(query.kitinete, 'menor');
  assert.equal(query.usuario, 'luiza');
  assert.deepEqual(Object.keys(result.totals), ['menor']);
  assert.equal(result.tariff, null);
});
