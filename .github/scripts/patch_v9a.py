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
marker='\tfunction logLocalMoneyCandidates() {'
if marker not in s: raise SystemExit('reader marker')
helper=r'''\tfunction scanUnityFsMoney() {
\t\tvar fs = window.__gvUnityFS;
\t\tif (!fs || typeof fs.readdir !== 'function' || typeof fs.stat !== 'function' || typeof fs.readFile !== 'function') { gvLog('GV_FS_SCAN','unavailable'); return null; }
\t\tvar best = null, rows = [], seen = {}, files = 0;
\t\tfunction take(hit, path) {
\t\t\tif (!hit || !isFinite(Number(hit.val)) || Number(hit.val) < 0) return;
\t\t\tvar cand = { pri: hit.pri == null ? 100 : Number(hit.pri), key: 'fs:' + path + ':' + String(hit.key || ''), val: Number(hit.val) };
\t\t\tif (!best || cand.pri < best.pri || (cand.pri === best.pri && Number(best.val) <= 0 && cand.val > 0)) best = cand;
\t\t}
\t\tfunction walk(path, depth) {
\t\t\tif (depth > 5 || files > 160 || seen[path]) return;
\t\t\tseen[path] = true;
\t\t\tvar names;
\t\t\ttry { names = fs.readdir(path); } catch (e) { return; }
\t\t\tfor (var i = 0; i < names.length && files <= 160; i++) {
\t\t\t\tvar name = names[i]; if (name === '.' || name === '..') continue;
\t\t\t\tvar full = path === '/' ? '/' + name : path + '/' + name, st;
\t\t\t\ttry { st = fs.stat(full); } catch (e2) { continue; }
\t\t\t\tvar isDir = false;
\t\t\t\ttry { isDir = fs.isDir ? fs.isDir(st.mode) : false; } catch (e3) {}
\t\t\t\tif (isDir) { if (!/^\/(proc|dev|sys)(\/|$)/.test(full)) walk(full, depth + 1); continue; }
\t\t\t\tfiles++;
\t\t\t\tvar size = Number(st.size || 0); rows.push(full + '#' + size);
\t\t\t\tif (size <= 0 || size > 524288) continue;
\t\t\t\ttry {
\t\t\t\t\tvar bytes = fs.readFile(full, { encoding: 'binary' });
\t\t\t\t\tvar text = bytesToLatin1(bytes);
\t\t\t\t\tvar hit = moneyFromRaw(text) || moneyishFromRaw(text);
\t\t\t\t\ttake(hit, full);
\t\t\t\t} catch (e4) {}
\t\t\t}
\t\t}
\t\twalk('/', 0);
\t\tgvLog('GV_FS_MAP', rows.length ? rows.join(',') : 'none');
\t\tstate.persistedMoney = best;
\t\tif (best) gvLog('GV_FS_MONEY', 'key=' + best.key, 'value=' + scoreNumber(best.val)); else gvLog('GV_FS_MONEY','none');
\t\treturn best;
\t}

'''
s=s.replace(marker,helper+marker,1)
a='\tfunction findMoney(extraText) {\n\t\tvar acc = { pri: -1, val: 0, key: "" };'
b='\tfunction findMoney(extraText) {\n\t\tif (state.persistedMoney && Number(state.persistedMoney.val) > 0) return state.persistedMoney;\n\t\tvar acc = { pri: -1, val: 0, key: "" };'
if a not in s: raise SystemExit('find marker')
s=s.replace(a,b,1)
a='\tfunction readMoney() {\n\t\treturn requestUnityFsSync().then(function () {\n\t\t\trefreshMoney();'
b='\tfunction readMoney() {\n\t\treturn requestUnityFsSync().then(function () {\n\t\t\tscanUnityFsMoney();\n\t\t\trefreshMoney();'
if a not in s: raise SystemExit('read marker')
s=s.replace(a,b,1)
a='\t\t\treadMoney().then(function (n) {\n\t\t\t\ttry {'
b='\t\t\treadMoney().then(function (n) {\n\t\t\t\tgvLog("GV_SCORE_SUBMIT", n);\n\t\t\t\ttry {'
if a not in s: raise SystemExit('submit marker')
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
