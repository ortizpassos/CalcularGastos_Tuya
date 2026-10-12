const KITINETES = {
  maior: { indice: 0, nomeOriginal: 'Karina', titulo: 'Kitinete maior' },
  menor: { indice: 1, nomeOriginal: 'Luiza', titulo: 'Kitinet menor' },
  superior: { indice: 2, nomeOriginal: 'Tatiana', titulo: 'Kitinet superior' }
};

function filtrarHistoricoKitinete(registros, kitinete) {
  return registros.filter(item => item.nome === kitinete.nomeOriginal);
}

async function carregarDetalhes() {
  const status = document.getElementById('status');
  const parametros = new URLSearchParams(window.location.search);
  const chave = parametros.get('kitinete');
  const tipo = parametros.get('tipo') || 'luz';
  const kitinete = Object.hasOwn(KITINETES, chave) ? KITINETES[chave] : null;
  if (!kitinete || !['luz', 'agua'].includes(tipo)) {
    status.className = 'alert alert-warning';
    status.textContent = 'Kitinete ou tipo de consumo inválido. Volte e selecione um nome.';
    return;
  }
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  const nome = getNomesDinamicos()[kitinete.indice];
  document.getElementById('nome').textContent = nome;
  document.title = `${nome} — ${kitinete.titulo}`;
  document.getElementById('kitinete').textContent = kitinete.titulo;
  document.getElementById('voltar').href = `${tipo}.html`;
  for (const [id, destino] of [['linkLuz', 'luz'], ['linkAgua', 'agua']]) {
    const link = document.getElementById(id);
    link.href = `detalhes.html?kitinete=${chave}&tipo=${destino}`;
    if (tipo === destino) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  }
  const unidade = tipo === 'luz' ? 'kWh' : 'm³';
  const numero = valor => valor != null && Number.isFinite(Number(valor))
    ? Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const dinheiro = valor => valor != null && Number.isFinite(Number(valor))
    ? Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
  const data = valor => {
    if (!valor) return 'Data indisponível';
    const parsed = new Date(valor);
    return Number.isNaN(parsed.getTime()) ? String(valor) : parsed.toLocaleString('pt-BR');
  };
  document.getElementById('unidade').textContent = `Consumo (${unidade})`;
  document.getElementById('observacao').textContent = chave === 'superior'
    ? 'O consumo desta kitinete é a diferença entre o consumo total da fatura e o consumo das outras duas kitinetes.'
    : 'O consumo desta kitinete é calculado pela diferença entre a leitura atual e a anterior.';
  try {
    const resposta = await fetch(`http://localhost:3000/api/${tipo}/historico`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resposta.ok) throw new Error(resposta.status === 401
      ? 'Sua sessão expirou. Faça login novamente.' : 'Não foi possível carregar o histórico. Tente novamente.');
    const registros = await resposta.json();
    if (!Array.isArray(registros)) throw new Error('O histórico retornado é inválido.');
    // A API retorna os registros mais recentes primeiro. A identidade permanece
    // vinculada à kitinete mesmo quando o nome do morador é alterado.
    const historico = filtrarHistoricoKitinete(registros, kitinete);
    document.getElementById('conteudo').hidden = false;
    if (!historico.length) {
      status.textContent = 'Ainda não há cálculos salvos para esta kitinete neste tipo de consumo.';
      return;
    }
    status.hidden = true;
    const ultimo = historico[0];
    document.getElementById('consumo').textContent = `${numero(ultimo.consumo)} ${unidade}`;
    document.getElementById('valor').textContent = dinheiro(ultimo.valor);
    document.getElementById('data').textContent = data(ultimo.data);
    const tabela = document.getElementById('historico');
    tabela.replaceChildren();
    for (const item of historico) {
      const linha = document.createElement('tr');
      for (const texto of [data(item.data), numero(item.consumo), dinheiro(item.valor)]) {
        const celula = document.createElement('td');
        celula.textContent = texto;
        linha.appendChild(celula);
      }
      tabela.appendChild(linha);
    }
  } catch (error) {
    status.className = 'alert alert-danger';
    status.textContent = error.message;
  }
}

carregarDetalhes();
