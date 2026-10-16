from pathlib import Path
p=Path('gamevui-save.js')
s=p.read_text()
s=s.replace('''\tfunction historyUnreadable(res) {\n\t\tif (!res || !res.ok || res.data == null) return true;\n\t\tif (res.data.raw && Object.keys(res.data).length === 1) return true;\n\t\treturn false;\n\t}\n''','''\tfunction historyUnreadable(res) {\n\t\tif (!res || !res.ok) return true;\n\t\tif (res.data && res.data.raw && Object.keys(res.data).length === 1) return true;\n\t\tvar text = String(res.text || "").trim();\n\t\tif (!text || text === "null") return false;\n\t\tvar dug = digHistory(res.data);\n\t\tif (dug.meta) return false;\n\t\treturn /Record|files|ygSave|ygSaves|MetaData|metadata/.test(text);\n\t}\n''')
p.write_text(s)
