const tuya = require('./tuya-client');
const { CURRENT_CODE_HINTS, measurement, advance } = require('./bath-monitor');

// Interpolate only between nearby cumulative readings, never across a reset.
function energyAt(readings, time) {
  const before = readings.filter(r => r.timestamp <= time).at(-1);
  if (before?.timestamp === time) return before.kwh;
  const after = readings.find(r => r.timestamp > time);
  if (!before || !after || after.timestamp - before.timestamp > 90000 || after.kwh < before.kwh) return null;
  return before.kwh + (after.kwh - before.kwh) * (time - before.timestamp) / (after.timestamp - before.timestamp);
}

function reconstruct(logs, specification, code, config, readings, start, end) {
  let active = null;
  const events = [];
  for (const log of logs) {
    if (log.timestamp < +start || log.timestamp >= +end || log.code !== code) continue;
    const currentA = measurement([{ code, value: log.value }], specification, code,
      code === config.currentCode ? config.currentDivisor : null, 'A');
    if (currentA == null) {
      if (active) events.push({ ...active, end: active.lastAt, status: 'interrompido', reason: 'Leitura histórica inválida' });
      active = null;
      continue;
    }
    const sample = { at: new Date(log.timestamp), currentA, powerW: null };
    let result = advance(active, sample, config);
    if (result.closed) {
      events.push({ ...result.closed, reason: result.retry ? 'Intervalo sem dados de corrente' : null });
      if (result.retry) result = advance(null, sample, config);
    }
    active = result.active;
  }
  if (active) events.push({ ...active, end: active.lastAt, status: 'interrompido', reason: 'Sem confirmação do fim nos logs consultados' });
  return events.map(event => {
    const first = energyAt(readings, +event.start), last = energyAt(readings, +new Date(event.end));
    const reset = readings.some((r, index) => index > 0 && r.timestamp > +event.start && r.timestamp <= +new Date(event.end) && r.kwh < readings[index - 1].kwh);
    const available = event.seconds > 0 && first != null && last != null && last >= first && !reset;
    return { ...event, source: 'tuya', energyKwh: available ? last - first : null,
      energySeconds: available ? event.seconds : 0 };
  });
}

async function historicalBaths(db, usuario, kitinete, start, end, thresholdA) {
  const config = await db.collection('bath_configs').findOne({ usuario, kitinete }) || { thresholdA: 16, currentCode: 'cur_current' };
  if (thresholdA != null) config.thresholdA = thresholdA;
  const devices = await db.collection('tuya_config').findOne({ usuario });
  const device = devices?.[kitinete === 'maior' ? 'pessoa1' : 'pessoa2'];
  if (!device?.deviceId) throw new Error('Configure o dispositivo desta kitinete.');
  const specification = await tuya.getDeviceSpecification(device.deviceId);
  const specs = specification.status || [];
  const candidates = [...new Set([config.currentCode, ...CURRENT_CODE_HINTS, 'phase_a'].filter(Boolean))];
  const code = candidates.find(code => specs.some(item => item.code === code));
  if (!code) throw new Error('DP histórico de corrente não identificado.');
  const logs = await tuya.readStatusLogs(device.deviceId, start, end, [code]);
  let readings = [], energyWarning = null;
  try { readings = await tuya.readEnergyLogs(device.deviceId, new Date(+start - 90000), new Date(+end + 90000), device); }
  catch (error) { energyWarning = error.message; }
  return { events: reconstruct(logs, specification, code, { ...config, usuario, kitinete, deviceId: device.deviceId }, readings, start, end),
    energyWarning, currentLogCount: logs.length, thresholdA: config.thresholdA };
}

module.exports = { historicalBaths, reconstruct, energyAt };
