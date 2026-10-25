// Favoritas salvas: a pessoa guarda as fotos marcadas (coraçãozinho) com WhatsApp + senha e continua depois, em qualquer aparelho.
// Fav.openSave({ e, ids, A, onSaved }), Fav.openOpen({ e, onLoaded(data) }), Fav.sync(e, ids, A), Fav.has(e)
(function () {
  const CSS = `
.fv-ov{position:fixed;inset:0;z-index:85;background:rgba(20,20,20,.45);display:flex;align-items:flex-end;justify-content:center}
.fv-sheet{position:relative;background:#fff;width:100%;max-width:460px;max-height:94vh;overflow:auto;border-radius:28px 28px 0 0;padding:20px 22px calc(22px + env(safe-area-inset-bottom))}
@media(min-width:700px){.fv-ov{align-items:center}.fv-sheet{border-radius:28px}}
.fv-x{position:absolute;top:12px;right:14px;width:36px;height:36px;min-height:0;padding:0;border-radius:50%;background:var(--card2,#eee);color:var(--ink,#141414);font-size:16px}
.fv-sheet h2{font-size:26px;margin:2px 36px 8px 0}
.fv-sheet p.sm{font-size:13.5px;color:var(--mute,#666);margin-bottom:6px;line-height:1.45}
.fv-go{width:100%;margin-top:16px;background:var(--lime,#a2ff01);color:var(--ink,#141414);font-weight:800}
.fv-msg{font-size:13.5px;margin-top:10px;min-height:20px;text-align:center}.fv-msg.err{color:var(--err,#a8392b)}
`;
  const key = (e) => 'favtok:' + (e || 'principal');
  const get = (e) => { try { return localStorage.getItem(key(e)) || ''; } catch (_) { return ''; } };
  const put = (e, t) => { try { localStorage.setItem(key(e), t); } catch (_) {} };
  const post = async (body) => { const r = await fetch('/api/favoritas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erro'); return d; };
  let timer;
  function sync(e, ids, A) { const t = get(e); if (!t) return; clearTimeout(timer); timer = setTimeout(() => { post({ action: 'sincronizar', e: e || '', token: t, ids, athleteId: A || 0 }).catch(() => {}); }, 900); }

  function sheet(html, onReady) {
    if (!document.getElementById('fv-css')) { const st = document.createElement('style'); st.id = 'fv-css'; st.textContent = CSS; document.head.appendChild(st); }
    const ov = document.createElement('div'); ov.className = 'fv-ov';
    ov.innerHTML = `<div class="fv-sheet"><button class="fv-x" aria-label="Fechar">✕</button>${html}</div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('.fv-x').onclick = close; ov.addEventListener('click', (x) => { if (x.target === ov) close(); });
    onReady(ov, close); return close;
  }
  const fields = (withName) => `${withName ? '<label>Seu nome</label><input id="fv-name" autocomplete="name">' : ''}
    <label>Seu WhatsApp (com DDD)</label><input id="fv-wpp" type="tel" inputmode="tel" autocomplete="tel" placeholder="27 99999-9999">
    <label>${withName ? 'Crie uma senha de 4 a 6 números' : 'Sua senha de 4 a 6 números'}</label><input id="fv-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="${withName ? 'new-password' : 'current-password'}" placeholder="Ex.: 1234">`;

  function openSave(o) {
    sheet(`<h2>Salvar minhas <em>favoritas</em></h2>
      <p class="sm">Guardamos a lista das fotos que você marcou (só a lista, com o seu nome e WhatsApp) para você continuar depois, em qualquer aparelho. Depois de salvar, ela se atualiza sozinha toda vez que você marcar ou desmarcar uma foto.</p>
      ${fields(true)}<button class="fv-go" id="fv-go">Salvar (${o.ids.length} foto${o.ids.length === 1 ? '' : 's'})</button><div class="fv-msg" id="fv-msg"></div>`, (ov, close) => {
      const $ = (id) => ov.querySelector('#' + id);
      try { $('fv-wpp').value = localStorage.getItem('wpp') || ''; } catch (_) {}
      $('fv-go').onclick = async () => {
        $('fv-go').disabled = true; $('fv-msg').className = 'fv-msg'; $('fv-msg').textContent = 'Salvando...';
        try {
          const d = await post({ action: 'salvar', e: o.e || '', name: $('fv-name').value, whatsapp: $('fv-wpp').value, pin: $('fv-pin').value, ids: o.ids, athleteId: o.A || 0 });
          put(o.e, d.token); try { localStorage.setItem('wpp', $('fv-wpp').value); } catch (_) {}
          $('fv-msg').textContent = '✓ Favoritas salvas! Para abrir de novo: botão "Minhas favoritas", com seu WhatsApp e a senha.';
          if (o.onSaved) o.onSaved(); setTimeout(close, 1800);
        } catch (e) { $('fv-msg').className = 'fv-msg err'; $('fv-msg').textContent = e.message; $('fv-go').disabled = false; }
      };
    });
  }

  function openOpen(o) {
    sheet(`<h2>Minhas <em>favoritas</em></h2>
      <p class="sm">Entre com o WhatsApp e a senha que você criou quando salvou as suas favoritas.</p>
      ${fields(false)}<button class="fv-go" id="fv-go">Abrir minhas favoritas</button><div class="fv-msg" id="fv-msg"></div>`, (ov, close) => {
      const $ = (id) => ov.querySelector('#' + id);
      try { $('fv-wpp').value = localStorage.getItem('wpp') || ''; } catch (_) {}
      $('fv-go').onclick = async () => {
        $('fv-go').disabled = true; $('fv-msg').className = 'fv-msg'; $('fv-msg').textContent = 'Abrindo...';
        try {
          const d = await post({ action: 'abrir', e: o.e || '', whatsapp: $('fv-wpp').value, pin: $('fv-pin').value });
          put(o.e, d.token); try { localStorage.setItem('wpp', $('fv-wpp').value); } catch (_) {}
          close(); o.onLoaded(d);
        } catch (e) { $('fv-msg').className = 'fv-msg err'; $('fv-msg').textContent = e.message; $('fv-go').disabled = false; }
      };
    });
  }
  window.Fav = { openSave, openOpen, sync, has: (e) => !!get(e) };
})();
