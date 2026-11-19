/* GRAVAR AGORA — ponte entre a página aberturaparashow.com.br/gravaragora (celular) e a extensão Abertura CRM.
   Instalar UMA vez, na conta Google do seu Drive:
   1. Abra script.google.com → Novo projeto → apague tudo e cole este arquivo inteiro → Salvar (nome: Gravar agora).
   2. Implantar → Nova implantação → tipo "App da Web" → Executar como: EU · Quem pode acessar: QUALQUER PESSOA → Implantar.
   3. Autorize (Avançado → Acessar) e copie o endereço que termina em /exec.
   4. Na extensão: aba CLIENTE → ⏺ REC → 📱 NO CELULAR → cole o endereço → SALVAR.
   A chave secreta é criada pela extensão no primeiro uso e fica guardada aqui (ninguém sem ela lê os textos nem envia áudio).
   As gravações ficam no seu Drive, na pasta "Abertura CRM - Gravações do celular/<pedido> <nome>/".
   LEGENDA (SRT): se a extensão mandou a chave do Groq (ela manda sozinha), cada gravação é transcrita pelo Whisper (whisper-large-v3-turbo)
   aqui mesmo — funciona com o PC desligado — e o .srt fica ao lado do WAV. ATUALIZOU ESTE ARQUIVO? Implantar → Gerenciar implantações →
   lápis → Versão: Nova versão → Implantar (o endereço /exec continua o mesmo). */
const PASTA = 'Abertura CRM - Gravações do celular';
function props_() { return PropertiesService.getScriptProperties(); }
function resp_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function chaveOk_(k) {
  const p = props_(), c = p.getProperty('CHAVE');
  if (!c) { if (k && String(k).length >= 24) { p.setProperty('CHAVE', String(k)); return true; } return false; }
  return String(k || '') === c;
}
function pasta_(pai, nome) { const it = pai.getFoldersByName(nome); return it.hasNext() ? it.next() : pai.createFolder(nome); }
function raiz_() { return pasta_(DriveApp.getRootFolder(), PASTA); }
function nome_(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Avulso'; }
function lerJson_(arq, padrao) { const it = raiz_().getFilesByName(arq); if (!it.hasNext()) return padrao; try { return JSON.parse(it.next().getBlob().getDataAsString('UTF-8')); } catch (e) { return padrao; } }
function gravarJson_(arq, obj) { const r = raiz_(), it = r.getFilesByName(arq), txt = JSON.stringify(obj); if (it.hasNext()) it.next().setContent(txt); else r.createFile(arq, txt, 'application/json'); }
// Whisper do Groq → SRT (frases de até ~7 palavras, tempos das palavras)
function legenda_(pasta, bytes, nome, dica) {
  const chave = props_().getProperty('GROQ'); if (!chave) return { erro: 'sem chave do Groq (abra a extensão uma vez para ela mandar)' };
  const payload = { file: Utilities.newBlob(bytes, 'audio/wav', 'voz.wav'), model: 'whisper-large-v3-turbo', language: 'pt', response_format: 'verbose_json', 'timestamp_granularities[]': 'word' };
  if (dica) payload.prompt = dica.slice(0, 600);
  const r = UrlFetchApp.fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'post', headers: { Authorization: 'Bearer ' + chave }, payload, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { erro: 'Groq ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 160) };
  const j = JSON.parse(r.getContentText()), ws = (j.words || []).filter(w => String(w.word || '').trim());
  const t = s => { const ms = Math.max(0, Math.round(s * 1000)), z = (n, k) => String(n).padStart(k, '0'); return z(Math.floor(ms / 3600000), 2) + ':' + z(Math.floor(ms / 60000) % 60, 2) + ':' + z(Math.floor(ms / 1000) % 60, 2) + ',' + z(ms % 1000, 3); };
  const blocos = []; let cur = [];
  ws.forEach((w, i) => { cur.push(w); const fimFrase = /[.!?…]$/.test(String(w.word).trim()), pausa = ws[i + 1] && ws[i + 1].start - w.end > 0.45; if (cur.length >= 7 || fimFrase || pausa || i === ws.length - 1) { blocos.push(cur); cur = []; } });
  let txt = blocos.map((b, i) => (i + 1) + '\n' + t(b[0].start) + ' --> ' + t(b[b.length - 1].end) + '\n' + b.map(w => String(w.word).trim()).join(' ') + '\n').join('\n');
  if (!txt && j.segments) txt = j.segments.map((s, i) => (i + 1) + '\n' + t(s.start) + ' --> ' + t(s.end) + '\n' + String(s.text).trim() + '\n').join('\n');
  if (!txt) return { erro: 'o Whisper não devolveu fala' };
  const it = pasta.getFilesByName(nome); if (it.hasNext()) it.next().setTrashed(true);
  const f = pasta.createFile(nome, txt, 'application/x-subrip');
  return { id: f.getId(), url: f.getUrl(), texto: txt };
}
function doGet(e) {
  const q = (e && e.parameter) || {};
  if (!chaveOk_(q.k)) return resp_({ ok: false, erro: 'chave inválida' });
  if (q.acao === 'textos') return resp_({ ok: true, lista: lerJson_('textos.json', []), agenda: lerJson_('agenda.json', []) });
  if (q.acao === 'arquivo') {   // 2.99.586: a extensão baixa o WAV/SRT gravado no celular (só arquivos da pasta das gravações)
    const f = DriveApp.getFileById(String(q.id || '')), pais = f.getParents(); let dentro = false;
    while (pais.hasNext()) { const p = pais.next(), avo = p.getParents(); if (p.getId() === raiz_().getId()) dentro = true; while (avo.hasNext()) if (avo.next().getId() === raiz_().getId()) dentro = true; }
    if (!dentro) return resp_({ ok: false, erro: 'arquivo fora da pasta das gravações' });
    const b = f.getBlob(); return resp_({ ok: true, nome: f.getName(), mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) });
  }
  if (q.acao === 'gravacoes') return resp_({ ok: true, lista: lerJson_('gravacoes.json', []).filter(g => !q.desde || g.em > Number(q.desde)) });
  return resp_({ ok: true, pronto: true });
}
function doPost(e) {
  let d = {}; try { d = JSON.parse(e.postData.contents); } catch (x) { return resp_({ ok: false, erro: 'pedido inválido' }); }
  if (!chaveOk_(d.k)) return resp_({ ok: false, erro: 'chave inválida' });
  if (d.acao === 'textos') { gravarJson_('textos.json', (d.lista || []).slice(0, 80)); if (d.agenda) gravarJson_('agenda.json', (d.agenda || []).slice(0, 100)); return resp_({ ok: true }); }
  if (d.acao === 'config') { if (d.groq) props_().setProperty('GROQ', String(d.groq)); return resp_({ ok: true, srt: !!props_().getProperty('GROQ') }); }
  if (d.acao === 'audio') {
    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      const sub = pasta_(raiz_(), nome_(d.pasta));
      const f = sub.createFile(Utilities.newBlob(Utilities.base64Decode(d.b64), d.mime || 'audio/wav', nome_(d.nome || 'Locução (celular).wav')));
      let srt = null;
      try { if (d.b64whisper) srt = legenda_(sub, Utilities.base64Decode(d.b64whisper), f.getName().replace(/\.wav$/i, '') + '.srt', String(d.dica || '')); } catch (x) { srt = { erro: String(x && x.message || x).slice(0, 200) }; }
      const g = lerJson_('gravacoes.json', []); g.push({ pedido: String(d.pedido || ''), arquivo: f.getName(), id: f.getId(), url: f.getUrl(), seg: Number(d.seg) || 0, em: Date.now(), srtId: srt && srt.id || '', srtUrl: srt && srt.url || '' });
      gravarJson_('gravacoes.json', g.slice(-300));
      return resp_({ ok: true, id: f.getId(), url: f.getUrl(), srt });
    } finally { lock.releaseLock(); }
  }
  return resp_({ ok: false, erro: 'ação desconhecida' });
}
