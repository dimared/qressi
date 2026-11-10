import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.qressi.mobile',
  appName: 'QRessi',
  webDir: 'dist-native',
  backgroundColor: '#202020',
  android: {allowMixedContent: false},
};

export default config;
