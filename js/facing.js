// js/facing.js — v0.43: import-time facing detection.
//
// Some imported models are authored facing AWAY from the VRM convention
// (rest faces +Z): "cactus boy is still loaded backwards." Instead of making
// the user find a manual flip, measure which way the model actually faces
// from its own anatomy and report the yaw deviation from +Z:
//
//   detectFacingVRM(vrm)     — bone/geometry signals on a loaded VRM:
//                              toes (strongest), eyes, head-geometry,
//                              shoulder-frame tiebreak.
//   detectFacingScene(scene) — same idea for a static GLB about to be
//                              auto-rigged (no bones yet): foot/toe vertex
//                              mass vs the ankle line + head mass offset.
//
// Both return { yaw, deg, confidence, signals } where yaw is the signed
// deviation (radians, atan2(x, z) convention: 0 = faces +Z, +PI/2 = faces
// +X). Low-evidence results report yaw 0 — never "correct" a model we
// can't read.

import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function horizDir(from, to, out) {
  out.subVectors(to, from);
  out.y = 0;
  const len = out.length();
  if (len < 1e-5) return 0;
  out.divideScalar(len);
  return len;
}

// Weighted vote accumulator over horizontal unit directions.
function Voter() {
  return {
    x: 0, z: 0, w: 0, parts: {},
    add(name, dir, weight) {
      if (!(weight > 0)) return;
      this.x += dir.x * weight;
      this.z += dir.z * weight;
      this.w += weight;
      this.parts[name] = { dx: +dir.x.toFixed(3), dz: +dir.z.toFixed(3), w: +weight.toFixed(2) };
    },
    result() {
      const mag = Math.hypot(this.x, this.z);
      if (this.w <= 0 || mag < 0.45) {
        return { yaw: 0, deg: 0, confidence: 0, signals: this.parts };
      }
      let yaw = Math.atan2(this.x / mag, this.z / mag);
      // Models are authored on cardinal axes — snap within 15° of a
      // multiple of 90° so a clean 180° case applies as exactly 180°.
      const step = Math.PI / 2;
      const snapped = Math.round(yaw / step) * step;
      if (Math.abs(yaw - snapped) < THREE.MathUtils.degToRad(15)) yaw = snapped;
      if (yaw > Math.PI) yaw -= Math.PI * 2;
      if (yaw <= -Math.PI) yaw += Math.PI * 2;
      return {
        yaw,
        deg: +(yaw * 180 / Math.PI).toFixed(1),
        confidence: +(mag / this.w).toFixed(2),
        signals: this.parts,
      };
    },
  };
}

function boneNode(humanoid, name) {
  if (!humanoid) return null;
  const n = humanoid.getNormalizedBoneNode
    ? humanoid.getNormalizedBoneNode(name) : null;
  if (n) return n;
  return humanoid.getRawBoneNode ? humanoid.getRawBoneNode(name) : null;
}

function bonePos(humanoid, name, out) {
  const n = boneNode(humanoid, name);
  if (!n) return null;
  n.getWorldPosition(out);
  return out;
}

// Centroid (world) of vertices dominantly weighted to the head bone —
// the face mass sits forward of the head bone's pivot.
function headCentroid(vrm, headBone) {
  if (!headBone) return null;
  let cx = 0, cy = 0, cz = 0, count = 0;
  const v = new THREE.Vector3();
  vrm.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const geo = o.geometry;
    const skIdx = geo.getAttribute('skinIndex');
    const skWt = geo.getAttribute('skinWeight');
    const pos = geo.getAttribute('position');
    if (!skIdx || !skWt || !pos) return;
    const bones = o.skeleton.bones;
    let hi = -1;
    for (let i = 0; i < bones.length; i++) if (bones[i] === headBone) { hi = i; break; }
    if (hi < 0) return;
    for (let vi = 0; vi < pos.count; vi++) {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (skIdx.getComponent(vi, k) === hi) w = Math.max(w, skWt.getComponent(vi, k));
      }
      if (w < 0.5) continue;
      v.fromBufferAttribute(pos, vi).applyMatrix4(o.matrixWorld);
      cx += v.x; cy += v.y; cz += v.z; count++;
    }
  });
  if (!count) return null;
  return new THREE.Vector3(cx / count, cy / count, cz / count);
}

export function detectFacingVRM(vrm) {
  const vote = Voter();
  if (!vrm || !vrm.humanoid || !vrm.scene) return vote.result();
  vrm.scene.updateMatrixWorld(true);
  const H = vrm.humanoid;

  // (a) TOES — strongest tell: ankle/foot bone -> toe bone direction.
  {
    let sx = 0, sz = 0, sw = 0;
    for (const side of ['left', 'right']) {
      const foot = bonePos(H, side + 'Foot', new THREE.Vector3());
      const toe = bonePos(H, side + 'Toes', new THREE.Vector3());
      if (!foot || !toe) continue;
      const len = horizDir(foot, toe, _a);
      if (len < 0.008) continue; // toe bone parked at the foot — no info
      const w = 3 * Math.min(1, len / 0.06);
      sx += _a.x * w; sz += _a.z * w; sw += w;
    }
    if (sw > 0) {
      _b.set(sx / sw, 0, sz / sw);
      if (_b.lengthSq() > 1e-6) { _b.normalize(); vote.add('toes', _b, sw / 2); }
    }
  }

  const head = bonePos(H, 'head', new THREE.Vector3());

  // (b) EYES — eye bones sit in front of the head pivot.
  {
    const eL = bonePos(H, 'leftEye', new THREE.Vector3());
    const eR = bonePos(H, 'rightEye', new THREE.Vector3());
    if (head && (eL || eR)) {
      _c.set(0, 0, 0);
      let n = 0;
      if (eL) { _c.add(eL); n++; }
      if (eR) { _c.add(eR); n++; }
      _c.divideScalar(n);
      const len = horizDir(head, _c, _a);
      if (len > 0.004) vote.add('eyes', _a, 2 * Math.min(1, len / 0.03));
    }
  }

  // (c) HEAD GEOMETRY — face mass forward of the head pivot.
  let headGeoDir = null;
  if (head) {
    const cen = headCentroid(vrm, boneNode(H, 'head'));
    if (cen) {
      const len = horizDir(head, cen, _a);
      if (len > 0.006) {
        headGeoDir = _a.clone();
        vote.add('head', _a, 1.5 * Math.min(1, len / 0.04));
      }
    }
  }

  // (d) SHOULDER FRAME — the shoulder line gives an axis; its cross with
  // up gives a facing candidate. Only orients the vote (sign chosen by
  // agreement with the anatomical signals, else with +Z... no: without a
  // sign cue the frame alone can't tell front from back, so it only ever
  // reinforces, never decides.
  {
    const sL = bonePos(H, 'leftShoulder', new THREE.Vector3()) || bonePos(H, 'leftUpperArm', new THREE.Vector3());
    const sR = bonePos(H, 'rightShoulder', new THREE.Vector3()) || bonePos(H, 'rightUpperArm', new THREE.Vector3());
    if (sL && sR) {
      _a.subVectors(sL, sR); _a.y = 0;
      if (_a.lengthSq() > 1e-6) {
        _a.normalize();
        // up x side and side x up are the two candidate facings
        _b.set(-_a.z, 0, _a.x); // rotate side axis by +90° about Y
        const acc = new THREE.Vector3(vote.x, 0, vote.z);
        const ref = acc.lengthSq() > 1e-6 ? acc : headGeoDir;
        if (ref) {
          if (_b.dot(ref) < 0) _b.negate();
          vote.add('frame', _b, 1);
        }
      }
    }
  }

  return vote.result();
}

// Static-mesh variant for the auto-rigger: no bones exist yet, so read the
// geometry. Feet mass extends toward the toes from the ankle line; head
// mass sits forward of the neck band.
export function detectFacingScene(scene) {
  const vote = Voter();
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const H = size.y;
  if (!(H > 0) || !isFinite(H)) return vote.result();
  const minY = box.min.y;
  const Y = (f) => minY + f * H;

  const VX = [], VY = [], VZ = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const p = o.geometry.attributes.position;
    if (!p) return;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      VX.push(v.x); VY.push(v.y); VZ.push(v.z);
    }
  });
  const n = VX.length;
  if (!n) return vote.result();

  const centroid = (test) => {
    let x = 0, z = 0, c = 0;
    for (let i = 0; i < n; i++) {
      if (!test(VX[i], VY[i], VZ[i])) continue;
      x += VX[i]; z += VZ[i]; c++;
    }
    return c ? { x: x / c, z: z / c, c } : null;
  };

  // (a) FEET — foot-mass centroid (lowest band) vs ankle centroid (shin
  // band), per leg. The legs' separation axis is whichever horizontal
  // axis the ankle band spreads along (X when facing ±Z, Z when facing
  // ±X) — feet are clustered along it, not assumed. BOTH feet must vote
  // and agree: a single bent/crossed leg displaces one foot sideways and
  // must never read as "the model faces sideways."
  {
    const ank = [], ft = [];
    for (let i = 0; i < n; i++) {
      if (VY[i] >= Y(0.10) && VY[i] <= Y(0.32)) ank.push([VX[i], VZ[i]]);
      else if (VY[i] < Y(0.10)) ft.push([VX[i], VZ[i]]);
    }
    if (ank.length >= 12 && ft.length >= 12) {
      let mx = 0, mz = 0;
      for (const p of ank) { mx += p[0]; mz += p[1]; }
      mx /= ank.length; mz /= ank.length;
      let vx = 0, vz = 0;
      for (const p of ank) { vx += (p[0] - mx) * (p[0] - mx); vz += (p[1] - mz) * (p[1] - mz); }
      const axis = vx >= vz ? 0 : 1; // separation axis index into [x, z]
      const perp = 1 - axis;
      const cen = (pts, side) => {
        let a = 0, b = 0, c = 0;
        for (const p of pts) {
          if (side !== 0 && (p[axis] - (axis ? mz : mx)) * side < 0) continue;
          a += p[0]; b += p[1]; c++;
        }
        return c ? { x: a / c, z: b / c, c } : null;
      };
      const per = [];
      for (const sgn of [1, -1]) {
        const ankle = cen(ank, sgn);
        if (!ankle || ankle.c < 6) continue;
        // foot verts on the same side, near the ankle's own column
        const col = ft.filter((p) =>
          (p[axis] - (axis ? mz : mx)) * sgn >= 0 &&
          Math.abs(p[perp] - (perp ? ankle.z : ankle.x)) < 0.14 * H &&
          Math.abs(p[axis] - (axis ? ankle.z : ankle.x)) < 0.22 * H);
        const foot = cen(col.map((p) => [p[0], p[1]]), 0);
        if (!foot || foot.c < 6) continue;
        _a.set(foot.x - ankle.x, 0, foot.z - ankle.z);
        const len = _a.length();
        if (len < 0.015 * H) continue;
        _a.divideScalar(len);
        per.push({ dir: _a.clone(), w: 3 * Math.min(1, len / (0.05 * H)) });
      }
      if (per.length === 2 && per[0].dir.dot(per[1].dir) > 0.3) {
        _b.set(0, 0, 0);
        let sw = 0;
        for (const p of per) { _b.addScaledVector(p.dir, p.w); sw += p.w; }
        if (_b.lengthSq() > 1e-6) { _b.normalize(); vote.add('toes', _b, sw / 2); }
      }
    }
  }

  // (b) HEAD — head-band centroid vs neck-band centroid, CENTRAL COLUMN
  // ONLY: raised/drooped arm mass sits in the neck band off-axis and
  // would otherwise drag the centroid sideways into a phantom facing.
  {
    const headC = centroid((x, y) => Math.abs(x) < 0.14 * H && y >= Y(0.84));
    const neckC = centroid((x, y) => Math.abs(x) < 0.14 * H && y >= Y(0.74) && y < Y(0.84));
    if (headC && neckC && headC.c >= 8) {
      _a.set(headC.x - neckC.x, 0, headC.z - neckC.z);
      const len = _a.length();
      if (len > 0.008 * H) {
        _a.divideScalar(len);
        vote.add('head', _a, 1.5 * Math.min(1, len / (0.03 * H)));
      }
    }
  }

  return vote.result();
}
