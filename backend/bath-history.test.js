const test = require('node:test');
const assert = require('node:assert/strict');
const { reconstruct, energyAt } = require('./bath-history');
const config = { thresholdA: 16, currentCode: 'cur_current', kitinete: 'maior' };
function log(seconds, amps) {
  const frame = Buffer.alloc(8);
  frame.writeUIntBE(amps * 1000, 2, 3);
  return { code: 'phase_a', timestamp: seconds * 1000, value: frame.toString('base64') };
}
function electricalLog(seconds, amps, voltage) {
  const entry = log(seconds, amps);
  const frame = Buffer.from(entry.value, 'base64');
  frame.writeUIntBE(Math.round(voltage * 10), 0, 2);
  return { ...entry, value: frame.toString('base64') };
}

test('voltage and current integrate each bath interval, excluding final confirmation', () => {
  const events = reconstruct([electricalLog(0, 20, 220), electricalLog(30, 25, 230),
    electricalLog(60, 0, 220), electricalLog(91, 0, 220)], {}, 'phase_a', config, [], new Date(0), new Date(100000));
  assert.equal(events.length, 1);
  assert.equal(events[0].seconds, 60);
  assert.equal(events[0].energySeconds, 60);
  assert.equal(events[0].energyMethod, 'voltage_current');
  assert.equal(events[0].assumedPowerFactor, 1);
  assert.ok(Math.abs(events[0].energyKwh - (220 * 20 * 30 + 230 * 25 * 30) / 3600000) < 1e-10);
});

test('EARU voltage decode and partial voltage coverage never invent missing energy', () => {
  const { measurement } = require('./bath-monitor');
  assert.equal(measurement([{ code: 'phase_a', value: 'CFEABN0AAKc=' }], {}, 'phase_a', null, 'V'), 212.9);
  const events = reconstruct([electricalLog(0, 20, 220), log(30, 25), log(60, 0), log(91, 0)], {}, 'phase_a', config, [], new Date(0), new Date(100000));
  assert.equal(events[0].energySeconds, 30);
  assert.equal(events[0].seconds, 60);
  assert.ok(Math.abs(events[0].energyKwh - 220 * 20 * 30 / 3600000) < 1e-10);
});
test('historical phase_a detects selected threshold, duration and cumulative energy', () => {
  const events = reconstruct([log(0, 16), log(10, 17), log(40, 20), log(70, 15), log(101, 15)], {}, 'phase_a', config,
    [{ timestamp: 10000, kwh: 100 }, { timestamp: 70000, kwh: 100.1 }], new Date(0), new Date(110000));
  assert.equal(events.length, 1);
  assert.equal(+events[0].start, 10000);
  assert.equal(+events[0].end, 70000);
  assert.equal(events[0].seconds, 60);
  assert.equal(events[0].peakA, 20);
  assert.equal(events[0].status, 'concluido');
  assert.ok(Math.abs(events[0].energyKwh - 0.1) < 1e-10);
  assert.equal(reconstruct([log(10, 17), log(40, 20)], {}, 'phase_a', { ...config, thresholdA: 21 }, [], new Date(0), new Date(80000)).length, 0);
});
test('gaps and missing ending are interrupted and missing energy stays null', () => {
  const events = reconstruct([log(10, 17), log(40, 18), log(200, 20), log(230, 21)], {}, 'phase_a', config, [], new Date(0), new Date(300000));
  assert.equal(events.length, 2);
  assert.ok(events.every(e => e.status === 'interrompido' && e.seconds === 30 && e.energyKwh === null));
});

test('history groups short dips and excludes the final 30 second confirmation', () => {
  const events = reconstruct([log(0, 20), log(10, 15), log(30, 20), log(40, 15), log(70, 15), log(71, 15)],
    {}, 'phase_a', config, [{ timestamp: 0, kwh: 10 }, { timestamp: 40000, kwh: 10.1 }, { timestamp: 71000, kwh: 10.2 }], new Date(0), new Date(80000));
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'concluido');
  assert.equal(events[0].seconds, 40);
  assert.equal(+events[0].end, 40000);
  assert.ok(Math.abs(events[0].energyKwh - 0.1) < 1e-10);
});
test('energy interpolation rejects sparse readings and meter resets', () => {
  assert.equal(energyAt([{ timestamp: 0, kwh: 10 }, { timestamp: 60000, kwh: 12 }], 30000), 11);
  assert.equal(energyAt([{ timestamp: 0, kwh: 10 }, { timestamp: 180000, kwh: 12 }], 30000), null);
  assert.equal(energyAt([{ timestamp: 0, kwh: 10 }, { timestamp: 60000, kwh: 0 }], 30000), null);
  const events = reconstruct([log(10, 17), log(40, 18), log(70, 0)], {}, 'phase_a', config,
    [{ timestamp: 10000, kwh: 1 }, { timestamp: 40000, kwh: 0 }, { timestamp: 70000, kwh: 2 }], new Date(0), new Date(80000));
  assert.equal(events[0].energyKwh, null);
});
test('historical route scopes device and threshold to authenticated user', async () => {
  const tuya = require('./tuya-client');
  const { installRoutes } = require('./bath-monitor');
  const originals = { getDeviceSpecification: tuya.getDeviceSpecification, readStatusLogs: tuya.readStatusLogs, readEnergyLogs: tuya.readEnergyLogs };
  const routes = {}, queries = [];
  tuya.getDeviceSpecification = async id => { assert.equal(id, 'resident-device'); return { status: [{ code: 'phase_a' }] }; };
  tuya.readStatusLogs = async (id, start, end, codes) => { assert.deepEqual(codes, ['phase_a']); return [log(10, 17), log(40, 0)]; };
  tuya.readEnergyLogs = async () => [{ timestamp: 10000, kwh: 1 }, { timestamp: 40000, kwh: 1.05 }];
  const db = { collection: name => ({ findOne: async query => {
    queries.push(query);
    return name === 'bath_configs' ? config : name === 'tuya_config' ? { pessoa2: { deviceId: 'resident-device' } } : { consumoTotal: 100, valorTotal: 80 };
  } }) };
  try {
    installRoutes({ get: (p, ...h) => { routes[p] = h.at(-1); }, post() {} }, () => {}, () => db);
    let result;
    await routes['/api/banhos-relatorio']({ usuario: { email: 'resident' }, query: { fonte: 'tuya', kitinete: 'menor', inicio: new Date(0).toISOString(), fim: new Date(60000).toISOString() } }, { json: value => { result = value; } });
    assert.equal(result.source, 'tuya');
    assert.equal(result.events[0].kitinete, 'menor');
    assert.equal(result.events[0].seconds, 30);
    assert.ok(result.events[0].cost > 0);
    assert.ok(queries.every(q => q.usuario === 'resident'));
    await routes['/api/banhos-relatorio']({ usuario: { email: 'resident' }, query: { fonte: 'tuya', thresholdA: '18', kitinete: 'menor', inicio: new Date(0).toISOString(), fim: new Date(60000).toISOString() } }, { json: value => { result = value; } });
    assert.equal(result.thresholdA, 18);
    assert.equal(result.events.length, 0);
    let status;
    await routes['/api/banhos-relatorio']({ usuario: { email: 'resident' }, query: { fonte: 'tuya', thresholdA: 'invalid', kitinete: 'menor', inicio: new Date(0).toISOString(), fim: new Date(60000).toISOString() } }, { status: code => { status = code; return { json() {} }; } });
    assert.equal(status, 400);
  } finally { Object.assign(tuya, originals); }
});
