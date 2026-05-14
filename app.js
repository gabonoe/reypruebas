(function () {
  'use strict';

  const screens = document.querySelectorAll('.screen');

  function showScreen(id) {
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    // Notificar resize para que el canvas 3D se reajuste
    window.dispatchEvent(new Event('resize'));
  }

  document.getElementById('btn-comenzar').addEventListener('click', () => {
    showScreen('opciones');
  });

  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const target = btn.getAttribute('data-target');
      if (target) showScreen(target);
    });
  });

  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target') || 'opciones';
      showScreen(target);
    });
  });

  // Posicionar estrellas aleatoriamente en splash screen
  function positionStars() {
    const stars = document.querySelectorAll('.splash-particles .star');
    stars.forEach((star, index) => {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const delay = Math.random() * 2;
      const size = 15 + Math.random() * 20; // 15-35px
      star.style.left = x + '%';
      star.style.top = y + '%';
      star.style.animationDelay = delay + 's';
      star.style.width = size + 'px';
      star.style.height = size + 'px';
    });
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    positionStars();
    // Check for hash navigation
    const hash = window.location.hash.substring(1);
    if (hash) {
      showScreen(hash);
    }
  }

})();
