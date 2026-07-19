"""Build a Kudu-friendly zip (standard deflate, forward-slash entries) from a
publish directory. bsdtar/Compress-Archive zips have proven unreliable for
OneDeploy; python zipfile + the classic /api/zipdeploy endpoint is what lands."""
import os, sys, zipfile

pub, zippath = sys.argv[1], sys.argv[2]
if os.path.exists(zippath):
    os.remove(zippath)
n = 0
with zipfile.ZipFile(zippath, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(pub):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, pub).replace(os.sep, "/")
            z.write(full, rel)
            n += 1
print(f"zipped {n} files, {os.path.getsize(zippath)} bytes")
