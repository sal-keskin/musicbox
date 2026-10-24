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
