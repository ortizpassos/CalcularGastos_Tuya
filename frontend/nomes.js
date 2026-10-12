// Ordem interna das leituras: maior, menor, superior.
function getNomesDinamicos() {
  const padrao = ['Karina', 'Luiza', 'Tatiana'];
  try {
    let nomes = JSON.parse(localStorage.getItem('nomesPessoas'));
    if (!Array.isArray(nomes) || nomes.length !== 3) {
      const antigos = JSON.parse(localStorage.getItem('nomes'));
      nomes = Array.isArray(antigos) && antigos.length === 3
        ? [antigos[1], antigos[2], antigos[0]] : padrao;
    }
    return padrao.map((nome, i) => typeof nomes[i] === 'string' && nomes[i].trim()
      ? nomes[i].trim() : nome);
  } catch {
    return padrao;
  }
}

function salvarNomesKitinetes(nomes) {
  if (nomes.length !== 3 || nomes.some(nome => typeof nome !== 'string' || !nome.trim() || nome.trim().length > 80)) {
    throw new Error('Preencha os tr?s nomes com at? 80 caracteres.');
  }
  localStorage.setItem('nomesPessoas', JSON.stringify(nomes.map(nome => nome.trim())));
}
