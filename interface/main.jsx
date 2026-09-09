import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/* Service worker : permet à l'application de fonctionner sans réseau — un IME
   n'a pas forcément du wifi partout. Enregistré après le chargement pour ne
   pas ralentir le premier affichage. La liste des fichiers à mettre en cache
   n'est pas dictée par la page : le build (vite.config.js,
   scripts/precache.mjs) l'injecte directement dans sw.js. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || './';
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      /* Sans HTTPS, l'enregistrement échoue : l'application fonctionne quand
         même, mais sans mode hors connexion. */
    });
  });
}
