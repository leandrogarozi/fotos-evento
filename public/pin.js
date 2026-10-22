// Olhinho para mostrar/esconder a senha (evita criar a senha errada sem perceber).
(function () {
  var EYE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 5.1A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/></svg>';
  window.initPins = function () {
    document.querySelectorAll('input.pin').forEach(function (inp) {
      if (inp.parentNode.classList.contains('pinwrap')) return;
      var w = document.createElement('div'); w.className = 'pinwrap';
      inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'eye';
      b.setAttribute('aria-label', 'Mostrar senha'); b.innerHTML = EYE;
      b.onclick = function () {
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.innerHTML = show ? EYE_OFF : EYE; b.classList.toggle('on', show);
        b.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
      };
      w.appendChild(b);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.initPins); else window.initPins();
})();
