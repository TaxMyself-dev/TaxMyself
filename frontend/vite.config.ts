import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@ionic/core',
      '@ionic/core/loader',
      'ionicons',
      '@ionic/angular',
      'ion-menu',
      'ion-app',
      'ion-toast',
      'ion-item',
      'ion-button',
      'ion-card',
      'ion-input'
    ]
  }
});
