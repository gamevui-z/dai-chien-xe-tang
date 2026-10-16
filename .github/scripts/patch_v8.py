from pathlib import Path
p=Path('gamevui-save.js')
s=p.read_text()
if 'gvLog("GV_BUILD", 7);' not in s: raise SystemExit('build marker missing')
s=s.replace('gvLog("GV_BUILD", 7);','gvLog("GV_BUILD", 8);',1)
s=s.replace('\t\tprefsValues: {},\n\t\tlocalKeys: {},','\t\tprefsValues: {},\n\t\tprevPrefsRaw: null,\n\t\tlocalKeys: {},',1)
marker='\tfunction logPrefsCandidates(map) {'
probe='''\tfunction copyPrefsBytes(bytes) { var s=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0),o=new Uint8Array(s.length); o.set(s); return o; }\n\tfunction i32le(b,o) { if(!b||o<0||o+4>b.length)return null; return new DataView(b.buffer,b.byteOffset,b.byteLength).getInt32(o,true); }\n\tfunction logPrefsByteDelta(a,b) {\n\t\tif(!a||!a.length){ gvLog("GV_PREFS_BYTE_DELTA","baseline","bytes="+(b?b.length:0)); return; }\n\t\tvar n=Math.min(a.length,b.length), seen={}, changed=0, rows=[];\n\t\tfor(var i=0;i<n;i++) if(a[i]!==b[i]){ changed++; for(var d=-3;d<=0;d++){var x=i+d;if(x>=0&&x+4<=n)seen[x]=1;} }\n\t\tfor(var k in seen){ var x=Number(k),v1=i32le(a,x),v2=i32le(b,x); if(v1===v2)continue; if(v1>=0&&v2>=0&&v1<=1000000000&&v2<=1000000000){ rows.push("off="+x+":"+v1+"->"+v2); if(rows.length>=80)break; } }\n\t\tgvLog("GV_PREFS_BYTE_DELTA","changed="+changed,rows.length?rows.join(","):"no-i32-candidate");\n\t}\n\n'''
if marker not in s: raise SystemExit('prefs marker missing')
s=s.replace(marker,probe+marker,1)
old='''\t\t\t\t\t\tif (/\\/PlayerPrefs$/.test(key)) {\n\t\t\t\t\t\t\tstate.prefsValues = parseUnityPrefs(u8);'''
new='''\t\t\t\t\t\tif (/\\/PlayerPrefs$/.test(key)) {\n\t\t\t\t\t\t\tlogPrefsByteDelta(state.prevPrefsRaw,u8);\n\t\t\t\t\t\t\tstate.prevPrefsRaw=copyPrefsBytes(u8);\n\t\t\t\t\t\t\tstate.prefsValues = parseUnityPrefs(u8);'''
if old not in s: raise SystemExit('read marker missing')
s=s.replace(old,new,1)
old='\t\t\tmapped.push({ path: path, mode: f.m || 33206, bytes: base64ToBytes(f.d || "") });'
new='''\t\t\tvar mb=base64ToBytes(f.d || "");\n\t\t\tmapped.push({ path:path, mode:f.m||33206, bytes:mb });\n\t\t\tif (/\\/PlayerPrefs$/.test(path)) { state.prevPrefsRaw=copyPrefsBytes(mb); gvLog("GV_PREFS_BYTE_BASELINE","bytes="+mb.length); }'''
if old not in s: raise SystemExit('cloud marker missing')
s=s.replace(old,new,1)
p.write_text(s)
h=Path('index.html')
t=h.read_text()
if 'gamevui-save.js?v=7' not in t: raise SystemExit('index marker missing')
h.write_text(t.replace('gamevui-save.js?v=7','gamevui-save.js?v=8',1))
