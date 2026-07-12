import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import App from './App.vue';
import router from './router';
import { loadMapSources } from './config/mapSources';
import { applyTheme, getTheme } from './utils/theme';
import './assets/styles/index.scss';

applyTheme(getTheme(window.localStorage), document.documentElement);

const bootstrap = async (): Promise<void> => {
  await loadMapSources();
  createApp(App).use(router).use(ElementPlus).mount('#app');
};

void bootstrap();
