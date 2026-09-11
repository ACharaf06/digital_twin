# Mascot maintenance

The application ships two browser assets in `web/src/assets/mascot/`:

- `charaf-studio.glb` is produced from `assets-source/mascot/charaf-animated.glb`;
- `studio-hand.glb` is committed and normally treated as an immutable runtime asset.

Create a tooling environment before rebuilding the body:

```bash
python3.11 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/mascot/prepare-studio-asset.py
node tools/mascot/inspect-glb.mjs web/src/assets/mascot/charaf-studio.glb
```

The 54 MiB high-resolution hand source is deliberately absent from the working
tree. It remains recoverable from the commit immediately before the cleanup:

```bash
mkdir -p assets-source/mascot
git show 50d1bba:assets/3d/draft/charaf-tripo-hd-original.glb > assets-source/mascot/charaf-tripo-hd-original.glb
MASCOT_PYTHON=tools/.venv/bin/python node tools/mascot/build-hands.mjs
```

`extract-source-hand.py` extracts and welds the source mesh. `build-hands.mjs`
rigs it and writes the runtime GLB. Neither command calls an external service.
