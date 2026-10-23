// Busca por rosto (selfie). O reconhecimento roda no celular: a foto nunca vai para o servidor,
// só os 128 números do rosto. Uso: Rosto.open({ e: 'slug', athletes: [...], athleteId, onDone(ids, athleteId) }).
(function () {
  const CSS = `
.rs-ov{position:fixed;inset:0;z-index:80;background:rgba(36,39,35,.4);display:flex;align-items:flex-end;justify-content:center}
.rs-sheet{position:relative;background:var(--white,#fff);width:100%;max-width:480px;max-height:94vh;overflow:auto;border-radius:28px 28px 0 0;padding:14px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -10px 40px rgba(0,0,0,.18)}
@media(min-width:700px){.rs-ov{align-items:center}.rs-sheet{border-radius:28px}}
.rs-grab{width:40px;height:4px;border-radius:3px;background:var(--line,#d3d6cc);margin:0 auto 12px}
.rs-x{position:absolute;top:12px;right:14px;width:36px;height:36px;min-height:0;padding:0;border-radius:50%;background:var(--card2,#eee);color:var(--ink,#222);font-size:16px}
.rs-eye{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute,#666);font-weight:700}
.rs-sheet h2{font-size:24px;line-height:1.15;margin:4px 34px 12px 0}
.rs-seg{display:flex;background:var(--card2,#eee);border-radius:14px;padding:3px;margin-bottom:12px}
.rs-seg button{flex:1;min-height:36px;border-radius:11px;background:transparent;color:var(--mute,#666);font-size:13px;padding:0}
.rs-seg button.on{background:var(--white,#fff);color:var(--ink,#222);box-shadow:0 1px 4px rgba(0,0,0,.12)}
.rs-stage{position:relative;height:290px;border-radius:22px;overflow:hidden;background:linear-gradient(170deg,#8d9684,#4a5344);display:flex;align-items:center;justify-content:center}
.rs-stage video,.rs-stage canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.rs-stage video{transform:scaleX(-1)}
.rs-oval{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:150px;height:200px;border:2.5px dashed rgba(255,255,255,.92);border-radius:50%;pointer-events:none}
.rs-shot{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:rgba(255,255,255,.94);color:#222;padding:0 18px;min-height:40px;border-radius:24px;font-size:14px}
.rs-pick{color:#fff;text-align:center;font-size:14px;padding:20px;position:relative}
.rs-pick label{display:inline-flex;margin:12px 0 0;align-items:center;justify-content:center;background:rgba(255,255,255,.94);color:#222;padding:0 18px;min-height:42px;border-radius:24px;font-size:14px;font-weight:600;cursor:pointer}
.rs-tip{font-size:12.5px;color:var(--mute,#666);text-align:center;margin:10px 0 4px;line-height:1.4}
.rs-sheet label.l{margin:12px 0 5px}
.rs-agree{display:flex;gap:9px;align-items:flex-start;background:var(--card2,#eee);border-radius:14px;padding:11px 12px;font-size:12.5px;line-height:1.4;margin:12px 0}
.rs-agree input{margin-top:2px;flex:none}
.rs-go{width:100%;background:var(--lime,#a2ff01);color:var(--ink,#141414);font-weight:800}
.rs-msg{font-size:13.5px;line-height:1.45;margin-top:10px;text-align:center;min-height:20px}
.rs-msg.err{color:var(--err,#a8392b)}
.rs-msg button{margin-top:8px}
`;
  let libP = null;
  function loadLib() {
    if (libP) return libP;
    libP = new Promise((ok, fail) => {
      if (window.faceapi) return ok(window.faceapi);
      const s = document.createElement('script'); s.src = '/vendor/face-api.js'; s.onload = () => ok(window.faceapi); s.onerror = () => fail(new Error('script'));
      document.head.appendChild(s);
    }).then(async (f) => {
      // Celulares usam a placa de vídeo (webgl); se não houver, cai para o processador comum.
      let gl = false; try { gl = await f.tf.setBackend('webgl'); } catch (_) {}
      if (!gl) await f.tf.setBackend('cpu');
      await f.tf.ready();
      await Promise.all([f.nets.tinyFaceDetector.loadFromUri('/vendor/models'), f.nets.faceLandmark68Net.loadFromUri('/vendor/models'), f.nets.faceRecognitionNet.loadFromUri('/vendor/models')]);
      return f;
    }).catch((e) => { libP = null; throw e; });
    return libP;
  }

  // Todos os rostos da imagem, do maior para o menor, já com a impressão (128 números).
  async function describe(canvas) {
    const f = await loadLib();
    const r = await f.detectAllFaces(canvas, new f.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 })).withFaceLandmarks().withFaceDescriptors();
    return r.sort((a, b) => b.detection.box.area - a.detection.box.area).map((x) => ({ d: Array.from(x.descriptor), box: x.detection.box }));
  }

  async function fileToCanvas(file, max = 900) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) { const u = URL.createObjectURL(file); bmp = new Image(); bmp.src = u; await bmp.decode(); URL.revokeObjectURL(u); }
    const w0 = bmp.naturalWidth || bmp.width, h0 = bmp.naturalHeight || bmp.height, k = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c;
  }

  function open(opt) {
    if (!document.getElementById('rs-css')) { const st = document.createElement('style'); st.id = 'rs-css'; st.textContent = CSS; document.head.appendChild(st); }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ov = document.createElement('div'); ov.className = 'rs-ov';
    const options = (opt.athletes || []).map((a) => `<option value="${a.id}" ${opt.athleteId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    ov.innerHTML = `<div class="rs-sheet"><div class="rs-grab"></div><button class="rs-x" aria-label="Fechar">✕</button>
      <div class="rs-eye">Busca por rosto</div><h2>Suas fotos do evento em uma única busca</h2>
      <div class="rs-seg"><button data-m="cam" class="on">Tirar selfie</button><button data-m="up">Enviar foto</button></div>
      <div class="rs-stage" id="rs-stage"></div>
      <div class="rs-tip">Rosto de frente, boa luz, sem óculos escuro nem boné.</div>
      <label class="l">Seu nome na lista (se quiser, junto com a selfie)</label>
      <select id="rs-ath"><option value="">Não escolher agora</option>${options}</select>
      <label class="rs-agree"><input type="checkbox" id="rs-ok"><span>Autorizo usar esta foto só para esta busca. <b>Ela não é guardada nem sai do seu celular.</b></span></label>
      <button class="rs-go" id="rs-go" disabled>Buscar minhas fotos</button>
      <div class="rs-msg" id="rs-msg"></div></div>`;
    document.body.appendChild(ov);
    const $ = (id) => ov.querySelector('#' + id), stage = $('rs-stage'), msg = $('rs-msg');
    let stream = null, snap = null, mode = 'cam', busy = false;
    const say = (t, err) => { msg.className = 'rs-msg' + (err ? ' err' : ''); msg.innerHTML = t; };
    const stop = () => { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } };
    const close = () => { stop(); ov.remove(); };
    const refresh = () => { $('rs-go').disabled = busy || !snap || !$('rs-ok').checked; };

    function showSnap() {
      stop(); stage.innerHTML = ''; stage.appendChild(snap);
      const b = document.createElement('button'); b.className = 'rs-shot'; b.textContent = 'Refazer'; b.onclick = () => { snap = null; setMode(mode); }; stage.appendChild(b); refresh();
    }
    async function setMode(m) {
      mode = m; snap = null; stop(); say(''); refresh();
      ov.querySelectorAll('.rs-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      if (m === 'up') {
        stage.innerHTML = `<div class="rs-pick">Escolha uma foto sua, de frente e com o rosto bem visível.<br><label>Escolher foto<input type="file" accept="image/*" hidden id="rs-file"></label></div>`;
        $('rs-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { snap = await fileToCanvas(f); showSnap(); } catch (_) { say('Não consegui abrir essa foto. Tente outra.', true); } };
        return;
      }
      stage.innerHTML = '<div class="rs-pick">Abrindo a câmera...</div>';
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
      } catch (_) { stage.innerHTML = '<div class="rs-pick">Não consegui abrir a câmera.<br>Libere a câmera no navegador ou use <b>Enviar foto</b>.</div>'; return; }
      const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.srcObject = stream; await v.play().catch(() => {});
      stage.innerHTML = ''; stage.appendChild(v);
      const o = document.createElement('div'); o.className = 'rs-oval'; stage.appendChild(o);
      const b = document.createElement('button'); b.className = 'rs-shot'; b.textContent = '● Tirar foto';
      b.onclick = () => {
        const c = document.createElement('canvas'), k = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); snap = c; showSnap();
      };
      stage.appendChild(b);
    }

    async function go() {
      busy = true; refresh(); const athleteId = Number($('rs-ath').value) || 0;
      // Se a busca por rosto falhar, a pessoa ainda chega às fotos pelo nome (ou vê todas).
      const fallback = (text) => {
        say(text + `<br><button class="ghost small" id="rs-fb">${athleteId ? 'Ver as fotos pelo meu nome' : 'Ver todas as fotos'}</button>`, true);
        $('rs-fb').onclick = () => { close(); opt.onDone([], athleteId); };
      };
      try {
        say('Carregando o reconhecimento (só na primeira vez, pode levar alguns segundos)...');
        await loadLib();
        say('Procurando o seu rosto...');
        const faces = await describe(snap);
        if (!faces.length) { fallback('Não achei um rosto nessa foto. Tente de novo, de frente e com mais luz.'); return; }
        say('Buscando nas fotos do evento...');
        const r = await fetch('/api/rosto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ e: opt.e || '', d: faces[0].d }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erro');
        if (!d.ids.length && !(d.maybe || []).length) { fallback('Não achamos fotos suas pelo rosto.' + (athleteId ? '' : ' Escolha seu nome na lista acima e busque de novo, ou veja todas as fotos.')); return; }
        close(); opt.onDone(d.ids, athleteId, d.maybe || []);
      } catch (e) {
        fallback('Não consegui fazer a busca agora.');
      } finally { busy = false; refresh(); }
    }

    ov.querySelector('.rs-x').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelectorAll('.rs-seg button').forEach((b) => { b.onclick = () => setMode(b.dataset.m); });
    $('rs-ok').onchange = refresh; $('rs-go').onclick = go;
    setMode(opt.mode === 'up' ? 'up' : 'cam');
  }

  // Painel: acha TODOS os rostos da foto, inclusive de gente ao fundo. Em "completa", a foto grande é cortada em pedaços
  // (cada um analisado em boa resolução), senão rostos pequenos somem. Devolve [{ v: 128 números, w: largura em pixels da foto original }].
  async function scan(file, quality) {
    const f = await loadLib();
    if (!f.nets.ssdMobilenetv1.isLoaded) await f.nets.ssdMobilenetv1.loadFromUri('/vendor/models');
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) { const u = URL.createObjectURL(file); bmp = new Image(); bmp.src = u; await bmp.decode(); URL.revokeObjectURL(u); }
    const W0 = bmp.naturalWidth || bmp.width, H0 = bmp.naturalHeight || bmp.height;
    const full = quality === 'completa', k = Math.min(1, (full ? 3200 : 1600) / Math.max(W0, H0));
    const W = Math.round(W0 * k), H = Math.round(H0 * k);
    const big = document.createElement('canvas'); big.width = W; big.height = H; big.getContext('2d').drawImage(bmp, 0, 0, W, H); if (bmp.close) bmp.close();
    const T = full ? 1100 : Math.max(W, H), STEP = full ? 900 : T;
    const pos = (n) => { const a = []; for (let x = 0; ; x += STEP) { a.push(Math.max(0, Math.min(x, n - T))); if (x + T >= n) break; } return [...new Set(a)]; };
    const all = [], tc = document.createElement('canvas');
    for (const ty of pos(H)) for (const tx of pos(W)) {
      const tw = Math.min(T, W - tx), th = Math.min(T, H - ty); tc.width = tw; tc.height = th;
      tc.getContext('2d').drawImage(big, tx, ty, tw, th, 0, 0, tw, th);
      const r = await f.detectAllFaces(tc, new f.SsdMobilenetv1Options({ minConfidence: 0.4 })).withFaceLandmarks().withFaceDescriptors();
      for (const x of r) { const b = x.detection.box; if (b.width >= 24) all.push({ v: Array.from(x.descriptor), w: b.width, cx: tx + b.x + b.width / 2, cy: ty + b.y + b.height / 2 }); }
    }
    all.sort((a, b) => b.w - a.w);
    const kept = [];
    for (const a of all) if (!kept.some((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) < 0.6 * Math.max(a.w, b.w))) kept.push(a); // mesmo rosto visto em dois pedaços
    big.width = big.height = tc.width = tc.height = 1;
    return kept.slice(0, 16).map((x) => ({ v: x.v, w: Math.round(x.w / k) }));
  }

  window.Rosto = { open, describe, loadLib, fileToCanvas, scan };
})();
