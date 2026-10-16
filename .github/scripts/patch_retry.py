from pathlib import Path
p=Path('gamevui-save.js')
s=p.read_text()
needle='''\tfunction debugSaveText(label, text) {'''
helper='''\tfunction loadHistorySafe(attempt) {\n\t\treturn withTimeout(getHistory(), 5000).then(function (res) {\n\t\t\tgvLog("GV_LOAD_RAW", res.status, String(res.text || "").slice(0, 300));\n\t\t\tif (historyUnreadable(res)) throw new Error("history unreadable");\n\t\t\treturn res;\n\t\t}).catch(function (err) {\n\t\t\tif (attempt >= 1) throw err;\n\t\t\tgvLog("GV_LOAD_RETRY", err && err.message ? err.message : err);\n\t\t\treturn loadHistorySafe(attempt + 1);\n\t\t});\n\t}\n\n'''
if 'function loadHistorySafe' not in s:s=s.replace(needle,helper+needle)
old='''\t\treturn withTimeout(getHistory(), 5000).then(function (res) {\n\t\t\tgvLog("GV_LOAD_RAW", res.status, String(res.text || "").slice(0, 300));\n\t\t\tif (historyUnreadable(res)) throw new Error("history unreadable");\n'''
s=s.replace(old,'\t\treturn loadHistorySafe(0).then(function (res) {\n')
p.write_text(s)
