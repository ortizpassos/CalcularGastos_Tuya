(() => {
  const params = new URLSearchParams(location.search);
  const kitinete = params.get('kitinete');
  if ((params.get('tipo') || 'luz') !== 'luz' || !['maior', 'menor'].includes(kitinete) || !localStorage.getItem('token')) return;
  const el = id => document.getElementById(id);
  el('monitorBanhos').hidden = false;
  const api = 'http://localhost:3000/api';
  const n = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  const money = value => value == null ? 'Indisponível' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const duration = seconds => `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`;
  const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
  const name = key => `${key === 'maior' ? 'Kitinete maior' : 'Kitinet menor'} / ${getNomesDinamicos()[key === 'maior' ? 0 : 1]}`;
  let report = null;
  async function request(path, body) {
    const response = await fetch(api + path, {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + localStorage.getItem('token'), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'Faça login novamente.' : data.erro || 'Falha no servidor.');
    return data;
  }
  async function refresh(fill = false) {
    try {
      const { config, active } = await request('/banhos/' + kitinete);
      if (fill) {
        el('monitorAtivo').checked = config.enabled;
        for (const [id, key] of Object.entries({ limiteBanho: 'thresholdA', dpCorrente: 'currentCode', dpPotencia: 'powerCode', divisorCorrente: 'currentDivisor', divisorPotencia: 'powerDivisor' })) el(id).value = config[key] ?? '';
        el('camposMonitor').disabled = false;
      }
      const fresh = config.sample && Date.now() - new Date(config.sample.at) <= 90000;
      let text = !config.enabled ? 'Monitoramento desativado.' : config.error ? 'Indisponível: ' + config.error
        : !fresh ? 'Aguardando uma leitura recente do dispositivo.'
        : `Corrente: ${n(config.sample.currentA)} A | Potência: ${config.sample.powerW == null ? 'indisponível' : n(config.sample.powerW) + ' W'} | Consulta: ${date(config.sample.at)}`;
      if (config.enabled && fresh && !config.error) text += active
        ? ` | Banho provável: ${duration(active.seconds)} observados; energia acumulada estimada ${active.energySeconds > 0 ? n(active.energyKwh) + ' kWh' : 'indisponível'}.`
        : ' | Abaixo ou igual ao limite.';
      el('monitorAgora').textContent = text;
    } catch (error) { el('monitorAgora').textContent = 'Não foi possível consultar o monitor: ' + error.message; }
  }
  el('formMonitor').addEventListener('submit', async event => {
    event.preventDefault();
    const divisor = id => el(id).value ? Number(el(id).value) : null;
    el('camposMonitor').disabled = true;
    try {
      const result = await request('/banhos/' + kitinete, { enabled: el('monitorAtivo').checked, thresholdA: Number(el('limiteBanho').value),
        currentCode: el('dpCorrente').value.trim(), powerCode: el('dpPotencia').value.trim(),
        currentDivisor: divisor('divisorCorrente'), powerDivisor: divisor('divisorPotencia') });
      el('monitorMensagem').textContent = result.mensagem;
      await refresh();
    } catch (error) { el('monitorMensagem').textContent = error.message; }
    finally { el('camposMonitor').disabled = false; }
  });
  function rowValues(item) {
    return [name(item.kitinete), date(item.start), date(item.end), duration(item.seconds),
      item.energySeconds > 0 ? n(item.energyKwh) + ' kWh' + (item.energySeconds < item.seconds ? ' (parcial)' : '') : 'Indisponível',
      money(item.cost) + (item.cost != null && item.energySeconds < item.seconds ? ' (parcial)' : ''),
      n(item.peakA), n(item.thresholdA), item.status === 'concluido' ? 'Concluído' : 'Interrompido: ' + (item.reason || 'Intervalo sem dados')];
  }
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  el('banhosFim').value = localDate(new Date());
  el('banhosInicio').value = localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  async function loadReport() {
    report = null; el('exportarBanhos').disabled = true;
    el('linhasBanhos').replaceChildren(); el('totaisBanhos').replaceChildren();
    el('relatorioStatus').textContent = 'Carregando relatório...';
    try {
      const start = new Date(el('banhosInicio').value + 'T00:00:00');
      const end = new Date(el('banhosFim').value + 'T00:00:00'); end.setDate(end.getDate() + 1);
      if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) throw new Error('Confira as datas.');
      report = await request('/banhos-relatorio?kitinete=' + kitinete + '&inicio=' + encodeURIComponent(start.toISOString()) + '&fim=' + encodeURIComponent(end.toISOString()));
      for (const key of [kitinete]) {
        const total = report.totals[key]; const p = document.createElement('p');
        p.textContent = `${name(key)}: ${total.count} ocorrências; ${duration(total.seconds)}; ${n(total.energyKwh)} kWh estimados conhecidos; ${total.incomplete} ocorrências incompletas.`;
        el('totaisBanhos').appendChild(p);
      }
      const total = document.createElement('strong'); total.textContent = `Custo estimado conhecido: ${money(report.tariff == null ? null : report.totalKwh * report.tariff)}. ` +
        (report.tariff == null ? 'Faça um cálculo de Luz para definir a tarifa.' : `Tarifa do último cálculo de Luz: R$ ${n(report.tariff)}/kWh. Aplicada a todos os banhos deste relatório.`);
      el('totaisBanhos').appendChild(total);
      for (const item of report.events) {
        const tr = document.createElement('tr');
        for (const text of rowValues(item)) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); }
        el('linhasBanhos').appendChild(tr);
      }
      el('relatorioStatus').textContent = report.events.length ? 'Relatório da kitinete selecionada. Atualize para incluir novas ocorrências encerradas.' : 'Nenhuma ocorrência no período.';
      el('exportarBanhos').disabled = false;
    } catch (error) { el('relatorioStatus').textContent = error.message; }
  }
  el('formRelatorio').addEventListener('submit', event => { event.preventDefault(); void loadReport(); });
  el('exportarBanhos').addEventListener('click', () => {
    if (!report) return;
    const rows = [['Kitinete / morador', 'Inicio', 'Fim', 'Tempo observado', 'Consumo estimado', 'Custo estimado', 'Pico A', 'Limite A', 'Estado'], ...report.events.map(rowValues), [], ['Total conhecido kWh', report.totalKwh], ['Tarifa ultimo calculo R$/kWh', report.tariff ?? 'Indisponivel'], ['Custo total estimado', money(report.tariff == null ? null : report.totalKwh * report.tariff)]];
    for (const key of [kitinete]) rows.push([name(key), 'Total conhecido kWh', report.totals[key].energyKwh, 'Ocorrencias', report.totals[key].count]);
    const csv = rows.map(row => row.map(value => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'relatorio-banhos.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  el('diaConsumo').value = localDate(new Date());
  async function loadDay() {
    el('horasConsumo').replaceChildren();
    el('diaStatus').textContent = 'Carregando consumo por hora...';
    try {
      const start = new Date(el('diaConsumo').value + 'T00:00:00');
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const data = await request('/consumo-dia/' + kitinete + '?inicio=' + encodeURIComponent(start.toISOString()) + '&fim=' + encodeURIComponent(end.toISOString()));
      const time = value => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      for (const hour of data.hours) {
        const tr = document.createElement('tr');
        const rank = { maior: 'Maior consumo', menor: 'Menor consumo', igual: 'Consumos iguais' }[hour.rank];
        if (hour.rank === 'maior') tr.className = 'table-warning';
        if (hour.rank === 'menor') tr.className = 'table-success';
        for (const text of [time(hour.start) + ' – ' + time(hour.end), hour.energyKwh == null ? 'Sem dados' : n(hour.energyKwh) + ' kWh',
          money(hour.cost), duration(hour.seconds), rank || (hour.complete ? 'Comparável' : 'Dados insuficientes')]) {
          const td = document.createElement('td'); td.textContent = text; tr.appendChild(td);
        }
        el('horasConsumo').appendChild(tr);
      }
      el('diaStatus').textContent = 'Consumo total do dispositivo por hora, incluindo períodos fora dos banhos. ' +
        (data.tariff == null ? 'Tarifa indisponível: faça um cálculo de Luz.' : `Valores estimados com a tarifa do último cálculo: R$ ${n(data.tariff)}/kWh.`);
    } catch (error) { el('diaStatus').textContent = error.message; }
  }
  el('formConsumoDia').addEventListener('submit', event => { event.preventDefault(); void loadDay(); });
  void loadDay();
  async function poll() { await refresh(); timer = setTimeout(poll, 10000); }
  let timer;
  void refresh(true).then(() => { timer = setTimeout(poll, 10000); });
  void loadReport();
  window.addEventListener('pagehide', () => clearTimeout(timer));
})();
