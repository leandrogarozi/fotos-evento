// Textos editáveis: *asterisco* destaca (verde nos títulos, negrito nos textos); {nome} vira o nome do atleta.
(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var prep = function (s, vars) { s = String(s == null ? '' : s); if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); }); return esc(s).replace(/\n/g, '<br>'); };
  window.tTitle = function (s, vars) { return prep(s, vars).replace(/\*([^*]+)\*/g, '<em>$1</em>'); };
  window.tLead = function (s, vars) { return prep(s, vars).replace(/\*([^*]+)\*/g, '<b>$1</b>'); };
})();
