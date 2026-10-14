# Monitoramento de banhos prováveis

## Relatórios individuais e consumo diário

Na página de detalhes, o relatório e o CSV são filtrados pela kitinete selecionada. O custo usa `valorTotal / consumoTotal` do registro válido mais recentemente inserido no histórico de Luz do usuário. Essa tarifa atual é aplicada ao relatório inteiro; não é uma tarifa histórica fixada na data do banho. Sem cálculo válido, o custo aparece como indisponível.

Com o monitor ativo, `power_intervals` armazena intervalos de potência também abaixo do limite de banho. A tabela diária integra esses intervalos por hora e mostra consumo, custo e cobertura. A comparação maior/menor exige duas horas com pelo menos 90% de cobertura. Sem dados não significa zero. Essa coleta começa após a atualização; não há preenchimento retroativo. O dia é definido pela seleção de data no fuso do navegador.

Reinicie o backend com `npm start`. Abra os detalhes de Luz da kitinete maior ou menor, marque **Ativar monitoramento**, confira o limite (16 A inicialmente) e salve. Os dispositivos continuam configurados na página Configurações. A superior não possui monitor.

O serviço roda no backend, mesmo com o navegador fechado, e persiste configurações e ocorrências em `bath_configs` e `bath_events`, por usuário autenticado. Execute apenas uma instância do backend para este monitor. A implementação usa agendamento em processo, não um serviço distribuído.

O ciclo consulta conectividade, especificação (cache de uma hora) e status Tuya. O próximo ciclo começa 30 segundos após o término do anterior, sem sobreposição. A assinatura Tuya deve estar ativa; a frequência usa a cota de chamadas da conta. Sem dispositivos ativados não são feitas consultas Tuya pelo monitor.

São usados `cur_current` e `cur_power` por padrão. A conversão exige unidade e escala da especificação. Outros códigos e divisores podem ser informados na tela. Corrente: A ou mA; potência ativa: W ou kW. DP ausente ou formato composto/raw exige adaptação específica ao produto, sem adivinhar a conversão. O monitor rejeita corrente sem conversão conhecida. Potência indisponível permite contar tempo, mas não inventa kWh.

Para o EARU com `phase_a` em Base64 de 8 bytes, a corrente é extraída dos bytes 2–4 (índices iniciando em zero), em big-endian, e convertida de mA para A. Esse campo é usado automaticamente quando os DPs escalares conhecidos não estão disponíveis. `leakage_current` não é escolhido automaticamente como corrente do circuito. Frames vazios, inválidos ou de outro tamanho são rejeitados. A potência desse frame permanece indisponível até confirmar a escala do modelo.

Documentação das unidades e escalas: https://developer.tuya.com/en/docs/iot/product-function-definition?id=K9tp14pijmeyh

Uma ocorrência começa com a primeira amostra estritamente acima do limite e termina na primeira amostra menor ou igual. Tempo e kWh são estimados pela amostragem: a potência da amostra anterior é integrada até a próxima (`W × segundos / 3600000`). Não se utiliza tensão × corrente como se fosse potência ativa. A tela mostra segundos efetivamente processados; não avança o relógio sem amostras.

Isso representa consumo do circuito durante banhos prováveis, não identificação garantida do chuveiro nem consumo exclusivo dele. A Tuya pode devolver o último estado conhecido; a consulta e o indicador online não garantem que o dispositivo publicou uma medição nova naquele instante. Atrasos de publicação reduzem a precisão. Não é um medidor para faturamento individual exato.

Falha de consulta, mudança de dispositivo/configuração, desativação ou reinício encerram a ocorrência como interrompida na última amostra conhecida. Intervalos maiores que 90 segundos também interrompem; se a corrente continuar alta, uma nova ocorrência inicia. Esses fragmentos não são automaticamente unidos em um único banho. Dados históricos não são reconstruídos retroativamente.

O relatório inclui ocorrências encerradas cujo início esteja no período selecionado (máximo 366 dias), com totais por kitinete, total conjunto e linhas individuais. Ocorrências em andamento ficam no monitor e entram no relatório quando encerradas. Os totais de energia são somente a parcela conhecida; linhas sem potência ou interrompidas são sinalizadas. Nomes seguem as configurações atuais do navegador. CSV inclui linhas e totais.

Validação local: `node --test bath-monitor.test.js`. Testes não consultam dispositivos reais. Para validar a integração, ative o monitor, confira a corrente exibida com a medição do próprio equipamento e verifique uma transição acima/abaixo do limite e uma interrupção de conexão.
