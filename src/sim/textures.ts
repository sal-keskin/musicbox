/**
 * Kanvas ile üretilen prosedürel dokular (harici görsel dosyası yok).
 */
import * as THREE from 'three';

/** Tekrarlanabilir sözde rastgele sayı üreteci (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Ahşap damarı. `base` ve `dark` CSS renkleridir. */
export function woodTexture(base: string, dark: string, seed = 7): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  // Geniş yumuşak bantlar
  for (let i = 0; i < 14; i++) {
    const y = r() * 512;
    const h = 20 + r() * 60;
    const grad = g.createLinearGradient(0, y - h, 0, y + h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, `rgba(60,30,10,${0.05 + r() * 0.08})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, y - h, 512, 2 * h);
  }
  // İnce damarlar
  g.strokeStyle = dark;
  for (let i = 0; i < 90; i++) {
    const y0 = r() * 512;
    const amp = 2 + r() * 7;
    const freq = 0.004 + r() * 0.012;
    const phase = r() * Math.PI * 2;
    g.globalAlpha = 0.08 + r() * 0.22;
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Bilyelerin içindeki girdap deseni (beyaz/gri; örnek rengiyle çarpılır). */
export function marbleTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  const r = rng(3);
  for (let band = 0; band < 3; band++) {
    const y0 = 20 + band * 40 + r() * 10;
    g.strokeStyle = band === 1 ? 'rgba(255,255,255,1)' : 'rgba(150,150,170,0.55)';
    g.lineWidth = 7 + r() * 8;
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = y0 + Math.sin((x / 256) * Math.PI * 4 + band) * 14;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Arka plan: dikey gradyan + hafif yıldız tozu. */
export function skyTexture(top: string, middle: string, bottom: string): THREE.CanvasTexture {
  const [c, g] = canvas(16, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, middle);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Yumuşak, radyal bir ışık lekesi (zemin üzerindeki spot ışığı için). */
export function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Davul derisi: hafif kirli, ortası kararmış beyaz. */
export function drumHeadTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, '#e9e2d4');
  grad.addColorStop(0.35, '#f6f1e7');
  grad.addColorStop(0.95, '#fbf8f1');
  grad.addColorStop(1, '#d9d0bf');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Zil yüzeyindeki eş merkezli tornalama çizgileri. */
export function cymbalTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#c99a3a';
  g.fillRect(0, 0, 512, 512);
  const r = rng(11);
  for (let rad = 4; rad < 256; rad += 2.2) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '255,230,160' : '120,80,20'},${0.12 + r() * 0.18})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(256, 256, rad, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Satin ceviz: sıcak kahve zemin, akan koyu damarlar, açık renkli öz
 * çizgileri ve ince gözenekler.
 */
export function walnutTexture(seed: number, dark = false): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const r = rng(seed);
  const base = dark ? ['#4a2c19', '#5a3720', '#3c2314'] : ['#7a4b2b', '#8e5a35', '#6a3f23'];
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(0.5, base[1]);
  grad.addColorStop(1, base[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  // Geniş renk dalgaları
  for (let i = 0; i < 18; i++) {
    const y = r() * 512;
    const h = 15 + r() * 50;
    const light = r() > 0.55;
    const band = g.createLinearGradient(0, y - h, 0, y + h);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, light ? `rgba(214,150,92,${0.08 + r() * 0.1})` : `rgba(30,14,6,${0.1 + r() * 0.14})`);
    band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band;
    g.fillRect(0, y - h, 1024, 2 * h);
  }
  // Akan damarlar
  for (let i = 0; i < 140; i++) {
    const y0 = r() * 512;
    const amp = 3 + r() * 12;
    const freq = 0.002 + r() * 0.008;
    const phase = r() * Math.PI * 2;
    const light = r() > 0.8;
    g.strokeStyle = light ? 'rgba(226,170,110,1)' : 'rgba(28,12,4,1)';
    g.globalAlpha = (light ? 0.08 : 0.1) + r() * 0.2;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 1.3) * amp * 0.35;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Gözenekler
  g.globalAlpha = 1;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(20,8,2,${0.12 + r() * 0.2})`;
    g.fillRect(r() * 1024, r() * 512, 1 + r() * 3, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Sahne zemini: ortası aydınlık, kenarlara doğru kararan mor lake. */
export function stageTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const grad = g.createRadialGradient(512, 560, 40, 512, 512, 512);
  grad.addColorStop(0, '#3f345c');
  grad.addColorStop(0.45, '#2e2647');
  grad.addColorStop(0.8, '#1d1830');
  grad.addColorStop(1, '#141020');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  // İnce eş merkezli halkalar (plak gibi)
  g.strokeStyle = 'rgba(255,255,255,0.025)';
  for (let rad = 30; rad < 512; rad += 9) {
    g.lineWidth = 1;
    g.beginPath();
    g.arc(512, 512, rad, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
