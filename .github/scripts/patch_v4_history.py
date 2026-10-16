from pathlib import Path

p = Path('gamevui-save.js')
s = p.read_text()

old = '''\tfunction historyUnreadable(res) {\n\t\tif (!res || !res.ok) return true;\n\t\tif (res.data && res.data.raw && Object.keys(res.data).length === 1) return true;\n\t\tvar text = String(res.text || "").trim();\n\t\tif (!text || text === "null") return false;\n\t\tvar dug = digHistory(res.data);\n\t\tif (dug.meta) return false;\n\t\treturn /Record|files|ygSave|ygSaves|MetaData|metadata/.test(text);\n\t}\n'''
new = '''\tfunction hasExplicitEmptyMeta(obj, depth) {\n\t\tif (depth == null) depth = 0;\n\t\tif (obj == null || depth > 6 || typeof obj !== "object") return false;\n\t\tif (Object.prototype.toString.call(obj) === "[object Array]") {\n\t\t\tfor (var i = 0; i < obj.length; i++) if (hasExplicitEmptyMeta(obj[i], depth + 1)) return true;\n\t\t\treturn false;\n\t\t}\n\t\tvar metaKeys = ["MetaData", "metadata", "metaData"];\n\t\tfor (var m = 0; m < metaKeys.length; m++) {\n\t\t\tvar mk = metaKeys[m];\n\t\t\tif (!Object.prototype.hasOwnProperty.call(obj, mk)) continue;\n\t\t\tvar mv = obj[mk];\n\t\t\tif (mv == null || mv === "" || mv === "null") return true;\n\t\t}\n\t\tvar wrapKeys = ["data", "Data", "result", "Result", "d"];\n\t\tfor (var w = 0; w < wrapKeys.length; w++) {\n\t\t\tvar k = wrapKeys[w];\n\t\t\tif (obj[k] != null && hasExplicitEmptyMeta(obj[k], depth + 1)) return true;\n\t\t}\n\t\treturn false;\n\t}\n\n\tfunction historyUnreadable(res) {\n\t\tif (!res || !res.ok) return true;\n\t\tif (res.data && res.data.raw && Object.keys(res.data).length === 1) return true;\n\t\tvar text = String(res.text || "").trim();\n\t\tif (!text || text === "null") return false;\n\t\tvar dug = digHistory(res.data);\n\t\tif (dug.meta) return false;\n\t\tif (/Record|files|ygSave|ygSaves/.test(text)) return true;\n\t\tif (hasExplicitEmptyMeta(res.data, 0)) return false;\n\t\treturn /MetaData|metadata|metaData/.test(text);\n\t}\n'''
if old not in s:
    raise SystemExit('historyUnreadable block not found')
s = s.replace(old, new, 1)

get_block = '''\t\tproto.getItem = function (key) {\n\t\t\tvar value = protoGet.call(this, key);\n\t\t\tif (this === localStorage && value != null && !skipStorageKey(key)) {\n\t\t\t\trememberLocalKey(key, value);\n\t\t\t\tif (debugSave) gvLog("GV_LS_READ", String(key));\n\t\t\t}\n\t\t\treturn value;\n\t\t};\n'''
if get_block + get_block in s:
    s = s.replace(get_block + get_block, get_block, 1)

s = s.replace('gvLog("GV_BUILD", 3);', 'gvLog("GV_BUILD", 4);', 1)
p.write_text(s)

h = Path('index.html')
t = h.read_text().replace('gamevui-save.js?v=3', 'gamevui-save.js?v=4', 1)
h.write_text(t)
