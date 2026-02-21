import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.macrocore.app',
  appName: 'MacroCore',
  webDir: 'vanilla',
  ios: {
    contentInset: 'always',
    backgroundColor: '#111111',
    preferredContentMode: 'mobile',
    scrollEnabled: false,
  }
};

export default config;
