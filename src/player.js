// A procedural football player built from lathes and spheres, rigged with
// joint groups so it can hold poses. All units are meters; the player faces +z
// and their left side is +x.
import * as THREE from './three.js';
import { hex } from './combo.js';
import { SKIN_TONES } from './team.js';
import * as paint from './textures.js';

const PI = Math.PI;

// ---------- geometry helpers ----------

// Resample a profile so v is proportional to arc length, then lathe it.
// Profiles run bottom to top so the faces point outward.
function profileLathe(points, { segments = 64, phiStart = 0, samples = 48 } = {}) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  const spaced = curve.getSpacedPoints(samples);
  return { geometry: new THREE.LatheGeometry(spaced, segments, phiStart), curve };
}

// Arc-length bookkeeping for painting a lathe: maps a height to a canvas row
// and reports the radius there.
function latheLayout(curve) {
  const pts = curve.getSpacedPoints(400);
  const length = curve.getLength();
  return {
    length,
    radiusAt(y) {
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].y >= y) {
          const a = pts[i - 1];
          const b = pts[i];
          const t = (y - a.y) / (b.y - a.y || 1);
          return a.x + (b.x - a.x) * t;
        }
      }
      return pts[pts.length - 1].x;
    },
    yToCanvas(y, H) {
      // Fraction of arc length from the bottom of the profile up to height y.
      let s = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (b.y >= y) {
          const t = (y - a.y) / (b.y - a.y || 1);
          s += a.distanceTo(b) * t;
          break;
        }
        s += a.distanceTo(b);
      }
      return H * (1 - s / length);
    },
  };
}

function canvasTexture(canvas, renderer) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function capsule(radius, length, color) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 20), color);
}

// ---------- helmet ----------

// Helmet unit space: a unit sphere stretched by HELMET_SCALE. The face opening
// and the lower edge are cut out of the sphere by triangle.
const HELMET_SCALE = new THREE.Vector3(0.13, 0.141, 0.158);
const OPENING = { x: 0.6, top: 0.2, z: 0.25 };
const bottomCut = (z) => -0.68 + 0.16 * z;

function inOpening(x, y, z) {
  return z > OPENING.z && y < OPENING.top && Math.abs(x) < OPENING.x;
}

function helmetShellGeometry() {
  const g = new THREE.SphereGeometry(1, 128, 80);
  g.rotateZ(-PI / 2); // poles out the ear holes so the center stripe is a band
  const pos = g.attributes.position;
  const index = g.index;
  const keep = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    if (!inOpening(x, y, z) && y > bottomCut(z)) keep.push(a, b, c);
  }
  g.setIndex(keep);
  return g;
}

// The rubber edge that runs around the face opening and the lower rim.
function helmetEdgeCurve() {
  const pts = [];
  // Lower rim from the right jaw, around the back, to the left jaw.
  const rim = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * PI * 2;
    let rho = 0.75;
    for (let k = 0; k < 20; k++) {
      const y = bottomCut(rho * Math.cos(a));
      rho = Math.sqrt(Math.max(0, 1 - y * y));
    }
    const x = rho * Math.sin(a);
    const z = rho * Math.cos(a);
    const y = bottomCut(z);
    if (!inOpening(x, y, z)) rim.push(new THREE.Vector3(x, y, z));
  }
  pts.push(...rim);
  const cornerY = rim[rim.length - 1].y;
  // Up the left side of the face opening, across the brow, down the right.
  for (let i = 0; i <= 10; i++) {
    const y = cornerY + ((OPENING.top - cornerY) * i) / 10;
    pts.push(new THREE.Vector3(-OPENING.x, y, Math.sqrt(Math.max(0, 1 - OPENING.x ** 2 - y * y))));
  }
  for (let i = 1; i < 12; i++) {
    const x = -OPENING.x + (2 * OPENING.x * i) / 12;
    pts.push(new THREE.Vector3(x, OPENING.top, Math.sqrt(1 - x * x - OPENING.top ** 2)));
  }
  for (let i = 0; i <= 10; i++) {
    const y = OPENING.top - ((OPENING.top - cornerY) * i) / 10;
    pts.push(new THREE.Vector3(OPENING.x, y, Math.sqrt(Math.max(0, 1 - OPENING.x ** 2 - y * y))));
  }
  return new THREE.CatmullRomCurve3(pts.map((p) => p.multiplyScalar(1.004).multiply(HELMET_SCALE)), true, 'centripetal');
}

// Facemask bars in helmet unit space, keyed by style.
function facemaskCurves(style) {
  const u = (x, y, z) => new THREE.Vector3(x, y, z).multiply(HELMET_SCALE);
  const bar = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => u(...p)), false, 'centripetal');
  const top = bar([[-0.7, 0.12, 0.74], [-0.5, 0.1, 1.02], [0, 0.08, 1.14], [0.5, 0.1, 1.02], [0.7, 0.12, 0.74]]);
  const mid = bar([[-0.8, -0.2, 0.62], [-0.55, -0.22, 1.04], [0, -0.26, 1.22], [0.55, -0.22, 1.04], [0.8, -0.2, 0.62]]);
  const low = bar([[-0.66, -0.56, 0.62], [-0.4, -0.64, 0.98], [0, -0.68, 1.1], [0.4, -0.64, 0.98], [0.66, -0.56, 0.62]]);
  const sideFull = (s) => bar([[0.42 * s, 0.09, 1.07], [0.45 * s, -0.22, 1.11], [0.4 * s, -0.63, 1.0]]);
  const sideShort = (s) => bar([[0.42 * s, 0.09, 1.07], [0.46 * s, -0.08, 1.1], [0.45 * s, -0.22, 1.11]]);
  const jaw = (s) => bar([[0.8 * s, -0.2, 0.62], [0.76 * s, -0.4, 0.66], [0.66 * s, -0.56, 0.62]]);
  const chinLoop = (s) => bar([[0.45 * s, -0.22, 1.11], [0.38 * s, -0.45, 1.06], [0.15 * s, -0.58, 1.06], [0, -0.6, 1.07]]);
  const center = bar([[0, 0.08, 1.14], [0, -0.26, 1.22], [0, -0.68, 1.1]]);
  if (style === 'two-bar') return [top, mid, sideShort(1), sideShort(-1), jaw(1), jaw(-1), chinLoop(1), chinLoop(-1)];
  const robotic = [top, mid, low, sideFull(1), sideFull(-1), jaw(1), jaw(-1)];
  return style === 'cage' ? [...robotic, center] : robotic;
}

// ---------- the player ----------

export class Player {
  constructor(renderer) {
    this.renderer = renderer;
    this.root = new THREE.Group();
    this.joints = {};
    this.decalImage = null;
    this.textures = {};
    this.canvases = {};
    this.layouts = {};
    this.pose = { current: 'idle', previous: 'idle', switchedAt: -10 };
    this.tmp = new THREE.Vector3();
    this.buildMaterials();
    this.build();
  }

  buildMaterials() {
    const fabric = { roughness: 0.78, sheen: 0.4, sheenRoughness: 0.6 };
    const C = (w, h) => paint.makeCanvas(w, h);
    this.canvases = {
      torso: C(2048, 768), sleeve: C(1024, 320), thigh: C(512, 512), pelvis: C(1024, 256),
      sock: C(256, 512), shell: C(1024, 512), decal: C(512, 512), ball: C(512, 256),
    };
    const T = (k) => (this.textures[k] = canvasTexture(this.canvases[k], this.renderer));
    for (const k of Object.keys(this.canvases)) T(k);
    // The right-side decal reads mirrored so artwork faces forward on both sides.
    this.textures.decalMirror = canvasTexture(this.canvases.decal, this.renderer);
    this.textures.decalMirror.wrapS = THREE.RepeatWrapping;
    this.textures.decalMirror.repeat.x = -1;

    this.m = {
      torso: new THREE.MeshPhysicalMaterial({ ...fabric, map: this.textures.torso }),
      pads: new THREE.MeshPhysicalMaterial({ ...fabric }),
      sleeve: new THREE.MeshPhysicalMaterial({ ...fabric, map: this.textures.sleeve, side: THREE.DoubleSide }),
      collar: new THREE.MeshPhysicalMaterial({ ...fabric }),
      thigh: new THREE.MeshPhysicalMaterial({ ...fabric, roughness: 0.5, sheen: 0.35, map: this.textures.thigh }),
      pelvis: new THREE.MeshPhysicalMaterial({ ...fabric, roughness: 0.5, sheen: 0.35, map: this.textures.pelvis }),
      belt: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      sock: new THREE.MeshPhysicalMaterial({ ...fabric, roughness: 0.85, map: this.textures.sock }),
      cleat: new THREE.MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
      sole: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      glove: new THREE.MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 0.3 }),
      skin: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      arm: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      tape: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.85 }),
      towel: new THREE.MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.95, side: THREE.DoubleSide }),
      shell: new THREE.MeshPhysicalMaterial({ map: this.textures.shell }),
      shellInner: new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.9, side: THREE.BackSide }),
      edge: new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.55 }),
      mask: new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      strap: new THREE.MeshStandardMaterial({ color: '#e9e9e6', roughness: 0.5 }),
      decal: new THREE.MeshPhysicalMaterial({
        map: this.textures.decal, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
      decalMirror: new THREE.MeshPhysicalMaterial({
        map: this.textures.decalMirror, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
      visor: new THREE.MeshPhysicalMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.05 }),
      eye: new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.3 }),
      ball: new THREE.MeshStandardMaterial({ map: this.textures.ball, roughness: 0.62 }),
    };
    paint.paintBall(this.canvases.ball);
    this.textures.ball.needsUpdate = true;
  }

  group(name, parent, [x, y, z]) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    this.joints[name] = g;
    return g;
  }

  add(parent, mesh, [x, y, z] = [0, 0, 0]) {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  build() {
    const m = this.m;
    const pelvis = this.group('pelvis', this.root, [0, 0.96, 0]);
    this.pelvisRestY = 0.96;

    // --- pants ---
    const pelvisLathe = profileLathe(
      [[0.02, -0.1], [0.1, -0.095], [0.152, -0.07], [0.168, -0.01], [0.168, 0.06], [0.162, 0.12]],
      { segments: 64 },
    );
    this.layouts.pelvis = { circumference: 2 * PI * 0.17 * 0.88 };
    const pelvisMesh = this.add(pelvis, new THREE.Mesh(pelvisLathe.geometry, m.pelvis));
    pelvisMesh.scale.z = 0.76;
    const belt = this.add(pelvis, new THREE.Mesh(new THREE.CylinderGeometry(0.166, 0.166, 0.03, 64, 1, true), m.belt), [0, 0.105, 0]);
    belt.scale.z = 0.77;
    // Towel tucked into the front of the belt.
    const towelGeo = new THREE.PlaneGeometry(0.085, 0.2, 6, 12);
    const tp = towelGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      const x = tp.getX(i);
      tp.setZ(i, 0.008 * Math.sin((x / 0.085) * PI * 2 + y * 9) + (y < 0 ? y * y * 0.35 : 0));
    }
    towelGeo.computeVertexNormals();
    this.towel = this.add(pelvis, new THREE.Mesh(towelGeo, m.towel), [-0.085, 0.01, 0.128]);
    this.towel.rotation.set(-0.1, 0.2, 0.04);

    const thigh = profileLathe(
      [[0.075, -0.49], [0.083, -0.44], [0.079, -0.39], [0.089, -0.3], [0.099, -0.17], [0.103, -0.04], [0.096, 0.07]],
      { segments: 56 },
    );
    this.layouts.thigh = { circumference: 2 * PI * 0.092 };
    const sock = profileLathe(
      [[0.045, -0.44], [0.043, -0.38], [0.052, -0.29], [0.063, -0.15], [0.066, -0.07], [0.066, 0.03]],
      { segments: 48 },
    );
    this.layouts.sock = { length: sock.curve.getLength() };

    for (const side of [1, -1]) {
      const s = side === 1 ? 'L' : 'R';
      const hip = this.group(`hip${s}`, pelvis, [0.09 * side, -0.02, 0]);
      const thighGeo = thigh.geometry.clone();
      if (side === -1) thighGeo.rotateY(PI);
      this.add(hip, new THREE.Mesh(thighGeo, m.thigh));
      const knee = this.group(`knee${s}`, hip, [0, -0.45, 0]);
      this.add(knee, new THREE.Mesh(sock.geometry, m.sock));
      const ankle = this.group(`ankle${s}`, knee, [0, -0.44, 0]);
      // Cleat: high-top collar, rounded upper, flat sole.
      this.add(ankle, new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.052, 0.07, 32), m.cleat), [0, -0.01, 0]);
      const upper = this.add(ankle, new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, 0, PI / 2), m.cleat), [0, -0.052, 0.035]);
      upper.scale.set(0.054, 0.062, 0.13);
      const sole = this.add(ankle, new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40), m.sole), [0, -0.058, 0.035]);
      sole.scale.set(0.056, 0.016, 0.133);
    }

    // --- torso and jersey ---
    const spine = this.group('spine', pelvis, [0, 0.1, 0]);
    const torso = profileLathe(
      [[0.164, -0.06], [0.168, 0.02], [0.174, 0.1], [0.19, 0.18], [0.214, 0.26], [0.236, 0.32], [0.246, 0.37], [0.236, 0.42], [0.19, 0.465], [0.09, 0.495]],
      { segments: 96, phiStart: PI, samples: 80 },
    );
    this.layouts.torso = latheLayout(torso.curve);
    const torsoMesh = this.add(spine, new THREE.Mesh(torso.geometry, m.torso));
    torsoMesh.scale.z = 0.68;

    const pads = this.add(spine, new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, PI * 2, 0, PI * 0.6), m.pads), [0, 0.395, -0.005]);
    pads.scale.set(0.315, 0.14, 0.205);
    const collar = this.add(spine, new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.0105, 14, 48), m.collar), [0, 0.523, 0.004]);
    collar.rotation.x = PI / 2 - 0.12;
    collar.scale.y = 0.9;

    // --- neck and head ---
    const neck = this.group('neck', spine, [0, 0.5, 0.005]);
    this.add(neck, new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.064, 0.17, 32), m.skin), [0, 0.05, 0]);
    const head = this.group('head', neck, [0, 0.112, 0.01]);
    const skull = this.add(head, new THREE.Mesh(new THREE.SphereGeometry(0.099, 40, 28), m.skin), [0, 0.05, 0.012]);
    skull.scale.set(0.98, 1.12, 1.04);
    for (const s of [1, -1]) this.add(head, new THREE.Mesh(new THREE.SphereGeometry(0.0115, 16, 12), m.eye), [0.036 * s, 0.072, 0.1]);
    this.buildHelmet(head);

    // --- arms ---
    const sleeveLen = 0.17;
    const sleeveGeo = new THREE.CylinderGeometry(0.088, 0.094, sleeveLen, 48, 1, true);
    this.layouts.sleeve = { circumference: 2 * PI * 0.091, length: sleeveLen };
    for (const side of [1, -1]) {
      const s = side === 1 ? 'L' : 'R';
      const shoulder = this.group(`shoulder${s}`, spine, [0.252 * side, 0.36, -0.005]);
      const geo = sleeveGeo.clone();
      if (side === -1) geo.rotateY(PI);
      this.add(shoulder, new THREE.Mesh(geo, m.sleeve), [0, -0.06, 0]);
      this.add(shoulder, capsule(0.057, 0.2, m.arm), [0, -0.14, 0]);
      const elbow = this.group(`elbow${s}`, shoulder, [0, -0.29, 0]);
      const fore = profileLathe([[0.001, -0.262], [0.035, -0.25], [0.042, -0.18], [0.05, -0.05], [0.047, 0.02], [0.001, 0.035]], { segments: 32 });
      this.add(elbow, new THREE.Mesh(fore.geometry, m.arm));
      this.add(elbow, new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.036, 0.04, 28), m.tape), [0, -0.235, 0]);
      const wrist = this.group(`wrist${s}`, elbow, [0, -0.258, 0]);
      const palm = this.add(wrist, new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), m.glove), [0, -0.05, 0]);
      palm.scale.set(0.024, 0.056, 0.046);
      for (let f = 0; f < 4; f++) {
        const finger = this.add(wrist, capsule(0.0105, 0.045, m.glove), [0, -0.122 + Math.abs(f - 1.5) * 0.006, -0.03 + f * 0.0185]);
        finger.rotation.x = -0.08;
      }
      const thumb = this.add(wrist, capsule(0.011, 0.04, m.glove), [-0.008 * side, -0.06, 0.05]);
      thumb.rotation.set(-0.7, 0, 0.25 * side);
    }

    // Ball, carried in the right hand.
    const ballLathe = profileLathe(
      Array.from({ length: 13 }, (_, i) => {
        const y = -0.14 + (0.28 * i) / 12;
        return [Math.max(0.004, 0.086 * Math.sqrt(Math.max(0, 1 - (y / 0.14) ** 2)) ** 0.9), y];
      }),
      { segments: 40, samples: 40 },
    );
    this.ball = this.add(this.joints.wristR, new THREE.Mesh(ballLathe.geometry, m.ball), [0.03, -0.08, 0.06]);
    this.ball.visible = false;
  }

  buildHelmet(head) {
    const m = this.m;
    const helmet = this.group('helmet', head, [0, 0.072, 0.006]);
    const shell = new THREE.Group();
    shell.scale.copy(HELMET_SCALE);
    helmet.add(shell);

    const geo = helmetShellGeometry();
    this.add(shell, new THREE.Mesh(geo, m.shell));
    this.add(shell, new THREE.Mesh(geo, m.shellInner)).scale.setScalar(0.985);
    this.layouts.shell = { length: PI * HELMET_SCALE.x };

    // Decals: small sphere patches over each ear, slightly above center.
    const a = 0.42;
    const b = 0.47;
    const tc = PI / 2 - 0.14;
    const right = new THREE.SphereGeometry(1.006, 24, 24, PI + 0.1 - a, 2 * a, tc - b, 2 * b);
    const left = new THREE.SphereGeometry(1.006, 24, 24, -0.1 - a, 2 * a, tc - b, 2 * b);
    this.decals = [
      this.add(shell, new THREE.Mesh(right, m.decal)),
      this.add(shell, new THREE.Mesh(left, m.decalMirror)),
    ];
    for (const d of this.decals) d.castShadow = false;

    // Visor across the eye line, mounted behind the top bar.
    const visorGeo = new THREE.SphereGeometry(1.075, 40, 12, PI / 2 - 0.7, 1.4, PI / 2 - 0.19, 0.42);
    this.visor = this.add(shell, new THREE.Mesh(visorGeo, m.visor));
    this.visor.castShadow = false;

    // Edge trim around the opening and lower rim.
    this.add(helmet, new THREE.Mesh(new THREE.TubeGeometry(helmetEdgeCurve(), 320, 0.0055, 10, true), m.edge));

    // Chin strap and cup.
    const cup = this.add(helmet, new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.strap), [0, -0.118, 0.106]);
    cup.scale.set(0.03, 0.02, 0.016);
    for (const s of [1, -1]) {
      const strap = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.022 * s, -0.116, 0.104),
        new THREE.Vector3(0.08 * s, -0.098, 0.07),
        new THREE.Vector3(0.114 * s, -0.066, 0.045),
      ]);
      this.add(helmet, new THREE.Mesh(new THREE.TubeGeometry(strap, 16, 0.0045, 8), m.strap));
    }

    this.maskGroup = new THREE.Group();
    helmet.add(this.maskGroup);
    this.helmetGroup = helmet;
  }

  setMaskStyle(style) {
    if (this.maskStyle === style) return;
    this.maskStyle = style;
    for (const c of [...this.maskGroup.children]) {
      c.geometry.dispose();
      this.maskGroup.remove(c);
    }
    for (const curve of facemaskCurves(style)) {
      this.add(this.maskGroup, new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0058, 10), this.m.mask));
    }
  }

  // ---------- apply a combo ----------

  apply(combo) {
    const m = this.m;
    const h = combo.helmet;

    paint.paintShell(this.canvases.shell, combo, this.layouts.shell);
    paint.paintDecal(this.canvases.decal, combo, h.decal === 'custom' ? this.decalImage : null);
    paint.paintTorso(this.canvases.torso, combo, this.layouts.torso);
    paint.paintSleeve(this.canvases.sleeve, combo, this.layouts.sleeve);
    paint.paintThigh(this.canvases.thigh, combo, this.layouts.thigh);
    paint.paintPelvis(this.canvases.pelvis, combo, this.layouts.pelvis);
    paint.paintSock(this.canvases.sock, combo, this.layouts.sock);
    for (const k of ['shell', 'decal', 'decalMirror', 'torso', 'sleeve', 'thigh', 'pelvis', 'sock']) {
      this.textures[k].needsUpdate = true;
    }

    // Shell finish.
    const finish = {
      gloss: { metalness: 0.0, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.04 },
      satin: { metalness: 0.15, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 },
      matte: { metalness: 0.0, roughness: 0.78, clearcoat: 0.0, clearcoatRoughness: 1 },
      chrome: { metalness: 1.0, roughness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.02 },
    }[h.finish] ?? {};
    Object.assign(m.shell, finish);
    for (const d of [m.decal, m.decalMirror]) {
      d.roughness = h.finish === 'matte' ? 0.7 : 0.35;
      d.clearcoat = h.finish === 'matte' ? 0 : 1;
    }
    for (const d of this.decals) d.visible = h.decal !== 'none' && !(h.decal === 'custom' && !this.decalImage);

    this.setMaskStyle(h.maskStyle);
    m.mask.color.set(hex(h.mask));

    const visor = {
      none: null,
      clear: { color: '#ffffff', opacity: 0.16, metalness: 0, iridescence: 0, clearcoat: 1 },
      smoke: { color: '#0d0d10', opacity: 0.86, metalness: 0.3, iridescence: 0, clearcoat: 1 },
      iridescent: { color: '#16161c', opacity: 0.88, metalness: 0.6, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900], clearcoat: 1 },
    }[h.visor];
    this.visor.visible = Boolean(visor);
    if (visor) {
      const { color, ...rest } = visor;
      Object.assign(m.visor, rest);
      m.visor.color.set(color);
      m.visor.needsUpdate = true;
    }

    const j = combo.jersey;
    const white = new THREE.Color('#ffffff');
    const sheen = (c) => new THREE.Color(hex(c)).lerp(white, 0.22);
    for (const k of ['torso', 'pads', 'sleeve']) m[k].sheenColor.copy(sheen(j.base));
    for (const k of ['thigh', 'pelvis']) m[k].sheenColor.copy(sheen(combo.pants.base));
    m.sock.sheenColor.copy(sheen(combo.socks.base));
    m.collar.sheenColor.copy(sheen(j.collar));
    m.pads.color.set(hex(j.base));
    m.collar.color.set(hex(j.collar));
    m.belt.color.set(hex(combo.pants.belt));
    m.cleat.color.set(hex(combo.cleats.base));
    m.sole.color.set(hex(combo.cleats.sole));
    m.glove.color.set(hex(combo.extras.gloves));
    const skin = SKIN_TONES[combo.extras.skin] ?? SKIN_TONES[2];
    m.skin.color.set(skin);
    const sleeves = combo.extras.armSleeves;
    m.arm.color.set(sleeves === 'none' ? skin : hex(sleeves));
    m.arm.roughness = sleeves === 'none' ? 0.6 : 0.5;
    this.towel.visible = combo.extras.towel;
  }

  setDecalImage(image) {
    this.decalImage = image;
  }

  // ---------- poses ----------

  setPose(name, time) {
    if (name === this.pose.current) return;
    this.pose.previous = this.pose.current;
    this.pose.current = name;
    this.pose.switchedAt = time;
  }

  update(time) {
    const w = Math.min(1, (time - this.pose.switchedAt) / 0.65);
    const ease = w * w * (3 - 2 * w);
    const a = POSES[this.pose.previous](time);
    const b = POSES[this.pose.current](time);
    for (const name of JOINTS) {
      const ra = a[name] ?? ZERO;
      const rb = b[name] ?? ZERO;
      this.joints[name].rotation.set(
        ra[0] + (rb[0] - ra[0]) * ease,
        ra[1] + (rb[1] - ra[1]) * ease,
        ra[2] + (rb[2] - ra[2]) * ease,
      );
    }
    const lift = (a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * ease;
    this.ball.visible = ease > 0.5 ? Boolean(b.ball) : Boolean(a.ball);

    // Plant the lowest foot on the turf, then add any jump.
    const pelvis = this.joints.pelvis;
    pelvis.position.y = this.pelvisRestY;
    this.root.updateMatrixWorld(true);
    const yl = this.joints.ankleL.getWorldPosition(this.tmp).y;
    const yr = this.joints.ankleR.getWorldPosition(this.tmp).y;
    pelvis.position.y += 0.0715 - Math.min(yl, yr) + lift;
  }
}

const ZERO = [0, 0, 0];
const JOINTS = [
  'pelvis', 'spine', 'neck', 'head',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
  'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
];

// Each pose returns joint rotations [x, y, z] for a given time.
// Conventions: negative x swings a limb forward; positive x bends a knee.
export const POSES = {
  idle(t) {
    const b = Math.sin(t * 1.6);
    const sway = Math.sin(t * 0.55);
    return {
      pelvis: [0, sway * 0.035, 0],
      spine: [0.02 + b * 0.012, -sway * 0.05, 0],
      neck: [0.04, sway * 0.12, 0],
      shoulderL: [0.05, 0, 0.2 + b * 0.012], shoulderR: [0.05, 0, -0.2 - b * 0.012],
      elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0],
      wristL: [0, 0.2, 0], wristR: [0, -0.2, 0],
      hipL: [0, 0.12, 0.06], hipR: [0, -0.12, -0.06],
      kneeL: [0.05, 0, 0], kneeR: [0.05, 0, 0],
      ankleL: [-0.05, 0, -0.06], ankleR: [-0.05, 0, 0.06],
    };
  },
  ready(t) {
    const b = Math.sin(t * 2.4) * 0.012;
    return {
      pelvis: [0.25, 0, 0],
      spine: [0.32 + b, 0, 0],
      neck: [-0.42, 0, 0],
      shoulderL: [-0.6, 0, 0.3], shoulderR: [-0.6, 0, -0.3],
      elbowL: [-0.95, 0, 0], elbowR: [-0.95, 0, 0],
      wristL: [0.25, 0.3, 0], wristR: [0.25, -0.3, 0],
      hipL: [-0.95, 0.14, 0.2], hipR: [-0.95, -0.14, -0.2],
      kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0],
      ankleL: [-0.3, 0, -0.2], ankleR: [-0.3, 0, 0.2],
    };
  },
  run(t) {
    const p = t * 9;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const leg = (sg) => {
      const hip = -0.35 - 0.75 * s * sg;
      const knee = 0.35 + 1.15 * Math.max(0, c * sg);
      return { hip, knee, ankle: -(0.12 + hip + knee) * 0.6 };
    };
    const L = leg(1);
    const R = leg(-1);
    return {
      pelvis: [0.12, s * 0.1, 0],
      spine: [0.16, -s * 0.16, 0],
      neck: [-0.22, s * 0.1, 0],
      shoulderL: [0.75 * s, 0, 0.16], elbowL: [-1.45, 0, 0], wristL: [0, 0.3, 0],
      shoulderR: [-0.3 + 0.1 * s, 0.55, -0.12], elbowR: [-1.9, 0, 0], wristR: [0.1, -0.3, 0],
      hipL: [L.hip, 0, 0.03], kneeL: [L.knee, 0, 0], ankleL: [L.ankle, 0, -0.03],
      hipR: [R.hip, 0, -0.03], kneeR: [R.knee, 0, 0], ankleR: [R.ankle, 0, 0.03],
      lift: Math.abs(s) * 0.045,
      ball: true,
    };
  },
  celebrate(t) {
    const p = t * 4.2;
    const j = Math.max(0, Math.sin(p));
    return {
      pelvis: [-0.04, 0, 0],
      spine: [-0.12, 0, 0],
      neck: [-0.3, 0, 0],
      shoulderL: [-0.2, 0, 2.5 + 0.12 * Math.sin(p)], shoulderR: [-0.2, 0, -2.5 - 0.12 * Math.sin(p)],
      elbowL: [-0.35, 0, 0], elbowR: [-0.35, 0, 0],
      wristL: [0, 0, 0], wristR: [0, 0, 0],
      hipL: [-0.2 * (1 - j), 0.1, 0.08], hipR: [-0.2 * (1 - j), -0.1, -0.08],
      kneeL: [0.4 * (1 - j), 0, 0], kneeR: [0.4 * (1 - j), 0, 0],
      ankleL: [-0.2 * (1 - j) + 0.2 * j, 0, -0.08], ankleR: [-0.2 * (1 - j) + 0.2 * j, 0, 0.08],
      lift: j * 0.11,
    };
  },
  heisman(t) {
    const b = Math.sin(t * 1.4) * 0.01;
    return {
      pelvis: [0, 0.3, 0],
      spine: [0.06 + b, 0.18, 0],
      neck: [0, -0.4, 0],
      shoulderL: [-1.5, 0, 0.1], elbowL: [-0.06, 0, 0], wristL: [-1.1, 1.5, 0],
      shoulderR: [-0.3, 0.3, -0.3], elbowR: [-1.9, 0, 0], wristR: [0.15, -0.3, 0],
      hipL: [-1.35, 0, 0.12], kneeL: [1.75, 0, 0], ankleL: [-0.35, 0, -0.1],
      hipR: [0.08, -0.1, -0.06], kneeR: [0.12, 0, 0], ankleR: [-0.2, 0, 0.06],
      ball: true,
    };
  },
};
