# 產生可發佈成 Claude Artifact 的版本：python tools/build_artifact.py
# Artifact 會自動包上 <!doctype><html><head><body>，所以這裡只輸出 head 內需要的標籤與 body 內容。
import os
import re
import shutil

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DIST = os.path.join(ROOT, "dist")

src = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
head = re.search(r"<head>(.*?)</head>", src, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", src, re.S).group(1)

keep = []
for line in head.splitlines():
    s = line.strip()
    if s.startswith("<meta charset") or s.startswith('<meta name="viewport"') or 'rel="icon"' in s or "apple-touch-icon" in s:
        continue
    if s:
        keep.append(s)

if os.path.isdir(DIST):
    shutil.rmtree(DIST)
os.makedirs(DIST)
with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as f:
    f.write("\n".join(keep) + "\n" + body.strip() + "\n")
for d in ("css", "js"):
    shutil.copytree(os.path.join(ROOT, d), os.path.join(DIST, d))
os.makedirs(os.path.join(DIST, "assets", "img"))
for name in os.listdir(os.path.join(ROOT, "assets", "img")):
    if name.endswith(".webp"):
        shutil.copy(os.path.join(ROOT, "assets", "img", name), os.path.join(DIST, "assets", "img", name))
print("dist/ 已產生")
