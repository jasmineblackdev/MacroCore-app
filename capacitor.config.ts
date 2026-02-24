import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.macrocore.app',
  appName: 'MacroCore',
  webDir: 'vanilla',
  ios: {
    contentInset: 'never',
    backgroundColor: '#111111',
    scrollEnabled: false,
  },
};

export default config;
