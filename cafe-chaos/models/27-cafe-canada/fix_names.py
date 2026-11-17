"""Strip Blender's `.001` style suffixes from node, mesh, material and image names in .glb files.

Several characters are built in one Blender scene, so the second one's objects are `Body.001`,
`Head.001`...; the game looks nodes up by their plain names. Run after an export:

  python3 fix_names.py a.glb b.glb ...
"""
import json, re, struct, sys

SUFFIX = re.compile(r"\.\d{3}$")

def fix(path):
    b = open(path, "rb").read()
    assert b[:4] == b"glTF", path
    ln = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + ln])
    changed = 0
    for key in ("nodes", "meshes", "materials", "images", "skins", "cameras"):
        for it in j.get(key, []):
            n = it.get("name")
            if n and SUFFIX.search(n):
                it["name"] = SUFFIX.sub("", n); changed += 1
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    rest = b[20 + ln:]
    out = b"glTF" + struct.pack("<II", 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<I", len(js)) + b"JSON" + js + rest
    open(path, "wb").write(out)
    return changed

for p in sys.argv[1:]:
    print(p.split("/")[-1], "renamed", fix(p))
