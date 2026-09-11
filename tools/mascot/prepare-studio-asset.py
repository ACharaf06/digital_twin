"""Make the runtime rig from the original Tripo GLB without changing skin/geometry.

Usage: python3 tools/mascot/prepare-studio-asset.py
Requires Pillow.
"""
from io import BytesIO
from pathlib import Path
import json
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'assets-source/mascot/charaf-animated.glb'
output = ROOT / 'web/src/assets/mascot/charaf-studio.glb'
blob = source.read_bytes()
assert blob[:4] == b'glTF' and struct.unpack_from('<I', blob, 4)[0] == 2
json_size = struct.unpack_from('<I', blob, 12)[0]
gltf = json.loads(blob[20:20 + json_size])
binary = blob[28 + json_size:]
assert not gltf.get('extensionsRequired'), 'Extend the packer before using a compressed source.'
# Runtime performances live in web/src/studio/motion.ts; imported tracks are unused.
gltf.pop('animations', None)
used = set()
for mesh in gltf['meshes']:
    for primitive in mesh['primitives']:
        used.update(primitive['attributes'].values())
        if 'indices' in primitive:
            used.add(primitive['indices'])
        for target in primitive.get('targets', []):
            used.update(target.values())
for skin in gltf.get('skins', []):
    if 'inverseBindMatrices' in skin:
        used.add(skin['inverseBindMatrices'])
accessor_map = {old: new for new, old in enumerate(sorted(used))}
gltf['accessors'] = [gltf['accessors'][old] for old in sorted(used)]
for mesh in gltf['meshes']:
    for primitive in mesh['primitives']:
        primitive['attributes'] = {key: accessor_map[value] for key, value in primitive['attributes'].items()}
        if 'indices' in primitive:
            primitive['indices'] = accessor_map[primitive['indices']]
        for target in primitive.get('targets', []):
            for key in target:
                target[key] = accessor_map[target[key]]
for skin in gltf.get('skins', []):
    if 'inverseBindMatrices' in skin:
        skin['inverseBindMatrices'] = accessor_map[skin['inverseBindMatrices']]
base_images = {
    gltf['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    for material in gltf['materials']
    if 'baseColorTexture' in material.get('pbrMetallicRoughness', {})
}
views, chunks, view_map = [], [], {}
length = 0

def append_view(view, data):
    global length
    padding = (-length) % 4
    chunks.append(b'\0' * padding)
    length += padding
    result = {**view, 'buffer': 0, 'byteOffset': length, 'byteLength': len(data)}
    views.append(result)
    chunks.append(data)
    length += len(data)
    return len(views) - 1

for accessor in gltf['accessors']:
    assert 'sparse' not in accessor, 'Sparse accessors need explicit remapping.'
    old = accessor['bufferView']
    if old not in view_map:
        view = gltf['bufferViews'][old]
        offset = view.get('byteOffset', 0)
        view_map[old] = append_view(view, binary[offset:offset + view['byteLength']])
    accessor['bufferView'] = view_map[old]
for index, image in enumerate(gltf['images']):
    view = gltf['bufferViews'][image['bufferView']]
    offset = view.get('byteOffset', 0)
    texture = Image.open(BytesIO(binary[offset:offset + view['byteLength']]))
    before = texture.size
    size = 2048 if index in base_images else 1024
    texture.thumbnail((size, size), Image.Resampling.LANCZOS)
    stream = BytesIO()
    texture.convert('RGB').save(stream, format='JPEG', quality=92, subsampling=0, optimize=True)
    image['mimeType'] = 'image/jpeg'
    image['bufferView'] = append_view({}, stream.getvalue())
    print(f'{image.get("name", index)}: {before} -> {texture.size}')
gltf['bufferViews'] = views
gltf['buffers'] = [{'byteLength': length}]
gltf['asset']['generator'] = 'Charaf studio asset packer (original Tripo skin and geometry)'
packed = b''.join(chunks)
packed += b'\0' * ((-len(packed)) % 4)
metadata = json.dumps(gltf, separators=(',', ':')).encode()
metadata += b' ' * ((-len(metadata)) % 4)
result = struct.pack('<III', 0x46546C67, 2, 28 + len(metadata) + len(packed))
result += struct.pack('<II', len(metadata), 0x4E4F534A) + metadata
result += struct.pack('<II', len(packed), 0x004E4942) + packed
output.write_bytes(result)
print(f'{output.relative_to(ROOT)}: {len(blob):,} -> {len(result):,} bytes ({100 * (1-len(result)/len(blob)):.1f}% smaller)')
