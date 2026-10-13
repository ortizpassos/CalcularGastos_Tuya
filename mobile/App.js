import React, { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const COLORS = {
  background: '#101214',
  surface: '#191d21',
  surfaceRaised: '#22272d',
  border: '#30363d',
  text: '#f5f7fa',
  muted: '#9aa4af',
  blue: '#58a6ff',
  orange: '#ff9f43',
  green: '#3ddc97',
  red: '#ff6b6b',
};

const DEFAULT_NAMES = ['Karina', 'Luiza', 'Tatiana'];

function Button({ title, icon, onPress, variant = 'primary', disabled = false }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.72}
      style={[
        styles.button,
        styles[`button_${variant}`],
        disabled && styles.buttonDisabled,
      ]}
    >
      <Ionicons name={icon} size={20} color={variant === 'primary' ? COLORS.background : COLORS.text} />
      <Text style={[styles.buttonText, variant === 'primary' && styles.buttonTextPrimary]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry = false, keyboardType = 'default' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function Header({ title, subtitle, onBack }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable hitSlop={12} onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </Pressable>
      ) : null}
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>CALCULAR GASTOS</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function Screen({ children }) {
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [token, setToken] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [apiError, setApiError] = useState('');
  const [detailName, setDetailName] = useState(DEFAULT_NAMES[0]);
  const [detailType, setDetailType] = useState('water');

  useEffect(() => {
    if (screen !== 'home' && ['water', 'power', 'settings', 'details', 'resident-select'].includes(screen) && !token) setScreen('login');
  }, [screen, token]);

  useEffect(() => {
    if (Platform.OS !== 'android' || screen === 'home') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'login' || screen === 'resident-select' || screen === 'settings' || screen === 'water' || screen === 'power') {
        setScreen('home');
      } else if (screen === 'details') {
        setScreen('resident-select');
      }
      return true;
    });
    return () => subscription.remove();
  }, [screen]);

  const request = async (path, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.erro || 'Não foi possível completar a operação.');
    return data;
  };

  const handleAuth = async (email, senha) => {
    setApiError('');
    try {
      if (authMode === 'register') {
        await request('/api/cadastro', { method: 'POST', body: JSON.stringify({ email, senha }) });
        Alert.alert('Cadastro concluído', 'Agora entre com seu e-mail e senha.');
        setAuthMode('login');
        return;
      }
      const data = await request('/api/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      setToken(data.token);
      setScreen('home');
    } catch (error) {
      setApiError(error.message);
    }
  };

  const logout = () => {
    setToken(null);
    setScreen('home');
  };

  if (screen === 'login') {
    return <AuthScreen mode={authMode} error={apiError} onSubmit={handleAuth} onSwitch={() => { setApiError(''); setAuthMode(authMode === 'login' ? 'register' : 'login'); }} onBack={() => setScreen('home')} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {screen === 'home' && <HomeScreen loggedIn={Boolean(token)} onLogin={() => { setAuthMode('login'); setScreen('login'); }} onRegister={() => { setAuthMode('register'); setScreen('login'); }} onLogout={logout} onNavigate={setScreen} />}
      {screen === 'resident-select' && <ResidentSelectScreen names={names} onBack={() => setScreen('home')} onSelect={(name) => { setDetailName(name); setDetailType('water'); setScreen('details'); }} />}
      {screen === 'water' && <CalculatorScreen type="water" names={names} request={request} onBack={() => setScreen('home')} onDetails={(name) => { setDetailName(name); setDetailType('water'); setScreen('details'); }} />}
      {screen === 'power' && <CalculatorScreen type="power" names={names} request={request} onBack={() => setScreen('home')} onDetails={(name) => { setDetailName(name); setDetailType('power'); setScreen('details'); }} />}
      {screen === 'settings' && <SettingsScreen names={names} setNames={setNames} request={request} onBack={() => setScreen('home')} />}
      {screen === 'details' && <DetailScreen name={detailName} type={detailType} names={names} request={request} onBack={() => setScreen('home')} onSwitchType={setDetailType} onOpenSettings={() => setScreen('settings')} />}
    </SafeAreaView>
  );
}

function HomeScreen({ loggedIn, onLogin, onRegister, onLogout, onNavigate }) {
  return (
    <Screen>
      <View style={styles.homeHero}>
        <View style={styles.logoMark}><Ionicons name="pulse" size={28} color={COLORS.background} /></View>
        <Text style={styles.homeTitle}>Suas contas, sob controle.</Text>
        <Text style={styles.homeSubtitle}>Divida água e luz entre as kitinetes com clareza.</Text>
      </View>
      {!loggedIn ? (
        <View style={styles.stack}>
          <Button icon="log-in-outline" title="Entrar" onPress={onLogin} />
          <Button icon="person-add-outline" title="Criar conta" variant="secondary" onPress={onRegister} />
        </View>
      ) : (
        <View style={styles.stack}>
          <Text style={styles.sectionLabel}>ACESSO RÁPIDO</Text>
          <Button icon="water-outline" title="Calcular água" onPress={() => onNavigate('water')} />
          <Button icon="flash-outline" title="Calcular luz" variant="orange" onPress={() => onNavigate('power')} />
          <Button icon="settings-outline" title="Configurações" variant="secondary" onPress={() => onNavigate('settings')} />
          <Button icon="people-outline" title="Ver detalhes" variant="secondary" onPress={() => onNavigate('resident-select')} />
          <Button icon="log-out-outline" title="Sair" variant="danger" onPress={onLogout} />
        </View>
      )}
      <View style={styles.infoStrip}><Ionicons name="shield-checkmark-outline" size={20} color={COLORS.green} /><Text style={styles.infoText}>Seus cálculos ficam vinculados à sua conta.</Text></View>
    </Screen>
  );
}

function ResidentSelectScreen({ names, onBack, onSelect }) {
  return (
    <Screen>
      <Header title="Ver detalhes" subtitle="Selecione o morador para consultar." onBack={onBack} />
      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Moradores</Text>
        {names.map((name, index) => <Button key={name} icon="person-circle-outline" title={name} variant={index === 0 ? 'primary' : 'secondary'} onPress={() => onSelect(name)} />)}
      </View>
    </Screen>
  );
}

function AuthScreen({ mode, error, onSubmit, onSwitch, onBack }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authWrap}>
        <Screen>
          <Header title={mode === 'login' ? 'Entrar' : 'Criar conta'} subtitle="Acesse seus cálculos de consumo." onBack={onBack} />
          <View style={styles.formCard}>
            <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@email.com" keyboardType="email-address" />
            <Field label="Senha" value={senha} onChangeText={setSenha} placeholder="Sua senha" secureTextEntry />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button icon={mode === 'login' ? 'arrow-forward' : 'checkmark'} title={mode === 'login' ? 'Entrar' : 'Cadastrar'} onPress={() => onSubmit(email, senha)} />
          </View>
          <Pressable onPress={onSwitch} style={styles.switchLink}><Text style={styles.switchText}>{mode === 'login' ? 'Ainda não tenho uma conta' : 'Já tenho uma conta'}</Text></Pressable>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CalculatorScreen({ type, names, request, onBack, onDetails }) {
  const isWater = type === 'water';
  const unit = isWater ? 'm³' : 'kWh';
  const accent = isWater ? COLORS.blue : COLORS.orange;
  const apiType = isWater ? 'agua' : 'luz';
  const [total, setTotal] = useState('');
  const [consumptionTotal, setConsumptionTotal] = useState('');
  const [current, setCurrent] = useState(['', '']);
  const [previous, setPrevious] = useState(['', '']);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [readingLoading, setReadingLoading] = useState(false);
  const [readingError, setReadingError] = useState('');
  const [history, setHistory] = useState([]);
  const [readingDate, setReadingDate] = useState(['', '']);
  const [datePickerIndex, setDatePickerIndex] = useState(null);
  const [editingPrevious, setEditingPrevious] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const exportHistory = async () => {
    if (!history.length) {
      Alert.alert('Histórico vazio', 'Faça um cálculo antes de exportar.');
      return;
    }
    const rows = history.map(item => `<tr><td>${item.data ? new Date(item.data).toLocaleString('pt-BR') : '-'}</td><td>${item.nome || '-'}</td><td>${parseNumber(item.consumo).toFixed(2)} ${unit}</td><td>R$ ${parseNumber(item.valor).toFixed(2)}</td></tr>`).join('');
    const html = `<html><body><h1>Histórico de ${isWater ? 'água' : 'luz'}</h1><table border="1" cellspacing="0" cellpadding="6"><tr><th>Data</th><th>Nome</th><th>Consumo</th><th>Valor</th></tr>${rows}</table></body></html>`;
    try {
      const result = await Print.printToFileAsync({ html });
      if (Platform.OS !== 'web' && await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar histórico' });
    } catch (error) {
      Alert.alert('Exportação indisponível', error.message || 'Não foi possível gerar o PDF.');
    }
  };

  const loadData = async () => {
    setReadingLoading(true);
    setReadingError('');
    try {
      const saved = await request(`/api/${apiType}/leituras`);
      setPrevious([String(saved.karina ?? ''), String(saved.luiza ?? '')]);
      const recentHistory = await request(`/api/${apiType}/historico`);
      setHistory(Array.isArray(recentHistory) ? recentHistory : []);
      if (!isWater) {
        try {
          const tuya = await request('/api/luz/tuya/leituras');
          if (Number.isFinite(Number(tuya.karina)) && Number.isFinite(Number(tuya.luiza))) {
            setCurrent([Number(tuya.karina).toFixed(2), Number(tuya.luiza).toFixed(2)]);
          }
        } catch {
          setReadingError('Tuya indisponível. Informe as leituras manualmente.');
        }
      }
    } catch (error) {
      setReadingError(error.message || 'Não foi possível buscar as leituras.');
    } finally {
      setReadingLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [apiType]);

  const calculate = async () => {
    const amount = parseNumber(total);
    const totalConsumption = parseNumber(consumptionTotal);
    const first = parseNumber(current[0]) - parseNumber(previous[0] || 0);
    const second = parseNumber(current[1]) - parseNumber(previous[1] || 0);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(totalConsumption) || totalConsumption <= 0 || !Number.isFinite(first) || !Number.isFinite(second) || first < 0 || second < 0) {
      Alert.alert('Confira os dados', 'Informe valores válidos para a fatura e as duas leituras atuais.');
      return;
    }
    const third = totalConsumption - first - second;
    if (third < 0) {
      Alert.alert('Confira os dados', 'As leituras individuais não podem superar o consumo total da fatura.');
      return;
    }
    const price = amount / totalConsumption;
    const values = [first * price, second * price, third * price];
    setResult({ consumption: [first, second, third], values, price, total: amount });
    setLoading(true);
    try {
      await request(`/api/${apiType}/leituras`, { method: 'POST', body: JSON.stringify({ karina: parseNumber(current[0]), luiza: parseNumber(current[1]) }) });
      await Promise.all(names.map((name, index) => request(`/api/${apiType}/historico`, {
        method: 'POST',
        body: JSON.stringify({ nome: name, consumo: [first, second, third][index], valor: values[index], consumoTotal: totalConsumption, valorTotal: amount }),
      })));
      await loadData();
    } catch (error) {
      Alert.alert('Cálculo feito', `Não foi possível salvar tudo no servidor: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const setReading = (index, value) => setCurrent(items => items.map((item, itemIndex) => itemIndex === index ? value : item));

  const searchReadingByDate = async (index, selectedDate = readingDate[index]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      Alert.alert('Data inválida', 'Informe a data no formato AAAA-MM-DD.');
      return;
    }
    const selected = new Date(`${selectedDate}T12:00:00-03:00`);
    if (!Number.isFinite(selected.getTime()) || selected.getTime() > Date.now()) {
      Alert.alert('Data inválida', 'Informe uma data passada cujo horário de Brasília já tenha ocorrido.');
      return;
    }
    try {
      const kitinete = index === 0 ? 'maior' : 'menor';
      const data = await request(`/api/luz/tuya/leitura-data/${kitinete}?data=${encodeURIComponent(selected.toISOString())}`);
      if (!Number.isFinite(Number(data.kwh)) || Number(data.kwh) < 0) throw new Error('Leitura histórica inválida.');
      setReading(index, Number(data.kwh).toFixed(2));
      Alert.alert('Leitura encontrada', `${Number(data.kwh).toFixed(2)} kWh em ${new Date(data.timestamp).toLocaleString('pt-BR')}.`);
    } catch (error) {
      Alert.alert('Não foi possível buscar', error.message);
    }
  };

  const openDatePicker = index => setDatePickerIndex(index);

  const handleDatePickerChange = (index, event, date) => {
    setDatePickerIndex(null);
    if (!date || event?.type === 'dismissed') return;
    const selectedDate = localDate(date);
    setReadingDate(items => items.map((item, itemIndex) => itemIndex === index ? selectedDate : item));
    void searchReadingByDate(index, selectedDate);
  };

  const verifyPreviousReadingAccess = async () => {
    setPasswordError('');
    try {
      await request('/api/usuario/verificar-senha', { method: 'POST', body: JSON.stringify({ senha: password }) });
      setPassword('');
      setPasswordModal(false);
      setEditingPrevious(true);
    } catch (error) {
      setPasswordError(error.message || 'Senha incorreta.');
    }
  };

  return (
    <Screen>
      <Header title={isWater ? 'Conta de água' : 'Conta de luz'} subtitle={`${unit} por kitinete`} onBack={onBack} />
      <View style={[styles.accentLine, { backgroundColor: accent }]} />
      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Dados da fatura</Text>
        <Field label="Valor total (R$)" value={total} onChangeText={setTotal} placeholder="Ex.: 150,50" keyboardType="decimal-pad" />
        <Field label={`Consumo total (${unit})`} value={consumptionTotal} onChangeText={setConsumptionTotal} placeholder={`Ex.: ${isWater ? '25' : '350'}`} keyboardType="decimal-pad" />
        {previous.every(value => value !== '' && Number.isFinite(parseNumber(value))) && !editingPrevious ? <View><Text style={styles.helper}>Leituras anteriores salvas: {previous[0]} e {previous[1]} {unit}</Text><Button icon="create-outline" title="Alterar leituras anteriores" variant="secondary" onPress={() => setPasswordModal(true)} /></View> : <View><Text style={styles.cardTitle}>Leituras anteriores</Text>{[0, 1].map(index => <Field key={index} label={`${names[index]} (${unit})`} value={previous[index]} onChangeText={value => setPrevious(items => items.map((item, itemIndex) => itemIndex === index ? value : item))} placeholder={`Leitura anterior em ${unit}`} keyboardType="decimal-pad" />)}</View>}
        {readingLoading ? <Text style={styles.statusText}>Buscando leituras no servidor...</Text> : null}
        {readingError ? <Text style={styles.errorText}>{readingError}</Text> : null}
        <Text style={styles.cardTitle}>Leituras atuais</Text>
        {[0, 1].map(index => (
          <View key={index}>
            <Field label={names[index]} value={current[index]} onChangeText={value => setReading(index, value)} placeholder={`Leitura em ${unit}`} keyboardType="decimal-pad" />
            {!isWater ? <View style={styles.dateButton}><Button icon="calendar-outline" title="Buscar leitura por data" variant="secondary" onPress={() => openDatePicker(index)} />{readingDate[index] ? <Text style={styles.helper}>Data selecionada: {readingDate[index]}</Text> : null}{datePickerIndex === index ? <DateTimePicker value={readingDate[index] ? new Date(`${readingDate[index]}T12:00:00`) : new Date()} maximumDate={new Date()} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, date) => handleDatePickerChange(index, event, date)} /> : null}</View> : null}
          </View>
        ))}
        <Button disabled={loading} icon="calculator-outline" title={loading ? 'Salvando...' : 'Calcular divisão'} onPress={calculate} />
        <Button disabled={readingLoading} icon="refresh-outline" title="Atualizar leituras" variant="secondary" onPress={loadData} />
      </View>
      {result ? <ResultCard result={result} names={names} unit={unit} accent={accent} /> : null}
      <HistoryCard history={history} unit={unit} names={names} onExport={exportHistory} onDetails={onDetails} />
      <Modal animationType="fade" transparent visible={passwordModal} onRequestClose={() => setPasswordModal(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.cardTitle}>Acesso restrito</Text><Text style={styles.helper}>Para alterar as leituras anteriores, informe sua senha.</Text><Field label="Senha" value={password} onChangeText={setPassword} placeholder="Senha da conta" secureTextEntry />{passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}<Button icon="checkmark" title="Confirmar" onPress={verifyPreviousReadingAccess} /><Button icon="close" title="Cancelar" variant="secondary" onPress={() => setPasswordModal(false)} /></View></View>
      </Modal>
    </Screen>
  );
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  return Number(String(value ?? '').trim().replace(',', '.'));
}

function HistoryCard({ history, unit, names, onExport, onDetails }) {
  return (
    <View style={styles.resultCard}>
      <Text style={styles.cardTitle}>Histórico recente</Text>
      {!history.length ? <Text style={styles.helper}>Nenhum cálculo salvo ainda.</Text> : history.slice(0, 1).map((item, index) => (
        <TouchableOpacity key={`${item.data || 'registro'}-${index}`} style={styles.resultRow} onPress={() => onDetails(item.nome || names[0])} activeOpacity={0.7}>
          <View><Text style={styles.resultName}>{item.nome || 'Morador'}</Text><Text style={styles.helper}>{parseNumber(item.consumo).toFixed(2)} {unit}</Text></View>
          <Text style={styles.resultAmount}>R$ {parseNumber(item.valor).toFixed(2)}</Text>
        </TouchableOpacity>
      ))}
      <View style={styles.historyButton}><Button icon="document-text-outline" title="Exportar histórico PDF" variant="secondary" onPress={onExport} /></View>
    </View>
  );
}

function DetailScreen({ name, type, names, request, onBack, onSwitchType, onOpenSettings }) {
  const unit = type === 'water' ? 'm³' : 'kWh';
  const apiType = type === 'water' ? 'agua' : 'luz';
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    request(`/api/${apiType}/historico`)
      .then(items => setRecords(Array.isArray(items) ? items.filter(item => item.nome === name) : []))
      .catch(loadError => setError(loadError.message));
  }, [apiType, name]);

  const latest = records[0];
  return (
    <Screen>
      <Header title={name} subtitle={`Detalhes de ${type === 'water' ? 'água' : 'luz'}`} onBack={onBack} />
      <View style={styles.detailActions}>
        <Button icon="settings-outline" title="Configurações" variant="secondary" onPress={onOpenSettings} />
        <Button icon="flash-outline" title="Luz" variant={type === 'power' ? 'orange' : 'secondary'} onPress={() => onSwitchType('power')} />
        <Button icon="water-outline" title="Água" variant={type === 'water' ? 'primary' : 'secondary'} onPress={() => onSwitchType('water')} />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Último registro</Text>
        <Text style={styles.totalValue}>{latest ? `${parseNumber(latest.consumo).toFixed(2)} ${unit}` : '—'}</Text>
        <Text style={styles.helper}>{latest ? `R$ ${parseNumber(latest.valor).toFixed(2)} em ${formatDate(latest.data)}` : 'Ainda não há cálculos para este morador.'}</Text>
      </View>
      <View style={styles.resultCard}>
        <Text style={styles.cardTitle}>Histórico individual</Text>
        {records.length ? records.map((item, index) => <View key={`${item.data || 'registro'}-${index}`} style={styles.resultRow}><View><Text style={styles.resultName}>{formatDate(item.data)}</Text><Text style={styles.helper}>{parseNumber(item.consumo).toFixed(2)} {unit}</Text></View><Text style={styles.resultAmount}>R$ {parseNumber(item.valor).toFixed(2)}</Text></View>) : <Text style={styles.helper}>Nenhum registro encontrado.</Text>}
      </View>
      {type === 'power' && names.indexOf(name) < 2 ? <BathMonitorSection kitinete={names.indexOf(name) === 0 ? 'maior' : 'menor'} name={name} request={request} /> : null}
    </Screen>
  );
}

function BathMonitorSection({ kitinete, name, request }) {
  const [config, setConfig] = useState({});
  const [status, setStatus] = useState('Carregando monitor...');
  const [message, setMessage] = useState('');
  const [threshold, setThreshold] = useState('16');
  const [currentCode, setCurrentCode] = useState('cur_current');
  const [powerCode, setPowerCode] = useState('cur_power');
  const [currentDivisor, setCurrentDivisor] = useState('');
  const [powerDivisor, setPowerDivisor] = useState('');
  const [reportDates, setReportDates] = useState([monthStart(), today()]);
  const [report, setReport] = useState(null);
  const [day, setDay] = useState(today());
  const [dayData, setDayData] = useState(null);

  const refresh = async (fill = false) => {
    try {
      const data = await request(`/api/banhos/${kitinete}`);
      setConfig(data.config || {});
      if (fill) {
        setThreshold(String(data.config?.thresholdA ?? 16));
        setCurrentCode(data.config?.currentCode || 'cur_current');
        setPowerCode(data.config?.powerCode || 'cur_power');
        setCurrentDivisor(data.config?.currentDivisor ? String(data.config.currentDivisor) : '');
        setPowerDivisor(data.config?.powerDivisor ? String(data.config.powerDivisor) : '');
      }
      const sample = data.config?.sample;
      setStatus(!data.config?.enabled ? 'Monitoramento desativado.' : data.config?.error ? `Indisponível: ${data.config.error}` : sample ? `Corrente: ${parseNumber(sample.currentA).toFixed(2)} A | Potência: ${sample.powerW == null ? 'indisponível' : `${parseNumber(sample.powerW).toFixed(2)} W`} | ${formatDate(sample.at)}` : 'Aguardando uma leitura recente do dispositivo.');
    } catch (error) { setStatus(`Não foi possível consultar o monitor: ${error.message}`); }
  };

  useEffect(() => { refresh(true); }, [kitinete]);

  const save = async () => {
    try {
      const data = await request(`/api/banhos/${kitinete}`, { method: 'POST', body: JSON.stringify({ enabled: Boolean(config.enabled), thresholdA: parseNumber(threshold), currentCode: currentCode.trim(), powerCode: powerCode.trim(), currentDivisor: currentDivisor ? parseNumber(currentDivisor) : null, powerDivisor: powerDivisor ? parseNumber(powerDivisor) : null }) });
      setMessage(data.mensagem || 'Monitoramento salvo.');
      await refresh();
    } catch (error) { setMessage(error.message); }
  };

  const loadReport = async () => {
    try {
      const start = new Date(`${reportDates[0]}T00:00:00`);
      const end = new Date(`${reportDates[1]}T00:00:00`); end.setDate(end.getDate() + 1);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error('Confira as datas.');
      setReport(await request(`/api/banhos-relatorio?kitinete=${kitinete}&inicio=${encodeURIComponent(start.toISOString())}&fim=${encodeURIComponent(end.toISOString())}`));
    } catch (error) { setMessage(error.message); }
  };

  const loadDay = async () => {
    try {
      const start = new Date(`${day}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + 1);
      setDayData(await request(`/api/consumo-dia/${kitinete}?inicio=${encodeURIComponent(start.toISOString())}&fim=${encodeURIComponent(end.toISOString())}`));
    } catch (error) { setMessage(error.message); }
  };

  const exportReport = async () => {
    if (!report) return;
    const rows = (report.events || []).map(item => `<tr><td>${formatDate(item.start)}</td><td>${formatDate(item.end)}</td><td>${parseNumber(item.energyKwh).toFixed(2)} kWh</td><td>${parseNumber(item.peakA).toFixed(2)} A</td></tr>`).join('');
    try { await Print.printAsync({ html: `<html><body><h1>Relatório de banhos - ${name}</h1><table border="1" cellpadding="6"><tr><th>Início</th><th>Fim</th><th>Consumo</th><th>Pico</th></tr>${rows}</table></body></html>` }); } catch (error) { setMessage(error.message); }
  };

  return (
    <View style={styles.resultCard}>
      <Text style={styles.cardTitle}>Monitor de banhos prováveis</Text>
      <Text style={styles.helper}>Detecta corrente acima do limite. Outros aparelhos podem disparar a detecção: o consumo estimado é do circuito inteiro durante o período, não exclusivamente do chuveiro.</Text>
      <Text style={styles.helper}>O backend precisa permanecer ligado. Consultas aproximadamente a cada 30 segundos, sujeitas ao atraso de atualização da Tuya. Falhas interrompem a ocorrência; o tempo sem dados não é contado.</Text>
      <View style={styles.toggleRow}><Text style={styles.label}>Ativar monitoramento desta kitinete</Text><TouchableOpacity onPress={() => setConfig(value => ({ ...value, enabled: !value.enabled }))} style={[styles.toggle, config.enabled && styles.toggleOn]}><Text style={styles.toggleText}>{config.enabled ? 'SIM' : 'NÃO'}</Text></TouchableOpacity></View>
      <Text style={styles.sectionLabel}>CAMPOS DE MEDIÇÃO TUYA</Text>
      <Text style={styles.helper}>A escala e a unidade são lidas da especificação do dispositivo. Use divisores apenas se souber a conversão: valor bruto ÷ divisor = amperes ou watts. Se os campos não estiverem disponíveis, o monitor informará o problema.</Text>
      <Field label="Limite de corrente (A)" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" />
      <Field label="DP de corrente" value={currentCode} onChangeText={setCurrentCode} />
      <Field label="Divisor para amperes (opcional)" value={currentDivisor} onChangeText={setCurrentDivisor} keyboardType="decimal-pad" />
      <Field label="DP de potência" value={powerCode} onChangeText={setPowerCode} />
      <Field label="Divisor para watts (opcional)" value={powerDivisor} onChangeText={setPowerDivisor} keyboardType="decimal-pad" />
      <Button icon="save-outline" title="Salvar monitoramento" onPress={save} />
      <Text style={styles.statusText}>{status}</Text>
      {message ? <Text style={styles.helper}>{message}</Text> : null}
      <Button icon="refresh-outline" title="Atualizar monitor" variant="secondary" onPress={() => refresh()} />
      <Text style={styles.cardTitle}>Relatório de banhos</Text>
      <Field label="De" value={reportDates[0]} onChangeText={value => setReportDates(items => [value, items[1]])} placeholder="AAAA-MM-DD" />
      <Field label="Até (inclusive)" value={reportDates[1]} onChangeText={value => setReportDates(items => [items[0], value])} placeholder="AAAA-MM-DD" />
      <Button icon="stats-chart-outline" title="Gerar relatório" variant="secondary" onPress={loadReport} />
      <Text style={styles.helper}>Inclui ocorrências encerradas ou interrompidas cujo início está no período selecionado. Energia calculada pela integração da potência ativa entre amostras. Sem potência disponível, o consumo aparece como parcial ou indisponível.</Text>
      {report ? <View style={styles.reportBox}><Text style={styles.helper}>{report.events?.length || 0} ocorrências | {parseNumber(report.totalKwh).toFixed(2)} kWh conhecidos</Text><View style={styles.tableHeader}><Text style={styles.tableHeaderText}>Kitinete / morador</Text><Text style={styles.tableHeaderText}>Início</Text><Text style={styles.tableHeaderText}>Fim</Text><Text style={styles.tableHeaderText}>Duração observada</Text><Text style={styles.tableHeaderText}>Consumo estimado</Text><Text style={styles.tableHeaderText}>Custo estimado</Text><Text style={styles.tableHeaderText}>Pico (A)</Text><Text style={styles.tableHeaderText}>Limite (A)</Text><Text style={styles.tableHeaderText}>Estado</Text></View>{(report.events || []).map((item, index) => <View key={index} style={styles.tableRow}><Text style={styles.tableCell}>{name} / {name}</Text><Text style={styles.tableCell}>{formatDate(item.start)}</Text><Text style={styles.tableCell}>{formatDate(item.end)}</Text><Text style={styles.tableCell}>{formatDuration(item.seconds)}</Text><Text style={styles.tableCell}>{item.energyKwh == null ? 'Indisponível' : `${parseNumber(item.energyKwh).toFixed(2)} kWh`}</Text><Text style={styles.tableCell}>{item.cost == null ? 'Indisponível' : `R$ ${parseNumber(item.cost).toFixed(2)}`}</Text><Text style={styles.tableCell}>{parseNumber(item.peakA).toFixed(2)}</Text><Text style={styles.tableCell}>{parseNumber(item.thresholdA).toFixed(2)}</Text><Text style={styles.tableCell}>{item.status === 'concluido' ? 'Concluído' : `Interrompido: ${item.reason || 'Intervalo sem dados'}`}</Text></View>)}<Button icon="download-outline" title="Exportar relatório" variant="secondary" onPress={exportReport} /></View> : null}
      <Text style={styles.cardTitle}>Consumo por hora</Text>
      <Text style={styles.helper}>Comparação por hora, apenas com pelo menos 90% do período monitorado e duas horas comparáveis. Horas sem dados não representam consumo zero. A coleta começa com o monitor ativo; não há recuperação retroativa.</Text>
      <Field label="Dia (AAAA-MM-DD)" value={day} onChangeText={setDay} />
      <Button icon="time-outline" title="Consultar dia" variant="secondary" onPress={loadDay} />
      {dayData ? <View style={styles.reportBox}><View style={styles.tableHeader}><Text style={styles.tableHeaderText}>Horário</Text><Text style={styles.tableHeaderText}>Consumo estimado</Text><Text style={styles.tableHeaderText}>Custo estimado</Text><Text style={styles.tableHeaderText}>Tempo com dados</Text><Text style={styles.tableHeaderText}>Comparação</Text></View>{(dayData.hours || []).map((hour, index) => <View key={index} style={styles.tableRow}><Text style={styles.tableCell}>{new Date(hour.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {new Date(hour.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text><Text style={styles.tableCell}>{hour.energyKwh == null ? 'Sem dados' : `${parseNumber(hour.energyKwh).toFixed(2)} kWh`}</Text><Text style={styles.tableCell}>{hour.cost == null ? 'Indisponível' : `R$ ${parseNumber(hour.cost).toFixed(2)}`}</Text><Text style={styles.tableCell}>{formatDuration(hour.seconds)}</Text><Text style={styles.tableCell}>{hour.rank === 'maior' ? 'Maior consumo' : hour.rank === 'menor' ? 'Menor consumo' : hour.rank === 'igual' ? 'Consumos iguais' : hour.complete ? 'Comparável' : 'Dados insuficientes'}</Text></View>)}</View> : null}
    </View>
  );
}

function today() {
  return localDate(new Date());
}

function monthStart() {
  const date = new Date();
  return localDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '—';
  return `${Math.floor(value / 60)} min ${Math.floor(value % 60)} s`;
}

function formatDate(value) {
  if (!value) return 'Data indisponível';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('pt-BR');
}

function ResultCard({ result, names, unit, accent }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeading}><Ionicons name="checkmark-circle" size={24} color={COLORS.green} /><Text style={styles.cardTitle}>Resultado</Text></View>
      <Text style={styles.totalValue}>R$ {result.total.toFixed(2)}</Text>
      <Text style={styles.helper}>Tarifa média: R$ {result.price.toFixed(2)} / {unit}</Text>
      {names.map((name, index) => <View key={name} style={styles.resultRow}><View><Text style={styles.resultName}>{name}</Text><Text style={styles.helper}>{result.consumption[index].toFixed(2)} {unit}</Text></View><Text style={[styles.resultAmount, { color: accent }]}>R$ {result.values[index].toFixed(2)}</Text></View>)}
    </View>
  );
}

function SettingsScreen({ names, setNames, request, onBack }) {
  const [draft, setDraft] = useState(names);
  const [device1, setDevice1] = useState('');
  const [device2, setDevice2] = useState('');
  const save = async () => {
    if (draft.some(name => !name.trim())) return Alert.alert('Nomes obrigatórios', 'Informe os três moradores.');
    setNames(draft.map(name => name.trim()));
    if (device1.trim() && device2.trim()) {
      try { await request('/api/tuya/config', { method: 'POST', body: JSON.stringify({ pessoa1: { deviceId: device1.trim() }, pessoa2: { deviceId: device2.trim() } }) }); } catch (error) { Alert.alert('Nomes salvos', `A configuração Tuya não foi salva: ${error.message}`); return; }
    }
    Alert.alert('Tudo certo', 'Configurações salvas.');
  };
  return (
    <Screen>
      <Header title="Configurações" subtitle="Personalize moradores e medidores." onBack={onBack} />
      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Moradores</Text>
        {draft.map((name, index) => <Field key={index} label={`Kitinete ${['maior', 'menor', 'superior'][index]}`} value={name} onChangeText={value => setDraft(items => items.map((item, itemIndex) => itemIndex === index ? value : item))} placeholder="Nome do morador" />)}
        <Text style={styles.cardTitle}>Medidores Tuya</Text>
        <Field label="Device ID 1" value={device1} onChangeText={setDevice1} placeholder="Opcional" />
        <Field label="Device ID 2" value={device2} onChangeText={setDevice2} placeholder="Opcional" />
        <Button icon="save-outline" title="Salvar configurações" onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  authWrap: { flex: 1 },
  content: { padding: 22, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 },
  backButton: { padding: 4, marginRight: 12, marginTop: 17 },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 15, marginTop: 7, lineHeight: 21 },
  homeHero: { paddingTop: 44, paddingBottom: 42 },
  logoMark: { alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 16, height: 58, justifyContent: 'center', marginBottom: 28, width: 58 },
  homeTitle: { color: COLORS.text, fontSize: 38, fontWeight: '800', lineHeight: 43, maxWidth: 320 },
  homeSubtitle: { color: COLORS.muted, fontSize: 17, lineHeight: 25, marginTop: 16, maxWidth: 320 },
  stack: { gap: 12 },
  sectionLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  button: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 56, paddingHorizontal: 18 },
  button_primary: { backgroundColor: COLORS.green },
  button_secondary: { backgroundColor: COLORS.surfaceRaised, borderColor: COLORS.border, borderWidth: 1 },
  button_orange: { backgroundColor: COLORS.orange },
  button_danger: { backgroundColor: '#3a2024', borderColor: '#633036', borderWidth: 1 },
  buttonPressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  buttonTextPrimary: { color: COLORS.background },
  infoStrip: { alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, flexDirection: 'row', gap: 10, marginTop: 28, padding: 16 },
  infoText: { color: COLORS.muted, flex: 1, fontSize: 13, lineHeight: 18 },
  formCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, padding: 18 },
  field: { marginBottom: 17 },
  label: { color: COLORS.muted, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: COLORS.surfaceRaised, borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, color: COLORS.text, fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  cardTitle: { color: COLORS.text, fontSize: 18, fontWeight: '750', marginBottom: 17, marginTop: 3 },
  helper: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  statusText: { color: COLORS.blue, fontSize: 13, marginBottom: 14 },
  errorText: { color: COLORS.red, fontSize: 14, marginBottom: 15 },
  switchLink: { alignItems: 'center', padding: 22 },
  switchText: { color: COLORS.blue, fontSize: 14, fontWeight: '600' },
  accentLine: { borderRadius: 4, height: 4, marginBottom: 18, width: 54 },
  resultCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 18 },
  resultHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  totalValue: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: 4 },
  resultRow: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 15 },
  resultName: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  resultAmount: { fontSize: 17, fontWeight: '800' },
  historyButton: { marginTop: 18 },
  dateButton: { marginBottom: 17 },
  detailActions: { gap: 10, marginBottom: 18 },
  toggleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 17 },
  toggle: { backgroundColor: COLORS.surfaceRaised, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  toggleOn: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  toggleText: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  reportBox: { backgroundColor: COLORS.surfaceRaised, borderRadius: 12, gap: 8, marginVertical: 14, padding: 14 },
  tableHeader: { borderBottomColor: COLORS.border, borderBottomWidth: 1, gap: 4, paddingBottom: 8 },
  tableHeaderText: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  tableRow: { borderBottomColor: COLORS.border, borderBottomWidth: 1, gap: 3, paddingVertical: 9 },
  tableCell: { color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  modalBackdrop: { alignItems: 'center', backgroundColor: '#000000aa', flex: 1, justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, padding: 20, width: '100%' },
});
