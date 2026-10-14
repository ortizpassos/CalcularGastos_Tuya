const tuya = require('./tuya-client');
const { randomUUID } = require('node:crypto');
const INTERVAL = 10000;
const specs = new Map();
const CURRENT_CODE_HINTS = ['cur_current', 'current', 'electric_current', 'ele_current', 'current_a', 'current_ma', 'amps', 'amperage', 'ampere', 'rms_current'];
const POWER_CODE_HINTS = ['cur_power', 'power', 'active_power', 'electric_power', 'ele_power', 'power_w', 'watt'];

async function latestTariff(db, usuario) {
  const last = await db.collection('historicos').findOne({ usuario, tipo: 'luz',
    consumoTotal: { $gt: 0 }, valorTotal: { $gte: 0 } }, { sort: { _id: -1 } });
  const price = last ? Number(last.valorTotal) / Number(last.consumoTotal) : null;
  return price != null && Number.isFinite(price) ? price : null;
}

function hourlyUsage(segments, start, end) {
  const hours = [];
  for (let from = +start; from < +end; from += 3600000) {
    const to = Math.min(from + 3600000, +end);
    let seconds = 0, energyKwh = 0;
    for (const segment of segments) {
      const overlap = Math.max(0, Math.min(to, +new Date(segment.end)) - Math.max(from, +new Date(segment.start))) / 1000;
      if (overlap && Number.isFinite(segment.powerW)) { seconds += overlap; energyKwh += segment.powerW * overlap / 3600000; }
    }
    hours.push({ start: new Date(from), end: new Date(to), seconds, energyKwh: seconds > 0 ? energyKwh : null,
      complete: seconds >= (to - from) / 1000 * 0.9 });
  }
  const comparable = hours.filter(h => h.complete);
  const max = comparable.length >= 2 ? Math.max(...comparable.map(h => h.energyKwh)) : null;
  const min = comparable.length >= 2 ? Math.min(...comparable.map(h => h.energyKwh)) : null;
  return hours.map(h => ({ ...h, rank: !h.complete || max == null ? null : max === min ? 'igual'
    : h.energyKwh === max ? 'maior' : h.energyKwh === min ? 'menor' : null }));
}

function hourlyReadingUsage(readings, start, end, tariff) {
  const sorted = readings.map(reading => ({ ...reading, timestamp: Number(reading.timestamp), kwh: Number(reading.kwh) }))
    .filter(reading => Number.isFinite(reading.timestamp) && Number.isFinite(reading.kwh))
    .sort((a, b) => a.timestamp - b.timestamp);
  const hours = [];
  for (let from = +start; from < +end; from += 3600000) {
    const to = Math.min(from + 3600000, +end);
    const before = sorted.filter(reading => reading.timestamp <= from).pop();
    const last = sorted.filter(reading => reading.timestamp < to).pop();
    const energyKwh = before && last && last.timestamp > before.timestamp ? Math.max(0, last.kwh - before.kwh) : null;
    hours.push({ start: new Date(from), end: new Date(to), energyKwh,
      cost: energyKwh != null && tariff != null ? energyKwh * tariff : null });
  }
  const max = Math.max(...hours.filter(hour => hour.energyKwh != null).map(hour => hour.energyKwh), -1);
  return hours.map(hour => ({ ...hour, rank: hour.energyKwh != null && hour.energyKwh === max && max >= 0 ? 'maior' : null }));
}

function accumulatedReadingUsage(readings, start, end) {
  const sorted = readings.filter(reading => Number.isFinite(Number(reading.timestamp)) && Number.isFinite(Number(reading.kwh)))
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const first = sorted.filter(reading => Number(reading.timestamp) <= +start).pop();
  const last = sorted.filter(reading => Number(reading.timestamp) <= +end).pop();
  if (!first || !last || Number(last.timestamp) <= Number(first.timestamp)) return null;
  return Math.max(0, Number(last.kwh) - Number(first.kwh));
}

function measurement(status, specification, code, divisor, unit) {
  const item = status.find(item => item.code === code);
  // EARU phase frame: 2 bytes voltage, 3 bytes current (mA), 3 bytes power.
  // Only decode current here: power scaling varies between meter models.
  if (/^phase_[abc]$/.test(code) && unit === 'A') {
    if (typeof item?.value !== 'string' || !/^[A-Za-z0-9+/]{11}=$/.test(item.value)) return null;
    const frame = Buffer.from(item.value, 'base64');
    if (frame.length !== 8 || frame.toString('base64') !== item.value) return null;
    return frame.readUIntBE(2, 3) / 1000;
  }
  const raw = item && (typeof item.value === 'number' || (typeof item.value === 'string' && item.value.trim() !== '')) ? Number(item.value) : NaN;
  if (!item || !Number.isFinite(raw) || raw < 0) return null;
  const spec = (specification.status || []).find(item => item.code === code);
  let values;
  try { values = typeof spec?.values === 'string' ? JSON.parse(spec.values) : spec?.values; } catch { return null; }
  if (values && Number.isInteger(values.scale) && values.scale >= 0 && values.scale <= 9) {
    const factors = unit === 'A' ? { A: 1, mA: 0.001 } : { W: 1, kW: 1000 };
    const factor = factors[values.unit];
    if (factor != null) return raw / 10 ** values.scale * factor;
  }
  return divisor ? raw / divisor : null;
}

function findMeasurement(status, specification, configuredCode, divisor, unit, hints) {
  // Unit alone cannot identify circuit current: leakage_current also uses mA.
  const candidates = [configuredCode, ...hints, ...(unit === 'A' ? ['phase_a'] : [])].filter(Boolean);
  for (const code of [...new Set(candidates)]) {
    const value = measurement(status, specification, code, code === configuredCode ? divisor : null, unit);
    if (value != null) return value;
  }
  return null;
}

// Left-sample timing: the previous observation represents the following interval.
// A gap ends the event at its last known sample; unknown time is never integrated.
function advance(active, sample, config) {
  if (active) {
    const seconds = (sample.at - new Date(active.lastAt)) / 1000;
    if (seconds < 0 || seconds > 90) return { closed: { ...active, end: active.lastAt, status: 'interrompido' }, active: null, retry: true };
    // Confirm the ending without adding the idle confirmation window to the bath.
    if (active.belowSince && sample.at - new Date(active.belowSince) > 30000) {
      const { belowSince, belowSnapshot, ...event } = active;
      return { closed: { ...event, ...belowSnapshot, end: belowSince, lastAt: belowSince,
        status: 'concluido' }, active: null, retry: sample.currentA > active.thresholdA };
    }
    active = { ...active, seconds: active.seconds + seconds, lastAt: sample.at,
      peakA: Math.max(active.peakA, sample.currentA) };
    if (active.lastPowerW != null) {
      active.energyKwh += active.lastPowerW * seconds / 3600000;
      active.energySeconds += seconds;
    }
    active.lastPowerW = sample.powerW;
    if (sample.currentA < active.thresholdA) {
      if (!active.belowSince) {
        active.belowSince = sample.at;
        active.belowSnapshot = { seconds: active.seconds, energyKwh: active.energyKwh,
          energySeconds: active.energySeconds };
      }
    } else {
      active.belowSince = null;
      active.belowSnapshot = null;
    }
    return { active };
  }
  if (sample.currentA <= config.thresholdA) return { active: null };
  return { active: { _id: randomUUID(), usuario: config.usuario, kitinete: config.kitinete,
    deviceId: config.deviceId, revision: config.revision, thresholdA: config.thresholdA,
    start: sample.at, lastAt: sample.at, seconds: 0, energyKwh: 0, energySeconds: 0,
    peakA: sample.currentA, lastPowerW: sample.powerW, status: 'ativo' } };
}

async function telemetry(deviceId, config, diagnostics = false) {
  const info = await tuya.getDeviceInfo(deviceId);
  if (info.online !== true) throw new Error('Dispositivo offline ou sem confirmação de conectividade.');
  let specification = specs.get(deviceId);
  if (!specification || specification.expires < Date.now()) {
    specification = { value: await tuya.getDeviceSpecification(deviceId), expires: Date.now() + 3600000 };
    specs.set(deviceId, specification);
  }
  const status = await tuya.getDeviceStatus(deviceId);
  const currentA = findMeasurement(status, specification.value, config.currentCode, config.currentDivisor, 'A', CURRENT_CODE_HINTS);
  if (currentA == null) throw new Error(`Corrente indisponível: nenhum DP de corrente com escala válida. DPs recebidos: ${status.map(item => item.code).join(', ')}. DPs especificados: ${(specification.value.status || []).map(item => item.code).join(', ')}`);
  const details = diagnostics ? {
    configuredCode: config.currentCode || null,
    configuredDivisor: config.currentDivisor || null,
    readings: status.map(item => {
      const spec = (specification.value.status || []).find(entry => entry.code === item.code);
      let metadata = spec?.values;
      try { if (typeof metadata === 'string') metadata = JSON.parse(metadata); } catch { metadata = null; }
      return { code: item.code, rawValue: item.value, unit: metadata?.unit ?? null,
        scale: metadata?.scale ?? null,
        currentA: measurement(status, specification.value, item.code,
          item.code === config.currentCode ? config.currentDivisor : null, 'A') };
    })
  } : null;
  return { at: new Date(), currentA, ...(details ? { diagnostics: details } : {}),
    powerW: findMeasurement(status, specification.value, config.powerCode, config.powerDivisor, 'W', POWER_CODE_HINTS) };
}

async function startMonitor(db) {
  const configs = db.collection('bath_configs'), events = db.collection('bath_events');
  await configs.createIndex({ usuario: 1, kitinete: 1 }, { unique: true });
  await events.createIndex({ usuario: 1, kitinete: 1, start: -1 });
  await db.collection('power_intervals').createIndex({ usuario: 1, kitinete: 1, start: 1 });
  const previousSamples = new Map();
  const close = async (event, reason) => {
    await events.updateOne({ _id: event._id }, { $set: { status: 'interrompido', end: event.lastAt, reason } });
  };
  // No attempt to reconstruct time while the backend was stopped.
  for await (const event of events.find({ status: 'ativo' })) await close(event, 'Backend reiniciado');
  async function cycle() {
    try {
      for await (const config of configs.find({})) {
        let active = await events.findOne({ usuario: config.usuario, kitinete: config.kitinete, status: 'ativo' });
        const devices = await db.collection('tuya_config').findOne({ usuario: config.usuario });
        const deviceId = devices?.[config.kitinete === 'maior' ? 'pessoa1' : 'pessoa2']?.deviceId;
        if (active && (!config.enabled || active.revision !== config.revision || active.deviceId !== deviceId)) {
          await close(active, 'Configuração alterada ou monitor desativado'); active = null;
        }
        if (!config.enabled) continue;
        try {
          if (!deviceId) throw new Error('Configure o Device ID desta kitinete em Configurações.');
          const sample = await telemetry(deviceId, config);
          const key = `${config.usuario}:${config.kitinete}`;
          const previous = previousSamples.get(key);
          if (previous && previous.deviceId === deviceId && previous.revision === config.revision &&
              sample.at - previous.at > 0 && sample.at - previous.at <= 90000 && previous.powerW != null) {
            await db.collection('power_intervals').insertOne({ usuario: config.usuario, kitinete: config.kitinete,
              deviceId, start: previous.at, end: sample.at, powerW: previous.powerW });
          }
          previousSamples.set(key, { ...sample, deviceId, revision: config.revision });
          let result = advance(active, sample, { ...config, deviceId });
          if (result.closed) {
            await events.replaceOne({ _id: result.closed._id }, result.closed);
            if (result.retry) result = advance(null, sample, { ...config, deviceId });
          }
          if (result.active) await events.replaceOne({ _id: result.active._id }, result.active, { upsert: true });
          await configs.updateOne({ _id: config._id }, { $set: { sample, error: null, checkedAt: new Date() } });
        } catch (error) {
          previousSamples.delete(`${config.usuario}:${config.kitinete}`);
          if (active) await close(active, 'Falha de comunicação ou de medição');
          await configs.updateOne({ _id: config._id }, { $set: { error: error.message, checkedAt: new Date() } });
        }
      }
    } catch (error) { console.error('Monitor de banhos:', error.message); }
    finally { setTimeout(cycle, INTERVAL).unref(); }
  }
  void cycle();
}

function installRoutes(app, auth, getDb) {
  app.get('/api/banhos/:kitinete', auth, async (req, res) => {
    if (!['maior', 'menor'].includes(req.params.kitinete)) return res.status(400).json({ erro: 'Kitinete inválida.' });
    try {
      const query = { usuario: req.usuario.email, kitinete: req.params.kitinete };
      const db = getDb();
      const config = await db.collection('bath_configs').findOne(query);
      const active = await db.collection('bath_events').findOne({ ...query, status: 'ativo' });
      res.json({ config: config || { enabled: false, thresholdA: 16, currentCode: 'cur_current', powerCode: 'cur_power' }, active, intervalSeconds: 10 });
    } catch { res.status(500).json({ erro: 'Falha ao carregar monitor.' }); }
  });
  app.get('/api/banhos/:kitinete/leitura-atual', auth, async (req, res) => {
    if (!['maior', 'menor'].includes(req.params.kitinete)) return res.status(400).json({ erro: 'Kitinete inválida.' });
    try {
      const db = getDb();
      const query = { usuario: req.usuario.email, kitinete: req.params.kitinete };
      const config = await db.collection('bath_configs').findOne(query) || { currentCode: 'cur_current', powerCode: 'cur_power' };
      const devices = await db.collection('tuya_config').findOne({ usuario: req.usuario.email });
      const device = devices?.[req.params.kitinete === 'maior' ? 'pessoa1' : 'pessoa2'];
      if (!device?.deviceId) return res.status(400).json({ erro: 'Configure o dispositivo desta kitinete.' });
      const sample = await telemetry(device.deviceId, config, req.query?.diagnostico === '1');
      res.json(sample);
    } catch (error) { res.status(502).json({ erro: error.message }); }
  });
  app.post('/api/banhos/:kitinete', auth, async (req, res) => {
    const b = req.body;
    if (!['maior', 'menor'].includes(req.params.kitinete) || typeof b.enabled !== 'boolean' ||
        typeof b.thresholdA !== 'number' || !Number.isFinite(b.thresholdA) || b.thresholdA <= 0 || b.thresholdA > 1000 ||
        ![b.currentCode, b.powerCode].every(v => typeof v === 'string' && /^[\w-]{1,80}$/.test(v)) ||
        ![b.currentDivisor, b.powerDivisor].every(v => v == null || (typeof v === 'number' && Number.isFinite(v) && v > 0))) {
      return res.status(400).json({ erro: 'Confira limite, códigos DP e divisores positivos.' });
    }
    try {
      await getDb().collection('bath_configs').updateOne({ usuario: req.usuario.email, kitinete: req.params.kitinete },
        { $set: { enabled: b.enabled, thresholdA: b.thresholdA, currentCode: b.currentCode, powerCode: b.powerCode,
          currentDivisor: b.currentDivisor || null, powerDivisor: b.powerDivisor || null, revision: randomUUID() } }, { upsert: true });
      res.json({ mensagem: 'Configuração salva. Será aplicada no próximo ciclo do monitor.' });
    } catch { res.status(500).json({ erro: 'Falha ao salvar monitor.' }); }
  });
  app.get('/api/banhos-relatorio', auth, async (req, res) => {
    const start = new Date(req.query.inicio), end = new Date(req.query.fim);
    if ((req.query.kitinete && !['maior', 'menor'].includes(req.query.kitinete)) || !Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end - start > 366 * 86400000) {
      return res.status(400).json({ erro: 'Informe um período válido de até 366 dias.' });
    }
    try {
      let history = null;
      if (req.query.fonte === 'tuya') {
        if (!req.query.kitinete) return res.status(400).json({ erro: 'Selecione a kitinete para consultar logs Tuya.' });
        const limit = req.query.thresholdA == null ? undefined : Number(req.query.thresholdA);
        if (limit != null && (!Number.isFinite(limit) || limit <= 0 || limit > 1000)) return res.status(400).json({ erro: 'Limite de corrente inválido.' });
        history = await require('./bath-history').historicalBaths(getDb(), req.usuario.email, req.query.kitinete, start, end, limit);
      }
      const events = history ? history.events.sort((a, b) => +new Date(b.start) - +new Date(a.start)) : await getDb().collection('bath_events').find({ usuario: req.usuario.email,
        ...(req.query.kitinete ? { kitinete: req.query.kitinete } : {}),
        start: { $gte: start, $lt: end }, status: { $ne: 'ativo' } }).sort({ start: -1 }).toArray();
      const totals = {};
      for (const key of ['maior', 'menor']) {
        const rows = events.filter(e => e.kitinete === key);
        totals[key] = { count: rows.length, seconds: rows.reduce((s,e) => s + e.seconds, 0),
          energyKwh: rows.reduce((s,e) => s + e.energyKwh, 0),
          incomplete: rows.filter(e => e.status !== 'concluido' || e.energySeconds < e.seconds || e.seconds === 0).length };
      }
      const tariff = await latestTariff(getDb(), req.usuario.email);
      res.json({ events: events.map(e => ({ ...e, cost: tariff != null && e.energySeconds > 0 ? e.energyKwh * tariff : null })),
        source: history ? 'tuya' : 'monitor', currentLogCount: history?.currentLogCount,
        thresholdA: history?.thresholdA,
        energyWarning: history?.energyWarning,
        tariff, totals: req.query.kitinete ? { [req.query.kitinete]: totals[req.query.kitinete] } : totals,
        totalKwh: totals.maior.energyKwh + totals.menor.energyKwh });
    } catch (error) { res.status(500).json({ erro: `Falha ao gerar relatório: ${error.message}` }); }
  });
  app.get('/api/consumo-dia/:kitinete', auth, async (req, res) => {
    const start = new Date(req.query.inicio), end = new Date(req.query.fim);
    const totalStart = req.query.totalInicio ? new Date(req.query.totalInicio) : start;
    const totalEnd = req.query.totalFim ? new Date(req.query.totalFim) : end;
    if (!['maior', 'menor'].includes(req.params.kitinete) || !Number.isFinite(+start) || !Number.isFinite(+end) ||
      end <= start || end - start > 25 * 3600000 || !Number.isFinite(+totalStart) || !Number.isFinite(+totalEnd) || totalEnd <= totalStart || totalEnd - totalStart > 25 * 3600000) return res.status(400).json({ erro: 'Dia ou kitinete inválido.' });
    try {
      const db = getDb();
      const config = await db.collection('tuya_config').findOne({ usuario: req.usuario.email });
      const device = config?.[req.params.kitinete === 'maior' ? 'pessoa1' : 'pessoa2'];
      if (!device?.deviceId) return res.status(400).json({ erro: 'Configure o dispositivo desta kitinete.' });
      const readingsWithReference = await tuya.readEnergyLogs(device.deviceId, new Date(Math.min(+start, +totalStart) - 3600000), new Date(Math.max(+end, +totalEnd)), device);
      const readings = readingsWithReference.filter(reading => reading.timestamp >= +start && reading.timestamp <= +end);
      const tariff = await latestTariff(db, req.usuario.email);
      const periodKwh = accumulatedReadingUsage(readingsWithReference, start, end);
      const totalKwh = accumulatedReadingUsage(readingsWithReference, totalStart, totalEnd);
      res.json({ tariff, readings, periodKwh, periodCost: periodKwh != null && tariff != null ? periodKwh * tariff : null, totalKwh, totalCost: totalKwh != null && tariff != null ? totalKwh * tariff : null, hours: hourlyReadingUsage(readingsWithReference, start, end, tariff) });
    } catch { res.status(500).json({ erro: 'Falha ao consultar consumo diário.' }); }
  });
}

module.exports = { CURRENT_CODE_HINTS, measurement, findMeasurement, advance, startMonitor, installRoutes, hourlyUsage, hourlyReadingUsage, accumulatedReadingUsage, latestTariff };
