# Calcular Gastos Mobile

Frontend Android em React Native/Expo para o backend existente.

## Executar

```powershell
cd mobile
npm install
npm run start:clear
```

Use `r` no terminal do Expo para recarregar o app. Se o Android continuar exibindo a tela antiga, feche o Expo Go completamente e leia novamente o QR Code.

### Celular Android conectado por USB

Com a depuração USB ativa e o backend rodando, execute:

```powershell
adb reverse tcp:3000 tcp:3000
npm run start:clear
```

O app usa `http://localhost:3000` e o `adb reverse` encaminha essa porta do celular para o backend no computador.

Para usar o emulador Android, inicie o Expo com:

```powershell
$env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:3000'
npm run start:clear
```

Sem USB, use o Expo Go na mesma rede do computador e defina `EXPO_PUBLIC_API_URL` com o IP local da máquina, por exemplo `http://192.168.0.10:3000`.

Para Android nativo, com o ambiente Android configurado:

```powershell
npm run android
```
