import '@vrsim/earth-engine-ol/style.css';
import { AcceptanceApp } from './app/AcceptanceApp.js';
import { scenarios } from './scenarios/index.js';
import './styles.scss';

declare const __ACCEPTANCE_SOURCE__: string;

const root = document.querySelector<HTMLElement>('#app');
if (root === null) throw new Error('缺少验收台根节点 #app');

new AcceptanceApp(root, scenarios, __ACCEPTANCE_SOURCE__).mount();
