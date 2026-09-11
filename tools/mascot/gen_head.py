from gradio_client import Client, handle_file
import shutil, os, time, traceback
t0=time.time()
def log(*a): print(f"[{time.time()-t0:7.1f}s]", *a, flush=True)
TOKEN=open(".hftoken").read().strip()
c = Client("microsoft/TRELLIS.2", token=TOKEN, verbose=False)
try: c.predict(api_name="/start_session")
except Exception: pass
pre = c.predict(input=handle_file("head_crop.png"), api_name="/preprocess_image")
shutil.copy(pre, "head_pre.png"); log("preprocessed")
log("image_to_3d on head crop ...")
c.predict(image=handle_file(pre), seed=0, resolution="1024",
          ss_sampling_steps=12, shape_slat_sampling_steps=12, tex_slat_sampling_steps=12,
          api_name="/image_to_3d")
log("done; extracting glb ...")
out = c.predict(decimation_target=100000, texture_size=2048, api_name="/extract_glb")
src = out[0] if isinstance(out,(list,tuple)) else out
shutil.copy(src, "charaf_head.glb")
log(f"saved charaf_head.glb ({os.path.getsize('charaf_head.glb')/1048576:.2f} MB)")
