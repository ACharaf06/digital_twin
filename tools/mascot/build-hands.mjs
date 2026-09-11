// Rig the existing high-detail Tripo hand and cuff. No service calls or credits.
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const fromWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const THREE = await import(fromWeb.resolve("three"));
const { GLTFExporter } = await import(
  fromWeb.resolve("three/examples/jsm/exporters/GLTFExporter.js")
);

// FileReader is the only DOM API needed to export this texture-free GLB in Node.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result =
        "data:" +
        blob.type +
        ";base64," +
        Buffer.from(result).toString("base64");
      this.onloadend?.();
    });
  }
};
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const sourcePoint = (x, z) => v((z + 0.025) * 4.15, (-x - 0.376) * 4.15, 0);
const fingers = [
  {
    name: "index",
    start: [-0.418, -0.011],
    end: [-0.474, -0.001],
    radius: 0.031,
  },
  {
    name: "middle",
    start: [-0.423, -0.028],
    end: [-0.481, -0.027],
    radius: 0.032,
  },
  {
    name: "ring",
    start: [-0.417, -0.046],
    end: [-0.469, -0.051],
    radius: 0.031,
  },
  {
    name: "pinky",
    start: [-0.399, -0.06],
    end: [-0.433, -0.074],
    radius: 0.029,
  },
  { name: "thumb", start: [-0.39, 0.001], end: [-0.433, 0.03], radius: 0.039 },
].map((f) => {
  const root = sourcePoint(...f.start),
    tip = sourcePoint(...f.end),
    length = root.distanceTo(tip);
  return {
    ...f,
    root,
    direction: tip.sub(root).normalize(),
    lengths: [length * 0.42, length * 0.34, length * 0.24],
  };
});
const smoothMin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const ellipsoid = (x, y, z, rx, ry, rz) => {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
};
const root = new THREE.Group();
root.name = "StudioHand";
const palmBone = new THREE.Bone();
palmBone.name = "palm";
root.add(palmBone);
const bones = [palmBone];
for (const f of fingers) {
  let parent = palmBone,
    distance = 0;
  f.indices = [];
  f.total = f.lengths.reduce((a, b) => a + b, 0);
  f.points = [];
  for (let i = 0; i < 3; i++) {
    const bone = new THREE.Bone();
    bone.name = f.name + "_" + i;
    if (i === 0) bone.position.copy(f.root);
    else bone.position.copy(f.direction).multiplyScalar(f.lengths[i - 1]);
    parent.add(bone);
    parent = bone;
    f.indices.push(bones.length);
    bones.push(bone);
    f.points.push(f.root.clone().addScaledVector(f.direction, distance));
    distance += f.lengths[i];
  }
  f.tip = f.root.clone().addScaledVector(f.direction, f.total);
}
const capsule = (p, f) => {
  const x = p.x - f.root.x,
    y = p.y - f.root.y,
    z = p.z - f.root.z;
  const t = THREE.MathUtils.clamp(
    x * f.direction.x + y * f.direction.y + z * f.direction.z,
    0,
    f.total,
  );
  const radius = f.radius * (1 - (0.24 * t) / f.total);
  return (
    Math.hypot(
      x - f.direction.x * t,
      y - f.direction.y * t,
      z - f.direction.z * t,
    ) - radius
  );
};
const point = v(0, 0, 0);
const data = JSON.parse(
  execFileSync(
    process.env.MASCOT_PYTHON || "python3",
    [new URL("./extract-source-hand.py", import.meta.url).pathname],
    { maxBuffer: 20 * 1024 * 1024 },
  ),
);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(data.positions, 3),
);
geometry.setAttribute(
  "normal",
  new THREE.Float32BufferAttribute(data.normals, 3),
);
geometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(data.colors, 3),
);
geometry.setIndex(data.indices);
const indices = [],
  weights = [];
for (let i = 0; i < geometry.attributes.position.count; i++) {
  point.fromBufferAttribute(geometry.attributes.position, i);
  // Blend the palm and all finger regions continuously. A nearest-finger
  // assignment creates a hard weight seam through the thumb pad and webbing.
  const palmDistance = smoothMin(
    ellipsoid(point.x, point.y - 0.105, point.z, 0.135, 0.115, 0.052),
    ellipsoid(point.x, point.y + 0.003, point.z - 0.001, 0.055, 0.16, 0.045),
    0.028,
  );
  const distances = fingers.map((f) => capsule(point, f));
  const minimum = Math.min(palmDistance, ...distances);
  const influences = new Map([[0, Math.exp((minimum - palmDistance) / 0.01)]]);

  for (let j = 0; j < fingers.length; j++) {
    const f = fingers[j];
    const regional = Math.exp((minimum - distances[j]) / 0.01);
    const along = point.clone().sub(f.root).dot(f.direction);
    const amount = THREE.MathUtils.smoothstep(along, -0.014, 0.027);
    influences.set(0, influences.get(0) + regional * (1 - amount));
    let joint = 0,
      progress = 0;
    if (along > f.lengths[0] + 0.02) {
      joint = 1;
      progress = THREE.MathUtils.smoothstep(
        along,
        f.lengths[0] + f.lengths[1] - 0.018,
        f.lengths[0] + f.lengths[1] + 0.018,
      );
    } else
      progress = THREE.MathUtils.smoothstep(
        along,
        f.lengths[0] - 0.02,
        f.lengths[0] + 0.02,
      );
    influences.set(f.indices[joint], regional * amount * (1 - progress));
    influences.set(
      f.indices[Math.min(2, joint + 1)],
      regional * amount * progress,
    );
  }
  const strongest = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = strongest.reduce((sum, entry) => sum + entry[1], 0);
  for (const [bone, weight] of strongest) {
    indices.push(bone);
    weights.push(weight / total);
  }
}
geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
geometry.setAttribute(
  "skinWeight",
  new THREE.Float32BufferAttribute(weights, 4),
);

const mesh = new THREE.SkinnedMesh(
  geometry,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
  }),
);
mesh.name = "FiveFingerHand";
root.add(mesh);
root.updateMatrixWorld(true);
mesh.bind(new THREE.Skeleton(bones));
mesh.castShadow = true;
mesh.receiveShadow = true;
root.userData.fingers = fingers.map((f) => ({
  name: f.name,
  direction: f.direction.toArray(),
  lengths: f.lengths,
}));
const glb = await new GLTFExporter().parseAsync(root, {
  binary: true,
  onlyVisible: false,
});
const path = new URL("../../web/src/assets/mascot/studio-hand.glb", import.meta.url);
await fs.writeFile(path, Buffer.from(glb));
console.log(
  JSON.stringify({
    file: path.pathname,
    vertices: geometry.attributes.position.count,
    triangles: geometry.index.count / 3,
    bones: bones.length,
    bytes: glb.byteLength,
  }),
);
