import {ThemeProvider} from '@gravity-ui/uikit';
import {createRoot} from 'react-dom/client';
import App from './App';
import {EditorScreen, separateEditor} from './editorScreen';
import theme from './theme.json';
import '@gravity-ui/uikit/styles/styles.css';
import './styles.css';

async function mount() {
  const editorLaunch = separateEditor ? await EditorScreen.launchData() : undefined;
  createRoot(document.getElementById('root')!).render(
    <ThemeProvider theme="dark" rootClassName="qressi-dark">
      <style>{`.g-root.qressi-dark{${Object.entries(theme.variables)
        .map(([key, value]) => `${key}:${value}`)
        .join(';')}}`}</style>
      <App editorLaunch={editorLaunch} />
    </ThemeProvider>,
  );
}
void mount().catch(() => {
  document.getElementById('root')!.textContent =
    'Не удалось открыть редактор. Вернитесь назад и попробуйте ещё раз.';
});

if (import.meta.env.MODE !== 'native' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({registerSW}) => registerSW({immediate: false})).catch(() => {});
  });
}
