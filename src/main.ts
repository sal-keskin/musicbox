import './ui/styles.css';
import { App } from './app';

const app = new App();
// Tarayıcı konsolundan denemeler için
(window as unknown as { musicbox: App }).musicbox = app;
