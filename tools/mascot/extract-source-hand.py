"""Extract the existing high-detail Tripo right hand and cuff; no API calls.

Emit a compact, welded mesh with source skin/clothing colors to the hand rigger.
Requires NumPy and Pillow. The source asset is restored only for a rebuild.
"""
from io import BytesIO
from pathlib import Path
import json
import struct
import numpy as np
from PIL import Image, ImageFilter

source = Path(__file__).resolve().parents[2] / 'assets-source/mascot/charaf-tripo-hd-original.glb'
if not source.exists():
    raise SystemExit(
        'missing assets-source/mascot/charaf-tripo-hd-original.glb; '
        'see tools/mascot/README.md for the recovery command'
    )
blob = source.read_bytes()
size = struct.unpack_from('<I', blob, 12)[0]
gltf = json.loads(blob[20:20 + size])
binary = blob[28 + size:]

def accessor(index):
    a = gltf['accessors'][index]
    view = gltf['bufferViews'][a['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
    width = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    return np.frombuffer(binary, dtype=dtype, count=a['count'] * width,
                         offset=view.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, width)

positions, normals, uv = accessor(0), accessor(1), accessor(2)
triangles = accessor(3).reshape(-1, 3)
# Include a cuff overlap: the joint must remain covered from the back as well.
triangles = triangles[np.max(positions[triangles, 0], axis=1) < -.31]
used, remap = np.unique(triangles, return_inverse=True)
triangles = remap.reshape(-1, 3)
positions, normals, uv = positions[used].copy(), normals[used].copy(), uv[used]
view = gltf['bufferViews'][gltf['images'][0]['bufferView']]
texture = Image.open(BytesIO(binary[view['byteOffset']:view['byteOffset'] + view['byteLength']])).convert('RGB')
# Reduce the source's speckled bake, retaining color variation and nail detail.
soft = np.array(texture.filter(ImageFilter.GaussianBlur(5))) / 255
sharp = np.array(texture) / 255
rows = np.clip((uv[:, 1] * texture.height).astype(int), 0, texture.height - 1)
cols = np.clip((uv[:, 0] * texture.width).astype(int), 0, texture.width - 1)
colors = soft[rows, cols] * .8 + sharp[rows, cols] * .2
colors = np.where(colors <= .04045, colors / 12.92, ((colors + .055) / 1.055) ** 2.4)
# Weld UV seams and reduce density while retaining the sculpted silhouette.
_, groups = np.unique(np.round(positions / .0016).astype(np.int32), axis=0, return_inverse=True)
count = np.bincount(groups)
def average(values):
    return np.stack([np.bincount(groups, weights=values[:, i]) / count for i in range(3)], axis=1)
positions, normals, colors = average(positions), average(normals), average(colors)
triangles = groups[triangles]
triangles = triangles[(triangles[:, 0] != triangles[:, 1]) & (triangles[:, 1] != triangles[:, 2]) & (triangles[:, 2] != triangles[:, 0])]
# Canonical coordinates: +Y along the fingers, +Z out through the palm.
positions = np.column_stack((positions[:, 2] + .025, -positions[:, 0] - .376, -.711 + positions[:, 1]))
positions[:, 2] *= -1
positions *= 4.15
# The source cuff overlaps inside the existing sleeve; taper its hidden end
# so two cloth surfaces cannot compete at the seam.
amount = np.clip((-.015 - positions[:, 1]) / .07, 0, 1)
amount = amount * amount * (3 - 2 * amount)
positions[:, 0] *= 1 - amount * .22
positions[:, 2] *= 1 - amount * .22
normals = np.column_stack((normals[:, 2], -normals[:, 0], -normals[:, 1]))
normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
# The coordinate permutation has positive determinant; winding is preserved.
print(json.dumps(dict(positions=positions.round(7).flatten().tolist(), normals=normals.round(6).flatten().tolist(),
                      colors=colors.round(6).flatten().tolist(), indices=triangles.flatten().tolist()), separators=(',', ':')))
