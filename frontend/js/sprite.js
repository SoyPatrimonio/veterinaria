/* ============================================================
   Sprite de iconos SVG compartido por todas las páginas del panel.
   Se inyecta una sola vez al cargar; después se usan con
   <svg class="icon"><use href="#icon-paw"/></svg>
   ============================================================ */

(function () {
  'use strict';

  const LINEA = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

  const SPRITE = `
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <defs>
    <symbol id="icon-paw" viewBox="0 0 24 24"><path d="M7 10.5c1.1 0 2-1.12 2-2.5S8.1 5.5 7 5.5 5 6.62 5 8s.9 2.5 2 2.5Zm10 0c1.1 0 2-1.12 2-2.5S18.1 5.5 17 5.5s-2 1.12-2 2.5.9 2.5 2 2.5ZM10 7c1.1 0 2-1.12 2-2.5S11.1 2 10 2 8 3.12 8 4.5 8.9 7 10 7Zm4 0c1.1 0 2-1.12 2-2.5S15.1 2 14 2s-2 1.12-2 2.5S12.9 7 14 7ZM12 12c-3.5 0-7 2.5-7 6.2 0 2 1.7 3.3 3.7 3.3 1.4 0 2.1-.6 3.3-.6s1.9.6 3.3.6c2 0 3.7-1.3 3.7-3.3 0-3.7-3.5-6.2-7-6.2Z"/></symbol>
    <symbol id="icon-cross" viewBox="0 0 24 24"><path d="M10 2h4v6h6v4h-6v10h-4V12H4V8h6V2z"/></symbol>
    <symbol id="icon-stetho" viewBox="0 0 24 24" ${LINEA}><path d="M5 3v6a4 4 0 0 0 8 0V3"/><path d="M17 3v4"/><path d="M13 9v3a6 6 0 0 0 6 6 3 3 0 1 0-1-5.83"/><circle cx="19" cy="18" r="0.4"/></symbol>
    <symbol id="icon-syringe" viewBox="0 0 24 24" ${LINEA}><path d="m18 3 3 3M8 13 4 17l3 3 4-4M11 10l3 3M14 7l3 3M6.5 15.5 3 19M17 4l-9.5 9.5"/></symbol>
    <symbol id="icon-heart" viewBox="0 0 24 24" ${LINEA}><path d="M12 20s-7-4.5-9.5-9C.7 7.4 2.7 4 6 4c2 0 3.3 1 4 2 .7-1 2-2 4-2 3.3 0 5.3 3.4 3.5 7-2.5 4.5-9.5 9-9.5 9Z"/><path d="M4 12h3l2-3 2 5 2-4h3"/></symbol>
    <symbol id="icon-house" viewBox="0 0 24 24" ${LINEA}><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></symbol>
    <symbol id="icon-micro" viewBox="0 0 24 24" ${LINEA}><path d="M9 3h4v6a2 2 0 1 1-4 0V3Z"/><path d="M7 11a4 4 0 0 0 8 0"/><path d="M11 15v3M8 21h6"/></symbol>
    <symbol id="icon-scissors" viewBox="0 0 24 24" ${LINEA}><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 7.5 20 19M8.5 16.5 20 5"/></symbol>
    <symbol id="icon-shield" viewBox="0 0 24 24" ${LINEA}><path d="M12 3 4 6v6c0 5 3.4 7.6 8 9 4.6-1.4 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></symbol>
    <symbol id="icon-calendar" viewBox="0 0 24 24" ${LINEA}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></symbol>
    <symbol id="icon-clock" viewBox="0 0 24 24" ${LINEA}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></symbol>
    <symbol id="icon-pin" viewBox="0 0 24 24" ${LINEA}><path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></symbol>
    <symbol id="icon-phone" viewBox="0 0 24 24" ${LINEA}><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 4Z"/></symbol>
    <symbol id="icon-bone" viewBox="0 0 24 24" ${LINEA}><path d="M4.5 8.5a2.2 2.2 0 1 1 3.6-2.4l7.8 7.8a2.2 2.2 0 1 1-2.4 3.6 2.2 2.2 0 1 1-3.6 2.4l-7.8-7.8a2.2 2.2 0 1 1 2.4-3.6Z"/></symbol>
    <symbol id="icon-user" viewBox="0 0 24 24" ${LINEA}><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/></symbol>
    <symbol id="icon-users" viewBox="0 0 24 24" ${LINEA}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c1-3.4 3.4-5.2 6.5-5.2s5.5 1.8 6.5 5.2"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 14.5c2.2.6 3.6 2.3 4 5"/></symbol>
    <symbol id="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5.5 5.5L20 7"/></symbol>
    <symbol id="icon-chevron" viewBox="0 0 24 24" ${LINEA}><path d="m6 9 6 6 6-6"/></symbol>
    <symbol id="icon-izquierda" viewBox="0 0 24 24" ${LINEA}><path d="M15 5 8 12l7 7"/></symbol>
    <symbol id="icon-derecha" viewBox="0 0 24 24" ${LINEA}><path d="m9 5 7 7-7 7"/></symbol>
    <symbol id="icon-mas" viewBox="0 0 24 24" ${LINEA}><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="icon-lapiz" viewBox="0 0 24 24" ${LINEA}><path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m14 6 4 4"/></symbol>
    <symbol id="icon-basura" viewBox="0 0 24 24" ${LINEA}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></symbol>
    <symbol id="icon-salir" viewBox="0 0 24 24" ${LINEA}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8 6 12l4 4M6 12h9"/></symbol>
    <symbol id="icon-grafica" viewBox="0 0 24 24" ${LINEA}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></symbol>
    <symbol id="icon-caja" viewBox="0 0 24 24" ${LINEA}><path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z"/><path d="m4 7.2 8 4.3 8-4.3M12 11.5V21"/></symbol>
    <symbol id="icon-recibo" viewBox="0 0 24 24" ${LINEA}><path d="M5 3h14v18l-2.3-1.6L14.4 21l-2.4-1.6L9.6 21l-2.3-1.6L5 21V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/></symbol>
    <symbol id="icon-ajustes" viewBox="0 0 24 24" ${LINEA}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></symbol>
    <symbol id="icon-alerta" viewBox="0 0 24 24" ${LINEA}><path d="M10.3 4 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></symbol>
    <symbol id="icon-buscar" viewBox="0 0 24 24" ${LINEA}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
    <symbol id="icon-carpeta" viewBox="0 0 24 24" ${LINEA}><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></symbol>
    <symbol id="icon-panel" viewBox="0 0 24 24" ${LINEA}><rect x="3" y="3" width="7.5" height="8" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="3" y="14" width="7.5" height="7" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/></symbol>
  </defs>
</svg>`;

  function inyectar() {
    if (document.getElementById('huella-sprite')) return;
    const contenedor = document.createElement('div');
    contenedor.id = 'huella-sprite';
    contenedor.style.display = 'none';
    contenedor.innerHTML = SPRITE;
    document.body.insertBefore(contenedor, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inyectar);
  } else {
    inyectar();
  }
})();
