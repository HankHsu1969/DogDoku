/* 汪汪數獨：合成音樂與音效（Web Audio API 即時合成，不使用任何音檔）
 * 音樂為多聲部編曲：Pad 和弦 + 貝斯 + 主旋律 + FM 鐘琴琶音 + 鼓組，並經過殘響與延遲效果。 */
(function () {
  'use strict';
  const A = {};
  let ctx = null, master, revIn, delayIn, delayNode, noiseBuf;
  let musicBus, sfxBus;
  const vol = { music: true, sfx: true, musicVol: 0.6, sfxVol: 0.85 };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (s) => (s === '#' ? 1 : s === 'b' ? -1 : 0);
  function n2m(s) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    return NOTE[m[1]] + acc(m[2]) + (parseInt(m[3], 10) + 1) * 12;
  }
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7], add9: [0, 4, 7, 14] };
  function chord(s) {
    const m = /^([A-G])(#|b)?(.*)$/.exec(s);
    const pc = (NOTE[m[1]] + acc(m[2]) + 12) % 12;
    let root = 48 + pc; if (root > 52) root -= 12; // pad 的根音落在 G#2~E3 附近，往上疊
    let bass = 36 + pc; if (pc > 7) bass -= 12;
    const iv = QUAL[m[3]] || QUAL[''];
    const pad = iv.map((x) => root + 12 + x);
    return { pc, pad, bass, tones: iv.map((x) => 60 + pc + x) };
  }
  // "E5:2 G5:2 -:4" → [{step, midi, len}]（以 16 分音符為單位）
  function line(str) {
    const out = []; let step = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, l] = tok.split(':'); const len = +l;
      if (n !== '-') out.push({ step, midi: n2m(n), len });
      step += len;
    }
    return out;
  }

  // ---------- 匯流排：dry / reverb send / delay send，三者一起受音量控制 ----------
  function makeBus(parent) {
    const b = { dry: ctx.createGain(), wet: ctx.createGain(), dly: ctx.createGain() };
    b.dry.connect(parent ? parent.dry : master);
    b.wet.connect(parent ? parent.wet : revIn);
    b.dly.connect(parent ? parent.dly : delayIn);
    return b;
  }
  function setBusGain(b, v, t = 0.05) {
    const now = ctx.currentTime;
    for (const g of [b.dry, b.wet, b.dly]) { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(v, now, t); }
  }
  function route(node, bus, wet = 0.2, dly = 0) {
    node.connect(bus.dry);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(bus.wet); }
    if (dly > 0) { const s = ctx.createGain(); s.gain.value = dly; node.connect(s); s.connect(bus.dly); }
  }
  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // 必須在使用者手勢內呼叫；回傳 Promise，resolve 後即可播放
  A.init = function () {
    if (ctx) return ctx.state === 'suspended' && !document.hidden ? ctx.resume() : Promise.resolve();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ctx.destination);

    const conv = ctx.createConvolver(); conv.buffer = makeIR(2.6, 3.2);
    revIn = ctx.createGain();
    const revOut = ctx.createGain(); revOut.gain.value = 0.9;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(master);

    delayIn = ctx.createGain();
    delayNode = ctx.createDelay(2); delayNode.delayTime.value = 0.38;
    const fb = ctx.createGain(); fb.gain.value = 0.33;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    delayIn.connect(delayNode); delayNode.connect(lp); lp.connect(fb); fb.connect(delayNode);
    const dOut = ctx.createGain(); dOut.gain.value = 0.5; lp.connect(dOut); dOut.connect(master);
    const dRev = ctx.createGain(); dRev.gain.value = 0.3; lp.connect(dRev); dRev.connect(revIn);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    musicBus = makeBus(null);
    sfxBus = makeBus(null);
    applyVolumes();
    setInterval(tick, 40);
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
    return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  };
  function applyVolumes() {
    if (!ctx) return;
    setBusGain(musicBus, vol.music ? vol.musicVol : 0, 0.08);
    setBusGain(sfxBus, vol.sfx ? vol.sfxVol : 0, 0.02);
  }
  A.configure = function (o) { Object.assign(vol, o); applyVolumes(); };
  // 除錯用：量測目前輸出音量（RMS）
  let analyser = null;
  A.level = function () {
    if (!ctx) return 0;
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser); }
    const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
    let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length);
  };
  A.unlocked = () => !!ctx && ctx.state === 'running';

  // ---------- 樂器 ----------
  function osc(type, f, t) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; }
  function noise(t, dur) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return s;
  }

  // 主旋律：方波+三角波，濾波器包絡與延遲顫音
  function lead(t, midi, dur, v, bus, opt = {}) {
    const f = mtof(midi);
    const o1 = osc(opt.wave || 'square', f, t), o2 = osc('triangle', f, t);
    o2.detune.value = 7;
    const g1 = ctx.createGain(); g1.gain.value = opt.wave === 'sawtooth' ? 0.35 : 0.45;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 1.2;
    const cut = opt.cut || 2400;
    fl.frequency.setValueAtTime(cut * 1.6, t); fl.frequency.exponentialRampToValueAtTime(cut, t + 0.18);
    const lfo = osc('sine', opt.vibRate || 5.6, t), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * (opt.vib || 0.007), t + Math.min(0.35, dur));
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const g = ctx.createGain(); const end = t + dur;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.setTargetAtTime(v * 0.72, t + 0.03, 0.08);
    g.gain.setValueAtTime(v * 0.72, Math.max(t + 0.04, end - 0.02));
    g.gain.setTargetAtTime(0, end, 0.06);
    o1.connect(g1); g1.connect(fl); o2.connect(fl); fl.connect(g);
    route(g, bus, opt.wet ?? 0.22, opt.dly ?? 0.22);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(end + 0.4); }
  }
  // FM 鐘琴 / 木琴
  function bell(t, midi, dur, v, bus, ratio = 3.5, idx = 2.2, wet = 0.35, dly = 0.1) {
    const f = mtof(midi);
    const c = osc('sine', f, t), m = osc('sine', f * ratio, t), mg = ctx.createGain();
    mg.gain.setValueAtTime(f * idx, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.35);
    m.connect(mg); mg.connect(c.frequency);
    const g = ctx.createGain(); const d = Math.max(0.35, dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d + 0.3);
    c.connect(g); route(g, bus, wet, dly);
    c.start(t); m.start(t); c.stop(t + d + 0.4); m.stop(t + d + 0.4);
  }
  // 溫暖的 Pad 和弦：每音兩顆鋸齒波微失諧
  function pad(t, midis, dur, v, bus, cut = 1100) {
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut; fl.Q.value = 0.4;
    const g = ctx.createGain(); const end = t + dur;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.25);
    g.gain.setValueAtTime(v, Math.max(t + 0.26, end - 0.05)); g.gain.setTargetAtTime(0, end, 0.18);
    fl.connect(g); route(g, bus, 0.45, 0);
    for (const m of midis) for (const dt of [-9, 9]) {
      const o = osc('sawtooth', mtof(m), t); o.detune.value = dt;
      o.connect(fl); o.start(t); o.stop(end + 1);
    }
  }
  function bass(t, midi, dur, v, bus) {
    const f = mtof(midi);
    const o = osc('triangle', f, t), s = osc('sine', f, t);
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass';
    fl.frequency.setValueAtTime(1500, t); fl.frequency.exponentialRampToValueAtTime(420, t + 0.2);
    const g = ctx.createGain(); const end = t + dur * 0.92;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.setTargetAtTime(v * 0.55, t + 0.02, 0.12); g.gain.setTargetAtTime(0, end, 0.03);
    o.connect(fl); s.connect(fl); fl.connect(g); route(g, bus, 0.05, 0);
    o.start(t); s.start(t); o.stop(end + 0.3); s.stop(end + 0.3);
  }
  function kick(t, v, bus, soft = false) {
    const o = osc('sine', soft ? 105 : 165, t); o.frequency.exponentialRampToValueAtTime(soft ? 46 : 48, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.26 : 0.32));
    o.connect(g); route(g, bus, 0, 0); o.start(t); o.stop(t + 0.35);
  }
  function snare(t, v, bus) {
    const n = noise(t, 0.2), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    n.connect(bp); bp.connect(g); route(g, bus, 0.25, 0);
    const o = osc('triangle', 210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(v * 0.6, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g2); route(g2, bus, 0.1, 0); o.start(t); o.stop(t + 0.12);
  }
  function hat(t, v, bus, open = false) {
    const n = noise(t, 0.3), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.22 : 0.045));
    n.connect(hp); hp.connect(g); route(g, bus, 0.08, 0);
  }
  function shaker(t, v, bus) {
    const n = noise(t, 0.1), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6500; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(bp); bp.connect(g); route(g, bus, 0.15, 0);
  }
  function crash(t, v, bus) {
    const n = noise(t, 1.6), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    n.connect(hp); hp.connect(g); route(g, bus, 0.4, 0);
  }

  // ---------- 柔和樂器：電鋼琴、長笛、撥弦（烏克麗麗／豎琴）、邊擊、海浪 ----------
  function epiano(t, midi, dur, v, bus) {
    const f = mtof(midi), d = Math.max(0.3, dur);
    const c = osc('sine', f, t), m = osc('sine', f, t), mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.5);
    m.connect(mg); mg.connect(c.frequency);
    const tine = osc('sine', f * 4.02, t), tg = ctx.createGain(); // 琴槌敲擊的金屬泛音
    tg.gain.setValueAtTime(0.16, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(v * 0.3, t + d);
    g.gain.setTargetAtTime(0, t + d, 0.15);
    c.connect(g); tine.connect(tg); tg.connect(g);
    route(g, bus, 0.32, 0.04);
    for (const o of [c, m, tine]) { o.start(t); o.stop(t + d + 1); }
  }
  function flute(t, midi, dur, v, bus, opt = {}) {
    const f = mtof(midi), end = t + dur;
    const o = osc('triangle', f, t), o2 = osc('sine', f * 2, t), g2 = ctx.createGain(); g2.gain.value = 0.15;
    const lfo = osc('sine', 5, t), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.45, dur));
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opt.cut || 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.07);
    g.gain.setValueAtTime(v, Math.max(t + 0.08, end - 0.04)); g.gain.setTargetAtTime(0, Math.max(t + 0.08, end), 0.1);
    o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g);
    route(g, bus, opt.wet ?? 0.38, opt.dly ?? 0.14);
    // 吹氣聲
    const n = noise(t, 0.15), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f * 3); bp.Q.value = 1.5;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(v * 0.3, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    n.connect(bp); bp.connect(ng); route(ng, bus, 0.2, 0);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(end + 0.6); }
  }
  function pluck(t, midi, dur, v, bus, bright = 2400) {
    const f = mtof(midi), d = Math.min(1.8, Math.max(0.4, dur));
    const o = osc('sawtooth', f, t), o2 = osc('triangle', f, t); o2.detune.value = -4;
    const sg = ctx.createGain(); sg.gain.value = 0.4;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 1.5;
    fl.frequency.setValueAtTime(bright, t); fl.frequency.exponentialRampToValueAtTime(Math.max(250, f * 1.5), t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(sg); sg.connect(fl); o2.connect(fl); fl.connect(g);
    route(g, bus, 0.28, 0);
    o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
  }
  // 刷弦：各弦相隔 16ms 依序發聲，上刷較輕較暗
  function strum(t, midis, dur, v, bus, up) {
    (up ? [...midis].reverse() : midis).forEach((m, k) => pluck(t + k * 0.016, m, dur, v * (up ? 0.75 : 1), bus, up ? 1800 : 2400));
  }
  function rim(t, v, bus) {
    const o = osc('triangle', 1650, t), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
    o.connect(bp); bp.connect(g); route(g, bus, 0.25, 0); o.start(t); o.stop(t + 0.06);
  }
  function waves(t, dur, v, bus) {
    const n = noise(t, dur), lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.45); lp.frequency.linearRampToValueAtTime(300, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(lp); lp.connect(g); route(g, bus, 0.5, 0);
  }

  function play(e, t, dur, bus) {
    switch (e.k) {
      case 'lead': return lead(t, e.m, dur, e.v ?? 0.11, bus, e.o);
      case 'bell': return bell(t, e.m, dur, e.v ?? 0.07, bus, e.r, e.i);
      case 'pad': return pad(t, e.m, dur, e.v ?? 0.035, bus, e.cut);
      case 'bass': return bass(t, e.m, dur, e.v ?? 0.24, bus);
      case 'kick': return kick(t, e.v ?? 0.42, bus, e.soft);
      case 'ep': for (const m of [].concat(e.m)) epiano(t, m, dur, e.v ?? 0.04, bus); return;
      case 'flute': return flute(t, e.m, dur, e.v ?? 0.07, bus, e.o);
      case 'pluck': return pluck(t, e.m, dur, e.v ?? 0.04, bus, e.bright);
      case 'strum': return strum(t, e.m, dur, e.v ?? 0.03, bus, e.up);
      case 'rim': return rim(t, e.v ?? 0.03, bus);
      case 'waves': return waves(t, dur, e.v ?? 0.03, bus);
      case 'snare': return snare(t, e.v ?? 0.13, bus);
      case 'hat': return hat(t, e.v ?? 0.045, bus, e.open);
      case 'shaker': return shaker(t, e.v ?? 0.03, bus);
      case 'crash': return crash(t, e.v ?? 0.12, bus);
    }
  }

  // ---------- 曲目 ----------
  // 每首歌：bpm、swing、bars，以及 build(bar, loop) 回傳該小節的事件 [{s(步), l(長), k(樂器), m, v}]
  function song(def) {
    def.mel = def.melody.map(line);
    def.ch = def.chords.map((c) => c.split(',').map(chord));
    return def;
  }
  // 依和弦產生 pad / 貝斯 / 琶音
  function harmony(def, bar, ev, style) {
    const chs = def.ch[bar];
    const half = stepsOf(def) / chs.length;
    chs.forEach((c, h) => {
      const s0 = h * half;
      ev.push({ s: s0, l: half, k: 'pad', m: c.pad, v: style.padV ?? 0.032 });
      // 貝斯
      for (const [s, iv, l] of style.bass) if (s >= 0 && s < half) {
        ev.push({ s: s0 + s, l, k: 'bass', m: c.bass + iv, v: style.bassV ?? 0.24 });
      }
      // 琶音（鐘琴）
      if (style.arp) {
        const tones = [c.tones[0], c.tones[1], c.tones[2], c.tones[0] + 12];
        for (let i = 0; i < half / style.arpStep; i++) {
          const m = tones[style.arp[i % style.arp.length]];
          ev.push({ s: s0 + i * style.arpStep, l: style.arpStep, k: 'bell', m: m + (style.arpOct || 0), v: style.arpV ?? 0.05, r: style.arpRatio || 3.5, i: 1.6 });
        }
      }
    });
  }
  function drums(ev, pat) {
    for (const [k, steps, v, extra] of pat) for (const s of steps) ev.push(Object.assign({ s, l: 1, k, v }, extra));
  }
  const stepsOf = (def) => def.steps || 16; // 每小節幾個 16 分音符（3/4 拍為 12）
  // 某小節某一步所在的和弦
  function chordAt(def, bar, s) {
    const chs = def.ch[bar];
    return chs[Math.min(chs.length - 1, Math.floor(s / (stepsOf(def) / chs.length)))];
  }
  const lowBass = (c) => (c.bass < 36 ? c.bass + 12 : c.bass); // 讓手機喇叭也聽得到貝斯
  function pads(def, bar, ev, v, cut) {
    const chs = def.ch[bar], len = stepsOf(def) / chs.length;
    chs.forEach((c, h) => ev.push({ s: h * len, l: len, k: 'pad', m: c.pad, v, cut }));
  }
  function melody(def, bar, ev, k, v, shift = 0, extra = {}) {
    for (const n of def.mel[bar]) ev.push(Object.assign({ s: n.step, l: n.len, k, m: n.midi + shift, v }, extra));
  }

  const SONGS = {
    // 主選單：慵懶午後（F 大調，搖擺節奏）
    menu: song({
      bpm: 86, swing: 0.16,
      chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Gm,C', 'F'],
      melody: [
        'C5:4 F5:4 A5:6 G5:2', 'F5:4 D5:4 A4:8', 'Bb4:4 D5:4 F5:4 D5:2 F5:2', 'G5:8 E5:4 C5:4',
        'A5:4 C6:4 A5:4 F5:4', 'A5:4 F5:2 D5:2 F5:8', 'G5:4 Bb5:4 C6:4 E5:4', 'F5:12 -:4',
      ],
      build(bar, loop) {
        const ev = [];
        harmony(this, bar, ev, { bass: [[0, 0, 6], [6, 7, 2], [8, 0, 6], [14, 12, 2]], bassV: 0.2, arp: [0, 1, 2, 3, 2, 1, 0, 2], arpStep: 2, arpV: 0.045, padV: 0.03 });
        if (loop % 2 === 0) for (const n of this.mel[bar]) ev.push({ s: n.step, l: n.len, k: 'lead', m: n.midi, v: 0.085, o: { wave: 'triangle', cut: 3000, vib: 0.009, dly: 0.3 } });
        else for (const n of this.mel[bar]) ev.push({ s: n.step, l: n.len, k: 'bell', m: n.midi + 12, v: 0.05, r: 2, i: 1.2 });
        drums(ev, [['shaker', [2, 6, 10, 14], 0.028], ['kick', [0], 0.25], ['hat', [8], 0.02]]);
        return ev;
      },
    }),
    // 第一章 柴犬公園：午後散步（C 大調，輕搖擺；長笛＋電鋼琴＋刷鼓）
    ch1: song({
      bpm: 92, swing: 0.15,
      chords: ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7,G7', 'C'],
      melody: [
        'E5:4 G5:2 B5:2 A5:6 G5:2', 'C6:4 B5:2 A5:2 E5:8', 'F5:2 A5:2 C6:4 B5:2 A5:2 F5:4', 'G5:8 -:4 D5:2 E5:2',
        'E5:4 G5:2 C6:2 D6:6 C6:2', 'B5:2 C6:2 A5:4 E5:4 G5:4', 'F5:4 A5:4 G5:2 F5:2 D5:4', 'E5:4 D5:2 C5:10',
      ],
      build(bar, loop) {
        const ev = [];
        pads(this, bar, ev, 0.018, 900);
        for (const [s, l] of [[0, 6], [6, 2], [10, 5]]) ev.push({ s, l, k: 'ep', m: chordAt(this, bar, s).pad, v: s === 6 ? 0.016 : 0.024 });
        for (const [s, iv, l] of [[0, 0, 6], [8, 7, 4], [14, 0, 2]]) ev.push({ s, l, k: 'bass', m: lowBass(chordAt(this, bar, s)) + iv, v: 0.15 });
        if (loop % 2 === 0) melody(this, bar, ev, 'flute', 0.075);
        else melody(this, bar, ev, 'bell', 0.045, 0, { r: 4, i: 0.9 });
        drums(ev, [['kick', [0, 8], 0.15, { soft: true }], ['shaker', [2, 6, 10, 14], 0.016], ['rim', [12], 0.02]]);
        return ev;
      },
    }),
    // 第二章 柯基草原：草原圓舞曲（G 大調 3/4 拍；音樂盒＋豎琴，沒有鼓）
    ch2: song({
      bpm: 108, steps: 12,
      chords: ['G', 'Bm', 'C', 'G', 'Em', 'Am', 'D7', 'G', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'G', 'G'],
      melody: [
        'D5:4 G5:4 B5:4', 'D6:6 B5:2 A5:2 F#5:2', 'E5:4 G5:4 C6:4', 'B5:8 -:4',
        'G5:4 B5:4 E6:4', 'C6:6 B5:2 A5:2 G5:2', 'F#5:4 A5:4 C6:4', 'G5:8 -:4',
        'E6:4 D6:4 C6:4', 'D6:6 A5:6', 'B5:4 D6:4 F#6:4', 'E6:8 D6:2 B5:2',
        'C6:4 G5:4 E5:4', 'F#5:4 A5:4 D6:4', 'B5:6 A5:2 G5:2 A5:2', 'G5:12',
      ],
      build(bar, loop) {
        const ev = [], c = chordAt(this, bar, 0);
        ev.push({ s: 0, l: 12, k: 'pad', m: c.pad, v: 0.016, cut: 800 });
        ev.push({ s: 0, l: 5, k: 'bass', m: lowBass(c), v: 0.17 });
        for (const s of [4, 8]) ev.push({ s, l: 4, k: 'strum', m: [c.tones[1], c.tones[2], c.tones[0] + 12], v: 0.028 });
        if (loop % 2 === 0) melody(this, bar, ev, 'bell', 0.075, 0, { r: 3, i: 1 });
        else melody(this, bar, ev, 'flute', 0.07, 0, { o: { cut: 2000 } });
        return ev;
      },
    }),
    // 第三章 哈士奇雪地：雪夜搖籃曲（A 小調慢板；鋼片琴＋暖 Pad＋豎琴琶音，沒有鼓）
    ch3: song({
      bpm: 70,
      chords: ['Am', 'Fmaj7', 'C', 'G', 'Am', 'Fmaj7', 'Dm7', 'Esus4,E'],
      melody: [
        'E5:4 A5:4 C6:8', 'A5:4 G5:4 E5:8', 'G5:4 C6:4 E6:8', 'D6:6 B5:2 G5:8',
        'A5:4 C6:4 E6:4 D6:4', 'C6:8 A5:8', 'F5:4 A5:4 D6:4 C6:4', 'B5:8 G#5:8',
      ],
      build(bar, loop) {
        const ev = [];
        pads(this, bar, ev, 0.026, 750);
        ev.push({ s: 0, l: 16, k: 'bass', m: lowBass(chordAt(this, bar, 0)), v: 0.12 });
        const order = [0, 1, 2, 3, 2, 1, 0, 2];
        for (let i = 0; i < 8; i++) {
          const c = chordAt(this, bar, i * 2);
          const tones = [c.tones[0] - 12, c.tones[1] - 12, c.tones[2] - 12, c.tones[0]];
          ev.push({ s: i * 2, l: 4, k: 'pluck', m: tones[order[i]], v: 0.026, bright: 1300 });
        }
        if (loop % 2 === 0) melody(this, bar, ev, 'bell', 0.065, 0, { r: 3.5, i: 1.1 });
        else melody(this, bar, ev, 'flute', 0.05, -12, { o: { cut: 1600 } });
        const SPARK = [93, 96, 100, 91, 98]; // 雪花閃光：A6 C7 E7 G6 D7
        if ((bar + loop) % 2 === 1) ev.push({ s: 6, l: 4, k: 'bell', m: SPARK[(bar * 3 + loop) % 5], v: 0.018, r: 3.5, i: 1.5 });
        return ev;
      },
    }),
    // 第四章 巴哥小鎮：街角咖啡館（F 大調 Bossa Nova；長笛＋電鋼琴＋邊擊）
    ch4: song({
      bpm: 100,
      chords: ['Fmaj7', 'Gm7', 'Am7', 'Dm7', 'Gm7', 'C7', 'Fmaj7', 'C7', 'Bbmaj7', 'Am7', 'Gm7', 'C7', 'Fmaj7', 'Dm7', 'Gm7,C7', 'Fmaj7'],
      melody: [
        'A5:3 C6:3 E5:2 F5:4 G5:4', 'Bb5:3 A5:3 G5:2 F5:6 -:2', 'C6:3 E6:3 D6:2 C6:4 A5:4', 'F5:8 -:4 A5:2 C6:2',
        'D6:3 C6:3 Bb5:2 A5:4 G5:4', 'E5:3 G5:3 Bb5:2 C6:8', 'A5:4 G5:2 F5:2 E5:8', '-:8 G5:2 A5:2 Bb5:2 C6:2',
        'D6:6 C6:2 A5:8', 'C6:3 A5:3 G5:2 E5:8', 'F5:3 G5:3 Bb5:2 D6:8', 'C6:4 Bb5:4 G5:4 E5:4',
        'F5:3 A5:3 C6:2 E6:8', 'D6:4 C6:4 A5:8', 'Bb5:4 G5:4 E5:4 G5:4', 'F5:12 -:4',
      ],
      build(bar, loop) {
        const ev = [];
        pads(this, bar, ev, 0.014, 800);
        for (const [s, l] of [[0, 2], [3, 2], [6, 3], [10, 2], [12, 3]]) ev.push({ s, l, k: 'ep', m: chordAt(this, bar, s).pad, v: 0.02 });
        for (const [s, iv, l] of [[0, 0, 6], [6, 7, 2], [8, 0, 6], [14, 7, 2]]) ev.push({ s, l, k: 'bass', m: lowBass(chordAt(this, bar, s)) + iv, v: 0.15 });
        if (loop % 2 === 0) melody(this, bar, ev, 'flute', 0.07);
        else melody(this, bar, ev, 'ep', 0.04);
        drums(ev, [['kick', [0, 6, 8, 14], 0.11, { soft: true }], ['rim', bar % 2 ? [2, 6, 10] : [0, 3, 6, 12], 0.024], ['shaker', [0, 2, 4, 6, 8, 10, 12, 14], 0.012], ['shaker', [1, 3, 5, 7, 9, 11, 13, 15], 0.007]]);
        return ev;
      },
    }),
    // 第五章 黃金海灘：海邊夕陽（D 大調 Lo-fi；烏克麗麗＋柔和主旋律＋海浪聲）
    ch5: song({
      bpm: 80, swing: 0.1,
      chords: ['Dmaj7', 'Bm7', 'Em7', 'A7', 'Dmaj7', 'Bm7', 'Gmaj7', 'A7', 'Gmaj7', 'F#m7', 'Em7', 'A7', 'Dmaj7', 'Bm7', 'Em7,A7', 'D'],
      melody: [
        'F#5:4 A5:4 C#6:6 A5:2', 'B5:4 A5:2 F#5:2 D5:8', 'G5:4 B5:4 D6:4 B5:4', 'C#6:6 B5:2 A5:8',
        'F#5:2 A5:2 D6:4 E6:4 C#6:4', 'D6:4 B5:4 A5:4 F#5:4', 'B5:4 A5:4 G5:4 F#5:4', 'E5:8 G5:4 A5:4',
        'B5:6 A5:2 G5:8', 'A5:4 C#6:4 E6:8', 'D6:4 B5:4 G5:4 E5:4', 'C#6:4 A5:4 E5:8',
        'F#5:4 A5:4 C#6:4 D6:4', 'D6:6 C#6:2 B5:8', 'G5:4 B5:4 A5:4 G5:4', 'F#5:4 E5:2 D5:10',
      ],
      build(bar, loop) {
        const ev = [];
        pads(this, bar, ev, 0.014, 850);
        for (const [s, up] of [[0, false], [4, false], [6, true], [10, true], [12, false], [14, true]]) {
          const c = chordAt(this, bar, s);
          ev.push({ s, l: 3, k: 'strum', m: [c.tones[0], c.tones[1], c.tones[2], c.tones[0] + 12], v: 0.02, up });
        }
        for (const [s, iv, l] of [[0, 0, 6], [8, 0, 2], [10, 7, 6]]) ev.push({ s, l, k: 'bass', m: lowBass(chordAt(this, bar, s)) + iv, v: 0.15 });
        if (loop % 2 === 0) melody(this, bar, ev, 'lead', 0.06, 0, { o: { wave: 'triangle', cut: 1700, vib: 0.005, wet: 0.3, dly: 0.22 } });
        else melody(this, bar, ev, 'bell', 0.045, 0, { r: 2, i: 0.9 });
        drums(ev, [['kick', [0, 10], 0.15, { soft: true }], ['rim', [4, 12], 0.022], ['shaker', [2, 6, 10, 14], 0.012]]);
        if (bar % 2 === 0) ev.push({ s: 0, l: 32, k: 'waves', v: 0.03 });
        return ev;
      },
    }),
  };

  // ---------- 排程器 ----------
  let cur = null;
  function tick() {
    if (!ctx || !cur || ctx.state !== 'running') return;
    const s = cur.song, spb = 60 / s.bpm / 4;
    if (cur.next < ctx.currentTime) cur.next = ctx.currentTime + 0.05; // 背景回來時避免一次塞爆
    while (cur.next < ctx.currentTime + 0.3) {
      for (const e of s.build(cur.bar, cur.loop)) {
        let t = cur.next + e.s * spb;
        if (s.swing && e.s % 2 === 1) t += s.swing * spb * 2;
        play(e, t, e.l * spb, cur.bus);
      }
      cur.next += stepsOf(s) * spb;
      if (++cur.bar >= s.chords.length) { cur.bar = 0; cur.loop++; }
    }
  }
  A.playMusic = function (name) {
    if (!ctx) return;
    if (cur && cur.name === name) return;
    A.stopMusic(0.5);
    const s = SONGS[name]; if (!s) return;
    const bus = makeBus(musicBus);
    setBusGain(bus, 0, 0.01); setBusGain(bus, 1, 0.3);
    delayNode.delayTime.setTargetAtTime((60 / s.bpm / 4) * 3, ctx.currentTime, 0.05);
    cur = { name, song: s, bus, bar: 0, loop: 0, next: ctx.currentTime + 0.12 };
    tick();
  };
  A.stopMusic = function (fade = 0.4) {
    if (!ctx || !cur) return;
    const b = cur.bus; cur = null;
    setBusGain(b, 0, fade / 3);
    setTimeout(() => { for (const g of [b.dry, b.wet, b.dly]) g.disconnect(); }, fade * 1000 + 2600);
  };
  A.currentMusic = () => (cur ? cur.name : null);

  // ---------- 短樂句（過關 / 失敗） ----------
  function phrase(bpm, events) {
    const spb = 60 / bpm / 4, t0 = ctx.currentTime + 0.05;
    for (const e of events) play(e, t0 + e.s * spb, e.l * spb, sfxBus);
  }
  const JINGLES = {
    win() {
      const ev = [];
      [['C5', 0, 1], ['E5', 1, 1], ['G5', 2, 1], ['C6', 3, 1], ['E6', 4, 2], ['D6', 6, 1], ['E6', 7, 1], ['G6', 8, 10]].forEach(([n, s, l]) => {
        ev.push({ s, l, k: 'lead', m: n2m(n), v: 0.12, o: { cut: 3200, dly: 0.25 } });
        ev.push({ s, l, k: 'bell', m: n2m(n) - 12, v: 0.05 });
      });
      [['C', 0, 4], ['F', 4, 2], ['G', 6, 2], ['C', 8, 10]].forEach(([c, s, l]) => {
        const ch = chord(c);
        ev.push({ s, l, k: 'pad', m: ch.pad, v: 0.05, cut: 1800 });
        ev.push({ s, l, k: 'bass', m: ch.bass + 12, v: 0.25 });
      });
      ['C7', 'G6', 'E7', 'C7', 'G7'].forEach((n, i) => ev.push({ s: 9 + i, l: 2, k: 'bell', m: n2m(n), v: 0.04 }));
      drums(ev, [['kick', [0, 4, 6, 8], 0.4], ['snare', [5, 6, 7], 0.09], ['crash', [8], 0.14]]);
      phrase(150, ev);
    },
    lose() {
      const ev = [];
      [['G4', 0, 3], ['F#4', 3, 3], ['F4', 6, 3], ['E4', 9, 12]].forEach(([n, s, l], i) => {
        ev.push({ s, l, k: 'lead', m: n2m(n), v: 0.12, o: { wave: 'sawtooth', cut: 1300, vib: i === 3 ? 0.03 : 0.006, vibRate: 6.5, dly: 0 } });
        ev.push({ s, l, k: 'bass', m: n2m(n) - 24, v: 0.22 });
      });
      ev.push({ s: 9, l: 12, k: 'pad', m: chord('C').pad, v: 0.03, cut: 800 });
      drums(ev, [['kick', [9], 0.3]]);
      phrase(100, ev);
    },
    start() {
      const ev = [];
      ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => ev.push({ s: i, l: 2, k: 'bell', m: n2m(n), v: 0.06 }));
      ev.push({ s: 0, l: 6, k: 'pad', m: chord('C').pad.map((m) => m + 12), v: 0.025, cut: 2000 });
      phrase(220, ev);
    },
  };
  A.jingle = function (name) { if (ctx && JINGLES[name]) JINGLES[name](); };

  // ---------- 音效 ----------
  const PENTA = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6'].map(n2m);
  function bark(t, pitch = 1) {
    // 卡通「汪！」：鋸齒波快速上揚再下滑，經兩個共振峰帶通
    const o = osc('sawtooth', 430 * pitch, t);
    o.frequency.linearRampToValueAtTime(700 * pitch, t + 0.035);
    o.frequency.exponentialRampToValueAtTime(330 * pitch, t + 0.15);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1050 * pitch; f1.Q.value = 1.6;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2500 * pitch; f2.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g);
    const n = noise(t, 0.08), nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 1700; nb.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.18, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(nb); nb.connect(ng); ng.connect(g);
    route(g, sfxBus, 0.12, 0); o.start(t); o.stop(t + 0.2);
  }
  function blip(t, f1, f2, dur, v, type = 'sine', wet = 0.1) {
    const o = osc(type, f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); route(g, sfxBus, wet, 0); o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    place(t, { count = 0, pitch = 1 } = {}) {
      blip(t, 520, 980, 0.09, 0.22);
      bark(t + 0.02, pitch);
      bell(t + 0.06, PENTA[Math.min(count, PENTA.length - 1)] + 12, 0.5, 0.07, sfxBus, 3.5, 1.4, 0.4, 0);
    },
    mark(t) { blip(t, 1500, 1100, 0.04, 0.12, 'triangle', 0.02); },
    unmark(t) { blip(t, 900, 700, 0.04, 0.1, 'triangle', 0.02); },
    ripple(t) {
      const n = noise(t, 0.4), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(5000, t + 0.3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      n.connect(bp); bp.connect(g); route(g, sfxBus, 0.3, 0);
    },
    wrong(t) {
      blip(t, 240, 95, 0.22, 0.28, 'square', 0.05);
      blip(t, 120, 60, 0.25, 0.3, 'sine', 0);
      // 小狗嗚嗚聲
      const o = osc('sine', 1050, t + 0.18); o.frequency.exponentialRampToValueAtTime(720, t + 0.6);
      const lfo = osc('sine', 9, t + 0.18), lg = ctx.createGain(); lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + 0.18); g.gain.linearRampToValueAtTime(0.09, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
      o.connect(g); route(g, sfxBus, 0.25, 0);
      o.start(t + 0.18); lfo.start(t + 0.18); o.stop(t + 0.65); lfo.stop(t + 0.65);
    },
    blocked(t) { blip(t, 520, 500, 0.06, 0.1); blip(t + 0.08, 400, 380, 0.08, 0.1); },
    click(t) { blip(t, 650, 1050, 0.06, 0.16); },
    hint(t) { ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, i) => bell(t + i * 0.055, n2m(n), 0.6, 0.06, sfxBus, 3.5, 1.8, 0.5, 0)); },
    star(t, { i = 0 } = {}) { bell(t, n2m(['E6', 'G6', 'C7'][i] || 'C7'), 0.7, 0.09, sfxBus, 3.5, 2, 0.5, 0); blip(t, 1800, 2600, 0.08, 0.05); },
    heart(t) { blip(t, 880, 330, 0.25, 0.14, 'triangle', 0.15); },
    unlock(t) { ['G5', 'C6', 'E6'].forEach((n, i) => bell(t + i * 0.07, n2m(n), 0.5, 0.06, sfxBus)); },
  };
  A.sfx = function (name, arg) {
    if (!ctx || !vol.sfx || ctx.state !== 'running' || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.01, arg);
  };

  window.DogAudio = A;
})();
