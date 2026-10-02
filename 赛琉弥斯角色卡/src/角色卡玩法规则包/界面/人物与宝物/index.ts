import $ from 'jquery';
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

$(() => {
  const app = createApp(App);
  app.mount('#treasure-ui');
  $(window).one('pagehide', () => app.unmount());
});
