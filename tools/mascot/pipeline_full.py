"""
Charaf mascot asset pipeline.

  A-pose PNG  --TRELLIS.2-->  textured mesh  --UniRig-->  rigged GLB

TRELLIS.2 runs on HuggingFace ZeroGPU (needs a token for usable quota).
UniRig (jasongzy/UniRig) runs on a free CPU space -- no quota, no token.

usage:  HF_TOKEN=hf_xxx ./venv3d/bin/python pipeline_full.py [--skip-gen] [--skip-rig]
"""

import os
import shutil
import sys
import time

from gradio_client import Client, handle_file

T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:7.1f}s]", *a, flush=True)


TOKEN = os.environ.get("HF_TOKEN") or None
SRC = "apose.png"
MESH = "charaf_mesh.glb"      # textured, unrigged, straight from TRELLIS
RIGGED = "charaf_rigged.glb"  # skeleton + skin weights from UniRig

if TOKEN:
    log(f"using HF token …{TOKEN[-4:]}")
else:
    log("NO HF_TOKEN — ZeroGPU generation will likely hit the anonymous quota")


def generate():
    """TRELLIS.2: single image -> textured GLB."""
    c = Client("microsoft/TRELLIS.2", token=TOKEN, verbose=False)
    try:
        c.predict(api_name="/start_session")
    except Exception as e:
        log("start_session (non-fatal):", str(e)[:120])

    pre = c.predict(input=handle_file(SRC), api_name="/preprocess_image")
    shutil.copy(pre, "preprocessed.png")
    log("preprocessed ->", pre)

    log("image_to_3d (GPU, ~20-60s) …")
    c.predict(
        image=handle_file(pre),
        seed=0,
        resolution="1024",
        # a touch more shape guidance than default: helps hold the curl silhouette
        ss_sampling_steps=16,
        shape_slat_sampling_steps=16,
        tex_slat_sampling_steps=16,
        api_name="/image_to_3d",
    )
    log("image_to_3d done")

    log("extract_glb (GPU) …")
    out = c.predict(decimation_target=100000, texture_size=2048, api_name="/extract_glb")
    src = out[0] if isinstance(out, (list, tuple)) else out
    shutil.copy(src, MESH)
    log(f"saved {MESH} ({os.path.getsize(MESH) / 1048576:.2f} MB)")


def rig():
    """UniRig: mesh -> skeleton + skin weights."""
    c = Client("jasongzy/UniRig", token=TOKEN, verbose=False)
    log("UniRig process_pipeline (CPU, can take several minutes) …")
    out = c.predict(
        input_path=handle_file(MESH), output_format="glb", api_name="/process_pipeline"
    )
    src = out[0] if isinstance(out, (list, tuple)) else out
    shutil.copy(src, RIGGED)
    log(f"saved {RIGGED} ({os.path.getsize(RIGGED) / 1048576:.2f} MB)")


if __name__ == "__main__":
    if "--skip-gen" not in sys.argv:
        try:
            generate()
        except Exception as e:
            log("GENERATION FAILED:", type(e).__name__, str(e)[:400])
            sys.exit(1)
    if "--skip-rig" not in sys.argv:
        try:
            rig()
        except Exception as e:
            log("RIGGING FAILED:", type(e).__name__, str(e)[:400])
            sys.exit(2)
    log("pipeline complete")
