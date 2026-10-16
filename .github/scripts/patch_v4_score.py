from pathlib import Path

p = Path('gamevui-save.js')
s = p.read_text()

s = s.replace('''\t\tscoreKey: "",\n\t\tlocalKeys: {},''','''\t\tscoreKey: "",\n\t\tprefsValues: {},\n\t\tlocalKeys: {},''',1)

s = s.replace('''\tvar MONEY_KEYS = ["playermoney", "currentmoney", "currentcoins", "currentcoin", "currentgold", "money", "coins", "coin", "gold", "cash", "balance", "currency", "softcurrency", "softmoney"];''','''\tvar MONEY_KEYS = ["playermoney", "currentmoney", "currentcoins", "currentcoin", "currentgold", "currentcash", "money", "coins", "coin", "gold", "cash", "balance", "currency", "softcurrency", "softmoney", "credits", "credit", "gems", "gem", "bucks", "buck", "dollars", "dollar"];''',1)

needle = '''\tfunction findMoney(extraText) {\n\t\tvar acc = { pri: -1, val: 0, key: "" };\n\t\tif (state.ygSave) {'''
repl = '''\tfunction findMoney(extraText) {\n\t\tvar acc = { pri: -1, val: 0, key: "" };\n\t\twalkMoney(state.prefsValues, acc, 0);\n\t\tif (acc.pri >= 0) return acc;\n\t\tif (state.ygSave) {'''
if needle not in s: raise SystemExit('findMoney anchor missing')
s = s.replace(needle,repl,1)

anchor = '''\tfunction readFilesForUpload() {'''
parser = r'''\tfunction parseUnityPrefs(bytes) {
\t\tvar out = {};
\t\ttry {
\t\t\tvar u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
\t\t\tif (u8.length < 16) return out;
\t\t\tvar sig = "";
\t\t\tfor (var si = 0; si < 8; si++) sig += String.fromCharCode(u8[si]);
\t\t\tif (sig !== "UnityPrf") return out;
\t\t\tvar view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
\t\t\tvar off = 16;
\t\t\tfunction ascii(start, len) {
\t\t\t\tvar v = "";
\t\t\t\tfor (var ai = 0; ai < len; ai++) v += String.fromCharCode(u8[start + ai]);
\t\t\t\treturn v;
\t\t\t}
\t\t\twhile (off < u8.length) {
\t\t\t\tvar keyLen = u8[off++];
\t\t\t\tif (!keyLen || off + keyLen + 1 > u8.length) break;
\t\t\t\tvar key = ascii(off, keyLen); off += keyLen;
\t\t\t\tvar type = u8[off++], val;
\t\t\t\tif (type === 0xFE) {
\t\t\t\t\tif (off + 4 > u8.length) break;
\t\t\t\t\tval = view.getInt32(off, true); off += 4;
\t\t\t\t} else if (type === 0xFD) {
\t\t\t\t\tif (off + 4 > u8.length) break;
\t\t\t\t\tval = view.getFloat32(off, true); off += 4;
\t\t\t\t} else {
\t\t\t\t\tvar len = type;
\t\t\t\t\tif (type === 0x80) {
\t\t\t\t\t\tif (off + 4 > u8.length) break;
\t\t\t\t\t\tlen = view.getUint32(off, true); off += 4;
\t\t\t\t\t}
\t\t\t\t\tif (type > 0x80 && type < 0xFD || type === 0xFF || off + len > u8.length) break;
\t\t\t\t\tval = ascii(off, len); off += len;
\t\t\t\t}
\t\t\t\tout[key] = val;
\t\t\t}
\t\t} catch (e) { return {}; }
\t\treturn out;
\t}

\tfunction logPrefsCandidates(map) {
\t\tvar rows = [];
\t\tfor (var k in map) {
\t\t\tif (!Object.prototype.hasOwnProperty.call(map, k)) continue;
\t\t\tvar v = map[k];
\t\t\tif (typeof v !== "number" || !isFinite(v)) continue;
\t\t\tif (/money|coin|gold|cash|credit|currency|gem|dollar|buck|score/i.test(k)) rows.push(k + "=" + v);
\t\t}
\t\tgvLog("GV_PREFS_MONEY", rows.length ? rows.join(",") : "none");
\t}

'''
if anchor not in s: raise SystemExit('readFiles anchor missing')
s = s.replace(anchor,parser+anchor,1)

oldprefs = '''\t\t\t\t\t\tif (/\\/PlayerPrefs$/.test(key)) {\n\t\t\t\t\t\t\tpack.prefsText = bytesToLatin1(u8);'''
newprefs = '''\t\t\t\t\t\tif (/\\/PlayerPrefs$/.test(key)) {\n\t\t\t\t\t\t\tstate.prefsValues = parseUnityPrefs(u8);\n\t\t\t\t\t\t\tlogPrefsCandidates(state.prefsValues);\n\t\t\t\t\t\t\trefreshMoney();\n\t\t\t\t\t\t\tpack.prefsText = bytesToLatin1(u8);'''
if oldprefs not in s: raise SystemExit('prefs block missing')
s = s.replace(oldprefs,newprefs,1)

s = s.replace('''\t\t\tstate.money = 0;''','''\t\t\tstate.money = 0;\n\t\t\tstate.prefsValues = {};''',1)

p.write_text(s)
