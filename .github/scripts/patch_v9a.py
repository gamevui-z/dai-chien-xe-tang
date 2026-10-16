from pathlib import Path
p=Path('gamevui-save.js')
s=p.read_text()
if 'gvLog("GV_BUILD", 8);' not in s: raise SystemExit('build marker')
s=s.replace('gvLog("GV_BUILD", 8);','gvLog("GV_BUILD", 9);',1)
old="\t\tgvLog('GV_LS_MONEY', rows.length ? rows.join(',') : 'none');"
new="\t\tgvLog('GV_LS_KEYS', Object.keys(state.localKeys).join(',') || 'none');\n\t\tgvLog('GV_LS_MONEY', rows.length ? rows.join(',') : 'none');"
if old not in s: raise SystemExit('ls marker')
s=s.replace(old,new,1)
a='\t\tprevPrefsRaw: null,\n\t\tlocalKeys: {},'
b='\t\tprevPrefsRaw: null,\n\t\tpersistedMoney: null,\n\t\tlocalKeys: {},'
if a not in s: raise SystemExit('state marker')
s=s.replace(a,b,1)
p.write_text(s)

# Expose Unity virtual FS without changing its behavior.
g=Path('game.js');x=g.read_text()
a='''    function _JS_FileSystem_Initialize() {\n        if (typeof window !== "undefined") window.__gvUnityFsSync = function(done) {'''
b='''    function _JS_FileSystem_Initialize() {\n        if (typeof window !== "undefined") {\n            window.__gvUnityFS = FS;\n            window.__gvUnityFsSync = function(done) {'''
if a not in x: raise SystemExit('game fs open marker')
x=x.replace(a,b,1)
a='''            catch (e) { try { if (typeof done === "function") done(e); } catch (e2) {} return false }\n        };\n        Module.setInterval(function() {'''
b='''            catch (e) { try { if (typeof done === "function") done(e); } catch (e2) {} return false }\n            };\n        }\n        Module.setInterval(function() {'''
if a not in x: raise SystemExit('game fs close marker')
x=x.replace(a,b,1)
g.write_text(x)

h=Path('index.html');t=h.read_text()
if 'gamevui-save.js?v=8' not in t: raise SystemExit('index marker')
h.write_text(t.replace('gamevui-save.js?v=8','gamevui-save.js?v=9',1))
