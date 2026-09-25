// Page-specific behaviour for settings.html
(function () {
  /* Scroll spy — highlights the tab of the section currently in view */
  const links = document.querySelectorAll('.s-navigation--item');
  const spy = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) links.forEach(l => l.classList.toggle('is-selected', l.hash === '#' + e.target.id));
  }), { rootMargin: '-80px 0px -75% 0px' });
  document.querySelectorAll('section[id]').forEach(s => spy.observe(s));

  /* Theme switcher — toggles the body class that tokens.css keys off of */
  document.querySelectorAll('input[name="theme"]').forEach(r => r.addEventListener('change', () =>
    document.body.classList.toggle('theme-dark', document.getElementById('theme-dark').checked)));
})();