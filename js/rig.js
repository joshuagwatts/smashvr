// js/rig.js — procedural fallback humanoid (~1.7 units, feet at group y=0).
// Fighter faces +X, Y-up. Distinct silhouettes per variant:
//   'ronin' — bulkier torso + headband (accent color)
//   'volt'  — leaner torso + visor + shoulder pads (accent color)

import * as THREE from 'three';

export const BONE_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'lowerArmL', 'handL',
  'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL',
  'upperLegR', 'lowerLegR', 'footR',
];

// Logical bone -> VRM humanoid bone name (for anim.js VRM posing).
export const VRM_BONE_MAP = {
  hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
  upperArmL: 'leftUpperArm', lowerArmL: 'leftLowerArm', handL: 'leftHand',
  upperArmR: 'rightUpperArm', lowerArmR: 'rightLowerArm', handR: 'rightHand',
  upperLegL: 'leftUpperLeg', lowerLegL: 'leftLowerLeg', footL: 'leftFoot',
  upperLegR: 'rightUpperLeg', lowerLegR: 'rightLowerLeg', footR: 'rightFoot',
};

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
  m.castShadow = false;
  return m;
}

// Limb segment: pivot group at the joint, mesh hanging down -Y.
function limb(r, len, mat) {
  const pivot = new THREE.Group();
  const mesh = capsule(r, len, mat);
  mesh.position.y = -len / 2;
  pivot.add(mesh);
  return pivot;
}

export function buildProceduralRig(theme, variant) {
  const suitMat = new THREE.MeshStandardMaterial({ color: theme.secondary, roughness: 0.85, metalness: 0.05 });
  const accentMat = new THREE.MeshStandardMaterial({ color: theme.primary, roughness: 0.6, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#26262e', roughness: 0.9, metalness: 0.0 });

  // v0.6: WISP — floating ghost type. Rounded hovering body, little arms,
  // NO legs (floater rig: leg bones are simply absent; anim.js null-guards).
  if (variant === 'wisp') return buildWispRig(theme, suitMat, accentMat, darkMat);

  const bulky = variant === 'ronin';
  const group = new THREE.Group();
  const bones = {};
  const at = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    bones[name] = g;
    return g;
  };

  // ---- lower body ----
  const hips = at('hips', group, 0, 0.95, 0);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(bulky ? 0.34 : 0.28, 0.18, 0.22), suitMat);
  hips.add(pelvis);

  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    const hip = at('upperLeg' + L, hips, s * 0.11, -0.04, 0);
    const thigh = limb(bulky ? 0.085 : 0.07, 0.40, suitMat);
    hip.add(thigh);
    const knee = at('lowerLeg' + L, thigh, 0, -0.42, 0);
    const shin = limb(bulky ? 0.07 : 0.06, 0.38, suitMat);
    knee.add(shin);
    const ankle = at('foot' + L, shin, 0, -0.40, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.11), darkMat);
    foot.position.set(0.055, -0.045, 0);
    ankle.add(foot);
  }

  // ---- torso ----
  const spine = at('spine', hips, 0, 0.14, 0);
  const belly = capsule(bulky ? 0.15 : 0.12, 0.10, suitMat);
  spine.add(belly);
  const chest = at('chest', spine, 0, 0.18, 0);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(bulky ? 0.44 : 0.34, 0.30, bulky ? 0.27 : 0.22),
    suitMat
  );
  torso.position.y = 0.10;
  chest.add(torso);
  // chest accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(bulky ? 0.45 : 0.35, 0.05, bulky ? 0.28 : 0.23), accentMat);
  stripe.position.y = 0.02;
  chest.add(stripe);

  // ---- head ----
  const neck = at('neck', chest, 0, 0.22, 0);
  const neckMesh = capsule(0.05, 0.06, darkMat);
  neck.add(neckMesh);
  const head = at('head', neck, 0, 0.06, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), suitMat);
  skull.position.y = 0.06;
  head.add(skull);
  if (bulky) {
    // RONIN headband
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 0.28), accentMat);
    band.position.y = 0.10;
    head.add(band);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), accentMat);
    knot.position.set(-0.15, 0.10, 0);
    head.add(knot);
  } else {
    // VOLT visor + shoulder pads
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.19), accentMat);
    visor.position.set(0.11, 0.07, 0);
    head.add(visor);
  }

  // ---- arms ----
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    const shoulder = at('upperArm' + L, chest, s * (bulky ? 0.25 : 0.21), 0.18, 0);
    if (!bulky) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), accentMat);
      pad.position.y = 0.02;
      shoulder.add(pad);
    }
    const upper = limb(0.055, 0.26, suitMat);
    shoulder.add(upper);
    const elbow = at('lowerArm' + L, upper, 0, -0.28, 0);
    const fore = limb(0.048, 0.24, suitMat);
    elbow.add(fore);
    const wrist = at('hand' + L, fore, 0, -0.26, 0);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), accentMat);
    wrist.add(glove);
  }

  function setTheme(t) {
    suitMat.color.set(t.secondary);
    accentMat.color.set(t.primary);
  }

  return { group, bones, setTheme, variant };
}

// v0.6: WISP ghost rig — floater body type. No leg bones at all; the engine
// hovers it (bob in syncRoot) and anim.js skips missing bones harmlessly.
// Visual mass sits y ~0.2–1.5 so the feet-anchored hurtbox still fits.
function buildWispRig(theme, suitMat, accentMat, darkMat) {
  const group = new THREE.Group();
  const bones = {};
  const at = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    bones[name] = g;
    return g;
  };

  // core: hips low (the hover anchor), body as one big rounded ghost mass
  const hips = at('hips', group, 0, 0.55, 0);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 18), suitMat);
  body.scale.set(1, 1.18, 0.92);
  body.position.y = 0.35;
  hips.add(body);
  // tail wisp underneath
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.42, 16), suitMat);
  tail.rotation.x = Math.PI; // point down
  tail.position.y = -0.12;
  hips.add(tail);
  // accent sash around the middle
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.045, 10, 28), accentMat);
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 0.28;
  hips.add(sash);

  const spine = at('spine', hips, 0, 0.30, 0);
  const chest = at('chest', spine, 0, 0.22, 0);
  const chestGlow = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 10), accentMat);
  chestGlow.position.set(0.30, 0.05, 0);
  chest.add(chestGlow);

  const neck = at('neck', chest, 0, 0.20, 0);
  const head = at('head', neck, 0, 0.10, 0);
  // ghost eyes on the +X face (fighter faces +X)
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), darkMat);
    eye.position.set(0.30, 0.12, s * 0.11);
    head.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), accentMat);
    glint.position.set(0.345, 0.14, s * 0.11);
    head.add(glint);
  }
  // little ghost arms (v0.6.1: on ±X like the biped rig — were on ±Z by mistake,
  // which put the "right" arm behind the body and broke hitbox sync)
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    const shoulder = at('upperArm' + L, chest, s * 0.38, 0.10, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.20, 4, 10), suitMat);
    upper.position.y = -0.13;
    shoulder.add(upper);
    const elbow = at('lowerArm' + L, shoulder, 0, -0.28, 0);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 10), suitMat);
    fore.position.y = -0.12;
    elbow.add(fore);
    const wrist = at('hand' + L, elbow, 0, -0.26, 0);
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), accentMat);
    wrist.add(mitt);
  }

  function setTheme(t) {
    suitMat.color.set(t.secondary);
    accentMat.color.set(t.primary);
  }

  return { group, bones, setTheme, variant: 'wisp' };
}
