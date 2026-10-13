require('./load-env');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'segredo_super_secreto';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Tuya client (optional). Configure TUYA_CLIENT_ID and TUYA_CLIENT_SECRET in env.
const tuya = require('./tuya-client');

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Caminhos dos arquivos JSON para persistência simples (exceto leituras_luz, agora em MySQL)
const ARQUIVO_HISTORICO_LUZ = path.join(__dirname, 'historico_luz.json');
const ARQUIVO_LEITURAS_AGUA = path.join(__dirname, 'leituras_agua.json');
const ARQUIVO_HISTORICO_AGUA = path.join(__dirname, 'historico_agua.json');

// Banco de dados MongoDB
const mongo = require('./mongo');

// Middleware de autenticação JWT
function autenticarJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ erro: 'Token não fornecido.' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}
function lerArquivo(filePath) {
  try {
app.get('/api/:tipo/resultado', autenticarJWT, async (req, res) => {
  const { tipo } = req.params;
  if (tipo !== 'luz' && tipo !== 'agua') {
    return res.status(400).json({ erro: 'Tipo inválido' });
  }
  try {
    const db = mongo.getDb();
    const doc = await db.collection('resultados').find({ tipo, usuario: req.usuario.email }).sort({ data: -1 }).limit(1).toArray();
    if (!doc || doc.length === 0) return res.json({ resultado: null, data: null });
    res.json({ resultado: doc[0].resultado, data: doc[0].data });
  } catch (err) {
    console.error('Erro ao buscar resultado:', err);
    res.status(500).json({ erro: 'Erro ao buscar resultado no banco de dados' });
  }
});
    if (!fs.existsSync(filePath)) return null;
    const dados = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(dados);
  } catch (err) {
    console.error('Erro ao ler arquivo', filePath, err);
    return null;
  }
}

function salvarArquivo(filePath, dados) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(dados, null, 2));
    return true;
  } catch (err) {
    console.error('Erro ao salvar arquivo', filePath, err);
    return false;
  }
}

// --- ROTAS LUZ ---
// --- ROTAS AUTENTICAÇÃO ---
app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios.' });
  try {
    const db = mongo.getDb();
    const usuario = await db.collection('usuarios').findOne({ email });
    if (!usuario) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    const ok = await bcrypt.compare(senha, usuario.senha);
    if (!ok) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    const token = jwt.sign({ email: usuario.email }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  } catch (err) {
    console.error('Erro ao fazer login:', err);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});
app.post('/api/cadastro', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios.' });
  try {
    const db = mongo.getDb();
    const existente = await db.collection('usuarios').findOne({ email });
    if (existente) return res.status(400).json({ erro: 'E-mail já cadastrado.' });
    const hash = await bcrypt.hash(senha, 10);
    await db.collection('usuarios').insertOne({ email, senha: hash });
    res.json({ mensagem: 'Usuário cadastrado com sucesso' });
  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    res.status(500).json({ erro: 'Erro ao cadastrar usuário' });
  }
});

// Leituras anteriores luz (GET/POST) - tabela unificada
app.get('/api/luz/leituras', autenticarJWT, async (req, res) => {
  try {
    const db = mongo.getDb();
    const docs = await db.collection('leituras').find({ tipo: 'luz', usuario: req.usuario.email }).sort({ data: -1 }).limit(1).toArray();
    if (!docs || docs.length === 0) return res.json({ karina: 0, luiza: 0, data: null });
    const d = docs[0];
    res.json({ karina: d.karina, luiza: d.luiza, data: d.data });
  } catch (err) {
    console.error('Erro ao buscar leituras luz:', err);
    res.status(500).json({ erro: 'Erro ao buscar leituras luz do banco de dados' });
  }
});

app.post('/api/luz/leituras', autenticarJWT, async (req, res) => {
  const { karina, luiza, data } = req.body;
  if (typeof karina !== 'number' || typeof luiza !== 'number') {
    return res.status(400).json({ erro: 'Dados inválidos: karina e luiza devem ser números' });
  }
  try {
    const db = mongo.getDb();
    await db.collection('leituras').insertOne({ tipo: 'luz', usuario: req.usuario.email, karina, luiza, data: data ? new Date(data) : new Date() });
    res.json({ mensagem: 'Leituras anteriores luz salvas com sucesso' });
  } catch (err) {
    console.error('Erro ao salvar leituras luz:', err);
    res.status(500).json({ erro: 'Erro ao salvar leituras luz no banco de dados' });
  }
});
app.get('/api/agua/leituras', autenticarJWT, async (req, res) => {
  try {
    const db = mongo.getDb();
    const docs = await db.collection('leituras').find({ tipo: 'agua', usuario: req.usuario.email }).sort({ data: -1 }).limit(1).toArray();
    if (!docs || docs.length === 0) return res.json({ karina: 0, luiza: 0, data: null });
    const d = docs[0];
    res.json({ karina: d.karina, luiza: d.luiza, data: d.data });
  } catch (err) {
    console.error('Erro ao buscar leituras agua:', err);
    res.status(500).json({ erro: 'Erro ao buscar leituras agua do banco de dados' });
  }
});
// Rota para checar senha do usuário autenticado
app.post('/api/usuario/verificar-senha', autenticarJWT, async (req, res) => {
  const { senha } = req.body;
  if (!senha) return res.status(400).json({ erro: 'Senha obrigatória.' });
  try {
    const db = mongo.getDb();
    const usuario = await db.collection('usuarios').findOne({ email: req.usuario.email });
    if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado.' });
    const ok = await bcrypt.compare(senha, usuario.senha);
    if (!ok) return res.status(401).json({ erro: 'Senha incorreta.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao verificar senha:', err);
    res.status(500).json({ erro: 'Erro ao verificar senha' });
  }
});

app.post('/api/agua/leituras', autenticarJWT, async (req, res) => {
  const { karina, luiza, data } = req.body;
  if (typeof karina !== 'number' || typeof luiza !== 'number') {
    return res.status(400).json({ erro: 'Dados inválidos: karina e luiza devem ser números' });
  }
  try {
    const db = mongo.getDb();
    await db.collection('leituras').insertOne({ tipo: 'agua', usuario: req.usuario.email, karina, luiza, data: data ? new Date(data) : new Date() });
    res.json({ mensagem: 'Leituras anteriores agua salvas com sucesso' });
  } catch (err) {
    console.error('Erro ao salvar leituras agua:', err);
    res.status(500).json({ erro: 'Erro ao salvar leituras agua no banco de dados' });
  }
});

app.get('/api/luz/historico', autenticarJWT, async (req, res) => {
  try {
    const db = mongo.getDb();
    const rows = await db.collection('historicos').find({ tipo: 'luz', usuario: req.usuario.email }).sort({ data: -1 }).limit(100).toArray();
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar histórico luz:', err);
    res.status(500).json({ erro: 'Erro ao buscar histórico luz do banco de dados' });
  }
});

// 4. Adicionar ao histórico luz (POST) - agora via MySQL
app.post('/api/luz/historico', autenticarJWT, async (req, res) => {
  const entrada = req.body;
  if (!entrada || !entrada.nome || typeof entrada.consumo !== 'number' || typeof entrada.valor !== 'number') {
    return res.status(400).json({ erro: 'Dados de histórico inválidos' });
  }
  try {
    const db = mongo.getDb();
    await db.collection('historicos').insertOne({
      tipo: 'luz',
      usuario: req.usuario.email,
      nome: entrada.nome,
      consumo: entrada.consumo,
      valor: entrada.valor,
      data: entrada.data ? new Date(entrada.data) : new Date(),
      consumoTotal: typeof entrada.consumoTotal === 'number' ? entrada.consumoTotal : undefined,
      valorTotal: typeof entrada.valorTotal === 'number' ? entrada.valorTotal : undefined
    });
    res.json({ mensagem: 'Entrada adicionada ao histórico luz' });
  } catch (err) {
    console.error('Erro ao salvar histórico luz:', err);
    res.status(500).json({ erro: 'Erro ao salvar histórico luz no banco de dados' });
  }
});

// --- ROTAS AGUA ---

// 1. Leituras anteriores agua (GET)
app.get('/api/agua/leituras', (req, res) => {
  const leituras = lerArquivo(ARQUIVO_LEITURAS_AGUA) || {};
  res.json(leituras);
});

// 2. Salvar leituras anteriores agua (POST)
app.post('/api/agua/leituras', (req, res) => {
  const { karina, david } = req.body;
  if (typeof karina !== 'number' || typeof david !== 'number') {
    return res.status(400).json({ erro: 'Dados inválidos: karina e david devem ser números' });
  }
  salvarArquivo(ARQUIVO_LEITURAS_AGUA, { karina, david });
  res.json({ mensagem: 'Leituras anteriores água salvas com sucesso' });
});

app.get('/api/agua/historico', autenticarJWT, async (req, res) => {
  try {
    const db = mongo.getDb();
    const rows = await db.collection('historicos').find({ tipo: 'agua', usuario: req.usuario.email }).sort({ data: -1 }).limit(100).toArray();
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar histórico agua:', err);
    res.status(500).json({ erro: 'Erro ao buscar histórico agua do banco de dados' });
  }
});

// 4. Adicionar ao histórico agua (POST) - agora via MySQL
app.post('/api/agua/historico', autenticarJWT, async (req, res) => {
  const entrada = req.body;
  if (!entrada || !entrada.nome || typeof entrada.consumo !== 'number' || typeof entrada.valor !== 'number') {
    return res.status(400).json({ erro: 'Dados de histórico inválidos' });
  }
  try {
    const db = mongo.getDb();
    await db.collection('historicos').insertOne({
      tipo: 'agua',
      usuario: req.usuario.email,
      nome: entrada.nome,
      consumo: entrada.consumo,
      valor: entrada.valor,
      data: entrada.data ? new Date(entrada.data) : new Date(),
      consumoTotal: typeof entrada.consumoTotal === 'number' ? entrada.consumoTotal : undefined,
      valorTotal: typeof entrada.valorTotal === 'number' ? entrada.valorTotal : undefined
    });
    res.json({ mensagem: 'Entrada adicionada ao histórico água' });
  } catch (err) {
    console.error('Erro ao salvar histórico agua:', err);
    res.status(500).json({ erro: 'Erro ao salvar histórico agua no banco de dados' });
  }
});

// --- RESULTADO (LUZ E ÁGUA) ---
app.post('/api/:tipo/resultado', autenticarJWT, async (req, res) => {
  const { tipo } = req.params;
  const { resultado } = req.body;
  if ((tipo !== 'luz' && tipo !== 'agua') || typeof resultado !== 'number') {
    return res.status(400).json({ erro: 'Tipo ou resultado inválido' });
  }
  try {
    const db = mongo.getDb();
    await db.collection('resultados').insertOne({ tipo, usuario: req.usuario.email, resultado, data: new Date() });
    res.json({ mensagem: 'Resultado salvo com sucesso' });
  } catch (err) {
    console.error('Erro ao salvar resultado:', err);
    res.status(500).json({ erro: 'Erro ao salvar resultado no banco de dados' });
  }
});

app.get('/api/:tipo/resultado', autenticarJWT, async (req, res) => {
  const { tipo } = req.params;
  if (tipo !== 'luz' && tipo !== 'agua') {
    return res.status(400).json({ erro: 'Tipo inválido' });
  }
  try {
    const db = mongo.getDb();
    const doc = await db.collection('resultados').find({ tipo, usuario: req.usuario.email }).sort({ data: -1 }).limit(1).toArray();
    if (!doc || doc.length === 0) return res.json({ resultado: null, data: null });
    res.json({ resultado: doc[0].resultado, data: doc[0].data });
  } catch (err) {
    console.error('Erro ao buscar resultado:', err);
    res.status(500).json({ erro: 'Erro ao buscar resultado no banco de dados' });
  }
});

// --- Servir frontends estáticos se quiser ---
// app.use(express.static('public'));

// --- INTEGRAÇÃO TUYA ---
// A configuração dos Device IDs é salva por usuário. As credenciais da Tuya ficam
// somente no servidor (TUYA_CLIENT_ID / TUYA_CLIENT_SECRET).
app.get('/api/tuya/config', autenticarJWT, async (req, res) => {
  try {
    const db = mongo.getDb();
    const cfg = await db.collection('tuya_config').findOne({ usuario: req.usuario.email });
    res.json(cfg ? {
      pessoa1: cfg.pessoa1 || {},
      pessoa2: cfg.pessoa2 || {},
      atualizadoEm: cfg.atualizadoEm || null
    } : { pessoa1: {}, pessoa2: {}, atualizadoEm: null });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao carregar configuração Tuya.' });
  }
});

app.post('/api/tuya/config', autenticarJWT, async (req, res) => {
  try {
    const clean = (v = {}) => ({
      deviceId: String(v.deviceId || '').trim(),
      dpCode: String(v.dpCode || '').trim(),
      divisor: Number(v.divisor) > 0 ? Number(v.divisor) : null
    });
    const pessoa1 = clean(req.body.pessoa1);
    const pessoa2 = clean(req.body.pessoa2);
    if (!pessoa1.deviceId || !pessoa2.deviceId) {
      return res.status(400).json({ erro: 'Informe os dois Device IDs Tuya.' });
    }
    const db = mongo.getDb();
    await db.collection('tuya_config').updateOne(
      { usuario: req.usuario.email },
      { $set: { pessoa1, pessoa2, atualizadoEm: new Date() } },
      { upsert: true }
    );

    app.get('/api/luz/leituras-geral', autenticarJWT, async (req, res) => {
      try {
        const db = mongo.getDb();
        const docs = await db.collection('leituras_gerais').find({ usuario: req.usuario.email }).sort({ data: -1 }).limit(1).toArray();
        if (!docs.length) return res.json({ leitura: null, data: null });
        res.json({ leitura: docs[0].leitura, data: docs[0].data });
      } catch (err) {
        console.error('Erro ao buscar leitura geral:', err);
        res.status(500).json({ erro: 'Erro ao buscar leitura geral.' });
      }
    });

    app.post('/api/luz/leituras-geral', autenticarJWT, async (req, res) => {
      const leitura = Number(req.body.leitura);
      if (!Number.isFinite(leitura) || leitura < 0) return res.status(400).json({ erro: 'A leitura geral deve ser um número válido.' });
      try {
        const db = mongo.getDb();
        await db.collection('leituras_gerais').insertOne({ usuario: req.usuario.email, leitura, data: new Date() });
        res.json({ mensagem: 'Leitura geral salva com sucesso.', leitura });
      } catch (err) {
        console.error('Erro ao salvar leitura geral:', err);
        res.status(500).json({ erro: 'Erro ao salvar leitura geral.' });
      }
    });
    res.json({ mensagem: 'Configuração Tuya salva.', pessoa1, pessoa2 });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar configuração Tuya.' });
  }
});

app.get('/api/tuya/device/:deviceId/status', autenticarJWT, async (req, res) => {
  try {
    const [status, specification] = await Promise.all([
      tuya.getDeviceStatus(req.params.deviceId),
      tuya.getDeviceSpecification(req.params.deviceId)
    ]);
    res.json({ status, specification });
  } catch (err) {
    res.status(502).json({ erro: 'Falha ao consultar dispositivo Tuya.', detalhes: err.message });
  }
});

app.get('/api/luz/tuya/leituras', autenticarJWT, async (req, res) => {
  try {
    const db = mongo.getDb();
    const cfg = await db.collection('tuya_config').findOne({ usuario: req.usuario.email });
    if (!cfg?.pessoa1?.deviceId || !cfg?.pessoa2?.deviceId) {
      return res.status(400).json({ erro: 'Configure os Device IDs dos dois disjuntores Tuya primeiro.' });
    }
    const [p1, p2] = await Promise.all([
      tuya.readEnergyKwh(cfg.pessoa1.deviceId, cfg.pessoa1),
      tuya.readEnergyKwh(cfg.pessoa2.deviceId, cfg.pessoa2)
    ]);
    res.json({
      karina: p1.kwh,
      luiza: p2.kwh,
      pessoa1: { deviceId: p1.deviceId, dpCode: p1.dpCode, divisor: p1.divisor, rawValue: p1.rawValue },
      pessoa2: { deviceId: p2.deviceId, dpCode: p2.dpCode, divisor: p2.divisor, rawValue: p2.rawValue },
      data: new Date()
    });
  } catch (err) {
    console.error('Erro ao ler energia Tuya:', err);
    res.status(502).json({ erro: 'Não foi possível obter o consumo dos disjuntores Tuya.', detalhes: err.message });
  }
});

// Iniciar servidor apenas após conectar ao MongoDB
const bathMonitor = require('./bath-monitor');
app.get('/api/luz/tuya/leitura-data/:kitinete', autenticarJWT, async (req, res) => {
  const at = new Date(req.query.data).getTime();
  if (!['maior', 'menor'].includes(req.params.kitinete) || !Number.isFinite(at) || at > Date.now()) {
    return res.status(400).json({ erro: 'Informe uma kitinete e uma data passada válida.' });
  }
  try {
    const config = await mongo.getDb().collection('tuya_config').findOne({ usuario: req.usuario.email });
    const device = config?.[req.params.kitinete === 'maior' ? 'pessoa1' : 'pessoa2'];
    if (!device?.deviceId) return res.status(400).json({ erro: 'Configure o dispositivo desta kitinete.' });
    res.json(await tuya.readEnergyAt(device.deviceId, at, device));
  } catch (error) { res.status(502).json({ erro: error.message }); }
});
bathMonitor.installRoutes(app, autenticarJWT, mongo.getDb);
mongo.connect().then(async () => {
  await bathMonitor.startMonitor(mongo.getDb());
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Falha ao conectar no MongoDB:', err);
  process.exit(1);
});
