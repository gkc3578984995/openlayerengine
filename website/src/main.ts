import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import { loadMapSources } from './config/mapSources';
import './assets/styles/index.scss';

const bootstrap = async (): Promise<void> => {
  await loadMapSources();
  createApp(App).use(router).use(ElementPlus).mount('#app');
};

void bootstrap();
