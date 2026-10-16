from pathlib import Path
p=Path('gamevui-save.js')
s=p.read_text()
bad='''\tfunction loadHistorySafe(attempt) {\n\t\treturn loadHistorySafe(0).then(function (res) {\n\t\t\treturn res;\n\t\t}).catch(function (err) {\n\t\t\tif (attempt >= 1) throw err;\n\t\t\tgvLog("GV_LOAD_RETRY", err && err.message ? err.message : err);\n\t\t\treturn loadHistorySafe(attempt + 1);\n\t\t});\n\t}\n'''
good='''\tfunction loadHistorySafe(attempt) {\n\t\treturn withTimeout(getHistory(), 5000).then(function (res) {\n\t\t\tgvLog("GV_LOAD_RAW", res.status, String(res.text || "").slice(0, 300));\n\t\t\tif (historyUnreadable(res)) throw new Error("history unreadable");\n\t\t\treturn res;\n\t\t}).catch(function (err) {\n\t\t\tif (attempt >= 1) throw err;\n\t\t\tgvLog("GV_LOAD_RETRY", err && err.message ? err.message : err);\n\t\t\treturn loadHistorySafe(attempt + 1);\n\t\t});\n\t}\n'''
if bad in s:
    s=s.replace(bad,good)
elif 'function loadHistorySafe' not in s:
    s=s.replace('\tfunction debugSaveText(label, text) {',good+'\n\tfunction debugSaveText(label, text) {')
old='''\t\treturn withTimeout(getHistory(), 5000).then(function (res) {\n\t\t\tgvLog("GV_LOAD_RAW", res.status, String(res.text || "").slice(0, 300));\n\t\t\tif (historyUnreadable(res)) throw new Error("history unreadable");\n'''
init_start=s.find('\tfunction init() {')
if init_start>=0:
    tail=s[init_start:]
    if old in tail:
        tail=tail.replace(old,'\t\treturn loadHistorySafe(0).then(function (res) {\n',1)
        s=s[:init_start]+tail
p.write_text(s)
