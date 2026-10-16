from pathlib import Path

p=Path('gamevui-save.js')
s=p.read_text()

s=s.replace('gvLog("GV_BUILD", 4);','gvLog("GV_BUILD", 5);',1)

old='''\t\t\tvar pri = MONEY_KEYS.indexOf(lk);\n\t\t\tif (!skipped && pri >= 0 && (typeof v === "number" || (typeof v === "string" && v !== "" && isFinite(Number(v))))) {\n\t\t\t\ttakeMoney(acc, String(k), pri, Number(v));\n\t\t\t} else if (v && typeof v === "object") {'''
new='''\t\t\tvar pri = MONEY_KEYS.indexOf(lk);\n\t\t\tvar numeric = typeof v === "number" || (typeof v === "string" && v !== "" && isFinite(Number(v)));\n\t\t\tvar moneyish = /money|coin|gold|cash|credit|currency|gem|buck|dollar/.test(lk);\n\t\t\tif (!skipped && numeric && (pri >= 0 || moneyish)) {\n\t\t\t\ttakeMoney(acc, String(k), pri >= 0 ? pri : 100, Number(v));\n\t\t\t} else if (v && typeof v === "object") {'''
if old not in s: raise SystemExit('walkMoney block missing')
s=s.replace(old,new,1)

anchor='''\tfunction findMoney(extraText) {'''
helper=r'''\tfunction moneyishFromRaw(text) {
\t\tif (!text) return null;
\t\tvar re = /[\"']?([^\"'\r\n,:=]{0,50}(?:money|coin|gold|cash|credit|currency|gem|buck|dollar)[^\"'\r\n,:=]{0,50})[\"']?\s*[:=]\s*[\"']?(-?\d+(?:\.\d+)?)/ig;
\t\tvar m, best = null;
\t\twhile ((m = re.exec(String(text)))) {
\t\t\tvar key = String(m[1] || '').trim();
\t\t\tvar lk = key.toLowerCase();
\t\t\tif (!key || SKIP_RE.test(lk)) continue;
\t\t\tvar n = Number(m[2]);
\t\t\tif (!isFinite(n) || n < 0) continue;
\t\t\tif (!best || n > best.val) best = { pri: 100, key: key, val: n };
\t\t}
\t\treturn best;
\t}

\tfunction logLocalMoneyCandidates() {
\t\tvar rows = [];
\t\tfor (var k in state.localKeys) {
\t\t\tif (!Object.prototype.hasOwnProperty.call(state.localKeys, k)) continue;
\t\t\tvar hit = moneyishFromRaw(state.localKeys[k]);
\t\t\tif (hit) rows.push(k + ':' + hit.key + '=' + hit.val);
\t\t}
\t\tgvLog('GV_LS_MONEY', rows.length ? rows.join(',') : 'none');
\t}

\tfunction requestUnityFsSync() {
\t\treturn new Promise(function (resolve) {
\t\t\tvar inst = window.__gvUnityInstance;
\t\t\tvar mod = inst && inst.Module;
\t\t\ttry {
\t\t\t\tif (mod && mod.FS && typeof mod.FS.syncfs === 'function') {
\t\t\t\t\tgvLog('GV_UNITY_FS_SYNC','FS');
\t\t\t\t\tmod.FS.syncfs(false, function () { resolve(); });
\t\t\t\t\tsetTimeout(resolve, 1200);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tif (mod && typeof mod._JS_FileSystem_Sync === 'function') {
\t\t\t\t\tgvLog('GV_UNITY_FS_SYNC','JS_FileSystem_Sync');
\t\t\t\t\tmod._JS_FileSystem_Sync();
\t\t\t\t\tsetTimeout(resolve, 1100);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t} catch (e) { }
\t\t\tgvLog('GV_UNITY_FS_SYNC','unavailable');
\t\t\tsetTimeout(resolve, 50);
\t\t});
\t}

'''.replace('\\t','\t')
if anchor not in s: raise SystemExit('findMoney anchor missing')
s=s.replace(anchor,helper+anchor,1)

old2='''\t\tif (extraText) {\n\t\t\traw = moneyFromRaw(extraText);\n\t\t\tif (raw) return raw;\n\t\t}\n\t\treturn null;'''
new2='''\t\tif (extraText) {\n\t\t\traw = moneyFromRaw(extraText);\n\t\t\tif (raw) return raw;\n\t\t\traw = moneyishFromRaw(extraText);\n\t\t\tif (raw) return raw;\n\t\t}\n\t\traw = moneyishFromRaw(state.ygSave);\n\t\tif (raw) return raw;\n\t\tfor (var rk in state.localKeys) {\n\t\t\tif (!Object.prototype.hasOwnProperty.call(state.localKeys, rk)) continue;\n\t\t\traw = moneyishFromRaw(state.localKeys[rk]);\n\t\t\tif (raw) return raw;\n\t\t}\n\t\treturn null;'''
if old2 not in s: raise SystemExit('findMoney tail missing')
s=s.replace(old2,new2,1)

s=s.replace('''\t\t\t\t\t\t\tlogPrefsCandidates(state.prefsValues);\n\t\t\t\t\t\t\trefreshMoney();''','''\t\t\t\t\t\t\tlogPrefsCandidates(state.prefsValues);\n\t\t\t\t\t\t\tlogLocalMoneyCandidates();\n\t\t\t\t\t\t\trefreshMoney();''',1)

old3='''\tfunction readMoney() {\n\t\trefreshMoney();\n\t\tif (state.money) {\n\t\t\tlogScore();\n\t\t\treturn Promise.resolve(scoreNumber(state.money));\n\t\t}\n\t\tif (state.idbBroken || saveOff || !state.gameDir) {\n\t\t\tlogScore();\n\t\t\treturn Promise.resolve(0);\n\t\t}\n\t\treturn readFilesForUpload().then(function (pack) {'''
new3='''\tfunction readMoney() {\n\t\treturn requestUnityFsSync().then(function () {\n\t\t\trefreshMoney();\n\t\t\tif (state.money) {\n\t\t\t\tlogScore();\n\t\t\t\treturn scoreNumber(state.money);\n\t\t\t}\n\t\t\tif (state.idbBroken || saveOff || !state.gameDir) {\n\t\t\t\tlogScore();\n\t\t\t\treturn 0;\n\t\t\t}\n\t\t\treturn readFilesForUpload().then(function (pack) {'''
if old3 not in s: raise SystemExit('readMoney head missing')
s=s.replace(old3,new3,1)
old4='''\t\t}).catch(function () {\n\t\t\tlogScore();\n\t\t\treturn scoreNumber(state.money);\n\t\t});\n\t}\n\n\tvar burstUntil = 0;'''
new4='''\t\t\t}).catch(function () {\n\t\t\t\tlogScore();\n\t\t\t\treturn scoreNumber(state.money);\n\t\t\t});\n\t\t});\n\t}\n\n\tvar burstUntil = 0;'''
if old4 not in s: raise SystemExit('readMoney tail missing')
s=s.replace(old4,new4,1)
p.write_text(s)

h=Path('index.html')
t=h.read_text()
t=t.replace('gamevui-save.js?v=4','gamevui-save.js?v=5',1)
t=t.replace('''                        myGameInstance = unityInstance;\n                        loadingCover.style.display = "none";''','''                        myGameInstance = unityInstance;\n                        window.__gvUnityInstance = unityInstance;\n                        loadingCover.style.display = "none";''',1)
h.write_text(t)
