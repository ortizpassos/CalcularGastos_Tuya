require('./load-env');
const axios = require('axios');
const crypto = require('crypto');

const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const BASE_URL = (process.env.TUYA_BASE_URL || 'https://openapi.tuyaus.com').replace(/\/$/, '');

let tokenCache = { accessToken: null, expireAt: 0 };

function assertConfigured() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Configure TUYA_CLIENT_ID e TUYA_CLIENT_SECRET no servidor.');
  }
}

function sha256(value = '') {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(value) {
  return crypto.createHmac('sha256', CLIENT_SECRET).update(value).digest('hex').toUpperCase();
}

function buildSignature({ method, pathWithQuery, body = '', accessToken = '' }) {
  const t = Date.now().toString();
  const contentHash = sha256(body);
  const stringToSign = `${method.toUpperCase()}\n${contentHash}\n\n${pathWithQuery}`;
  const signStr = `${CLIENT_ID}${accessToken}${t}${stringToSign}`;
  return { t, sign: hmac(signStr) };
}

async function rawRequest(method, pathWithQuery, { body, accessToken = '' } = {}) {
  assertConfigured();
  // Tuya exige ordem alfabética das chaves. Preserve a codificação dos valores
  // e use exatamente o mesmo caminho para assinar e enviar a requisição.
  const question = pathWithQuery.indexOf('?');
  if (question !== -1) {
    const path = pathWithQuery.slice(0, question);
    const parameters = pathWithQuery.slice(question + 1).split('&').filter(Boolean);
    const key = parameter => decodeURIComponent(parameter.split('=')[0].replace(/\+/g, ' '));
    parameters.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
    pathWithQuery = path + (parameters.length ? '?' + parameters.join('&') : '');
  }
  const bodyText = body == null ? '' : JSON.stringify(body);
  const { t, sign } = buildSignature({ method, pathWithQuery, body: bodyText, accessToken });
  const headers = {
    client_id: CLIENT_ID,
    t,
    sign,
    sign_method: 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };
  if (accessToken) headers.access_token = accessToken;

  const response = await axios({
    method,
    url: `${BASE_URL}${pathWithQuery}`,
    headers,
    data: body == null ? undefined : body,
    timeout: 15000,
    validateStatus: () => true
  });

  const data = response.data || {};
  if (response.status >= 400 || data.success === false) {
    const code = data.code ? ` [${data.code}]` : '';
    throw new Error(`Tuya HTTP ${response.status}${code}: ${data.msg || JSON.stringify(data)}`);
  }
  return data;
}

async function fetchToken(force = false) {
  assertConfigured();
  if (!force && tokenCache.accessToken && tokenCache.expireAt > Date.now() + 60000) {
    return tokenCache.accessToken;
  }
  const data = await rawRequest('GET', '/v1.0/token?grant_type=1');
  if (!data.result?.access_token) throw new Error('A Tuya não retornou access_token.');
  tokenCache = {
    accessToken: data.result.access_token,
    expireAt: Date.now() + Number(data.result.expire_time || 3600) * 1000
  };
  return tokenCache.accessToken;
}

async function request(method, pathWithQuery, options = {}) {
  let token = await fetchToken();
  try {
    return await rawRequest(method, pathWithQuery, { ...options, accessToken: token });
  } catch (err) {
    if (/token|1010|1011|1012/i.test(err.message)) {
      token = await fetchToken(true);
      return rawRequest(method, pathWithQuery, { ...options, accessToken: token });
    }
    throw err;
  }
}

async function getDeviceStatus(deviceId) {
  const data = await request('GET', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/status`);
  return data.result || [];
}

async function getDeviceSpecification(deviceId) {
  const data = await request('GET', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/specification`);
  return data.result || {};
}

// Códigos encontrados com frequência em medidores/disjuntores Tuya. O usuário pode
// sobrescrever o código e o divisor na configuração para qualquer modelo específico.
const ENERGY_CODE_HINTS = [
  'add_ele', 'total_energy', 'energy_total', 'forward_energy_total',
  'electricity_total', 'energy', 'ele_energy', 'total_forward_energy'
];

function parseValues(values) {
  if (!values) return {};
  if (typeof values === 'object') return values;
  try { return JSON.parse(values); } catch { return {}; }
}

function inferDivisor(specItem, rawValue, configuredDivisor) {
  if (Number(configuredDivisor) > 0) return Number(configuredDivisor);
  const values = parseValues(specItem?.values);
  const scale = Number(values.scale);
  if (Number.isFinite(scale) && scale >= 0 && scale <= 6) return 10 ** scale;
  // add_ele tradicionalmente é reportado em 0,01 kWh quando não há metadata útil.
  if (specItem?.code === 'add_ele') return 100;
  return 1;
}

async function readEnergyKwh(deviceId, options = {}) {
  if (!deviceId) throw new Error('Device ID não configurado.');
  const [status, specification] = await Promise.all([
    getDeviceStatus(deviceId),
    getDeviceSpecification(deviceId).catch(() => ({}))
  ]);
  const statusSpecs = Array.isArray(specification.status) ? specification.status : [];
  const configuredCode = String(options.dpCode || '').trim();
  const candidates = configuredCode
    ? [configuredCode]
    : ENERGY_CODE_HINTS;

  let item = null;
  for (const code of candidates) {
    item = status.find(s => s.code === code && Number.isFinite(Number(s.value)));
    if (item) break;
  }
  if (!item) {
    item = status.find(s => /(^|_)(energy|ele)(_|$)|electric/i.test(s.code) && Number.isFinite(Number(s.value)));
  }
  if (!item) {
    throw new Error(`DP de energia não identificado no dispositivo ${deviceId}. Códigos recebidos: ${status.map(s => s.code).join(', ')}`);
  }

  const specItem = statusSpecs.find(s => s.code === item.code);
  const divisor = inferDivisor(specItem, item.value, options.divisor);
  const raw = Number(item.value);
  const kwh = raw / divisor;
  if (!Number.isFinite(kwh) || kwh < 0) throw new Error(`Valor de energia inválido no DP ${item.code}.`);

  return { deviceId, dpCode: item.code, rawValue: raw, divisor, kwh, status };
}

module.exports = {
  readEnergyAt,
  getDeviceInfo: async deviceId => (await request('GET', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}`)).result || {},
  fetchToken,
  getDeviceStatus,
  getDeviceSpecification,
  readEnergyKwh
};

async function readEnergyAt(deviceId, at, options = {}) {
  const specification = await getDeviceSpecification(deviceId);
  const statusSpecs = specification.status || [];
  const code = options.dpCode || ENERGY_CODE_HINTS.find(code => statusSpecs.some(s => s.code === code));
  if (!code) throw new Error('Configure o DP de energia do dispositivo para consultar o histórico.');
  const spec = statusSpecs.find(s => s.code === code);
  const meta = parseValues(spec?.values);
  if (!options.divisor && !Number.isInteger(meta.scale)) throw new Error('Configure o divisor de energia: escala histórica indisponível.');
  const divisor = inferDivisor(spec, 0, options.divisor);
  const start = at - 86400000;
  let cursor = '', latest = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ codes: code, start_time: String(start), end_time: String(at), size: '100' });
    if (cursor) query.set('last_row_key', cursor);
    const response = await request('GET', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/report-logs?${query}`);
    const result = response.result || {};
    for (const log of result.list || result.logs || []) {
      const timestamp = Number(log.event_time);
      const validValue = typeof log.value === 'number' || (typeof log.value === 'string' && log.value.trim() !== '');
      const value = Number(log.value);
      if (log.code === code && validValue && Number.isFinite(value) && value >= 0 && timestamp >= start && timestamp <= at && (!latest || timestamp > latest.timestamp)) {
        latest = { timestamp, kwh: value / divisor, dpCode: code };
      }
    }
    if (!(result.has_more || result.has_next)) {
      if (!latest) throw new Error('Nenhuma leitura de energia nas 24 horas anteriores à data informada. O histórico pode não estar disponível na Tuya.');
      return latest;
    }
    if (!result.last_row_key || result.last_row_key === cursor) break;
    cursor = result.last_row_key;
  }
  throw new Error('Histórico extenso ou paginação incompleta. Não foi possível confirmar a leitura.');
}
