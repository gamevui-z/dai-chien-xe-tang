(function () {
	"use strict";

	var DB_NAME = "/idbfs";
	var DB_VERSION = 21;
	var STORE = "FILE_DATA";
	var META_KEY = "gv_tank_meta";
	var MAX_SMALL = 524288;
	var MAX_RECORD_CHARS = 500000;
	var MONEY_KEYS = ["playermoney", "currentmoney", "currentcoins", "currentcoin", "currentgold", "money", "coins", "coin", "gold", "cash", "balance", "currency", "softcurrency", "softmoney"];
	var SKIP_RE = /cost|price|best|max|high|require|horsepower|powerpreference/;

	var params = new URLSearchParams(location.search || "");
	var saveOff = params.get("gvsave") === "0";
	var debugSave = params.get("gvdebug") === "1";
	var gid = params.get("gid") || "";
	var token = params.get("token") || "";

	var origSetItem = localStorage.setItem.bind(localStorage);
	var origGetItem = localStorage.getItem.bind(localStorage);
	var origRemoveItem = localStorage.removeItem.bind(localStorage);

	var state = {
		cloudActive: false,
		expectedUpdatedAt: null,
		dirty: false,
		resetting: false,
		seeding: false,
		idbBroken: false,
		pollBusy: false,
		flushing: false,
		gameDir: "",
		ygSave: "",
		scoreKey: "",
		localKeys: {},
		lastStamp: null,
		needInitialPush: false,
		seedApplied: false,
		money: 0,
		loopStarted: false,
		retryTimer: null,
		conflictRetries: 0
	};

	function gvLog() {
		var fn = window.__gvLog || console.log;
		try { fn.apply(console, arguments); } catch (e) { /* ignore */ }
	}

	function documentDirUrl() {
		var url = String(document.URL || location.href || "");
		var cut = url.indexOf("?");
		if (cut >= 0) url = url.substring(0, cut);
		cut = url.indexOf("#");
		if (cut >= 0) url = url.substring(0, cut);
		var slash = url.lastIndexOf("/");
		return slash >= 0 ? url.substring(0, slash) : url;
	}

	function utf8Bytes(str) {
		if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
		var s = unescape(encodeURIComponent(str));
		var a = new Uint8Array(s.length);
		for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
		return a;
	}

	function md5Hex(str) {
		var bytes = utf8Bytes(str);
		var extra = [128, 32768, 8388608, -2147483648];
		var shift = [0, 8, 16, 24];
		var n = bytes.length;
		var blocksCount = ((n + 8) >>> 6) + 1;
		var words = new Array(blocksCount * 16);
		var i;
		for (i = 0; i < words.length; i++) words[i] = 0;
		for (i = 0; i < n; i++) words[i >>> 2] |= bytes[i] << shift[i & 3];
		words[n >>> 2] |= extra[n & 3];
		var totalBits = n * 8;
		words[words.length - 2] = totalBits << 0;
		words[words.length - 1] = (Math.floor(totalBits / 4294967296) << 0);
		var h0 = 0, h1 = 0, h2 = 0, h3 = 0, first = true;
		var hexChars = "0123456789abcdef";
		function hashBlock(blocks) {
			var a, b, c, d, bc, da;
			if (first) {
				a = blocks[0] - 680876937;
				a = (a << 7 | a >>> 25) - 271733879 << 0;
				d = (-1732584194 ^ a & 2004318071) + blocks[1] - 117830708;
				d = (d << 12 | d >>> 20) + a << 0;
				c = (-271733879 ^ (d & (a ^ -271733879))) + blocks[2] - 1126478375;
				c = (c << 17 | c >>> 15) + d << 0;
				b = (a ^ (c & (d ^ a))) + blocks[3] - 1316259209;
				b = (b << 22 | b >>> 10) + c << 0;
			} else {
				a = h0; b = h1; c = h2; d = h3;
				a += (d ^ (b & (c ^ d))) + blocks[0] - 680876936;
				a = (a << 7 | a >>> 25) + b << 0;
				d += (c ^ (a & (b ^ c))) + blocks[1] - 389564586;
				d = (d << 12 | d >>> 20) + a << 0;
				c += (b ^ (d & (a ^ b))) + blocks[2] + 606105819;
				c = (c << 17 | c >>> 15) + d << 0;
				b += (a ^ (c & (d ^ a))) + blocks[3] - 1044525330;
				b = (b << 22 | b >>> 10) + c << 0;
			}
			a += (d ^ (b & (c ^ d))) + blocks[4] - 176418897;
			a = (a << 7 | a >>> 25) + b << 0;
			d += (c ^ (a & (b ^ c))) + blocks[5] + 1200080426;
			d = (d << 12 | d >>> 20) + a << 0;
			c += (b ^ (d & (a ^ b))) + blocks[6] - 1473231341;
			c = (c << 17 | c >>> 15) + d << 0;
			b += (a ^ (c & (d ^ a))) + blocks[7] - 45705983;
			b = (b << 22 | b >>> 10) + c << 0;
			a += (d ^ (b & (c ^ d))) + blocks[8] + 1770035416;
			a = (a << 7 | a >>> 25) + b << 0;
			d += (c ^ (a & (b ^ c))) + blocks[9] - 1958414417;
			d = (d << 12 | d >>> 20) + a << 0;
			c += (b ^ (d & (a ^ b))) + blocks[10] - 42063;
			c = (c << 17 | c >>> 15) + d << 0;
			b += (a ^ (c & (d ^ a))) + blocks[11] - 1990404162;
			b = (b << 22 | b >>> 10) + c << 0;
			a += (d ^ (b & (c ^ d))) + blocks[12] + 1804603682;
			a = (a << 7 | a >>> 25) + b << 0;
			d += (c ^ (a & (b ^ c))) + blocks[13] - 40341101;
			d = (d << 12 | d >>> 20) + a << 0;
			c += (b ^ (d & (a ^ b))) + blocks[14] - 1502002290;
			c = (c << 17 | c >>> 15) + d << 0;
			b += (a ^ (c & (d ^ a))) + blocks[15] + 1236535329;
			b = (b << 22 | b >>> 10) + c << 0;
			a += (c ^ (d & (b ^ c))) + blocks[1] - 165796510;
			a = (a << 5 | a >>> 27) + b << 0;
			d += (b ^ (c & (a ^ b))) + blocks[6] - 1069501632;
			d = (d << 9 | d >>> 23) + a << 0;
			c += (a ^ (b & (d ^ a))) + blocks[11] + 643717713;
			c = (c << 14 | c >>> 18) + d << 0;
			b += (d ^ (a & (c ^ d))) + blocks[0] - 373897302;
			b = (b << 20 | b >>> 12) + c << 0;
			a += (c ^ (d & (b ^ c))) + blocks[5] - 701558691;
			a = (a << 5 | a >>> 27) + b << 0;
			d += (b ^ (c & (a ^ b))) + blocks[10] + 38016083;
			d = (d << 9 | d >>> 23) + a << 0;
			c += (a ^ (b & (d ^ a))) + blocks[15] - 660478335;
			c = (c << 14 | c >>> 18) + d << 0;
			b += (d ^ (a & (c ^ d))) + blocks[4] - 405537848;
			b = (b << 20 | b >>> 12) + c << 0;
			a += (c ^ (d & (b ^ c))) + blocks[9] + 568446438;
			a = (a << 5 | a >>> 27) + b << 0;
			d += (b ^ (c & (a ^ b))) + blocks[14] - 1019803690;
			d = (d << 9 | d >>> 23) + a << 0;
			c += (a ^ (b & (d ^ a))) + blocks[3] - 187363961;
			c = (c << 14 | c >>> 18) + d << 0;
			b += (d ^ (a & (c ^ d))) + blocks[8] + 1163531501;
			b = (b << 20 | b >>> 12) + c << 0;
			a += (c ^ (d & (b ^ c))) + blocks[13] - 1444681467;
			a = (a << 5 | a >>> 27) + b << 0;
			d += (b ^ (c & (a ^ b))) + blocks[2] - 51403784;
			d = (d << 9 | d >>> 23) + a << 0;
			c += (a ^ (b & (d ^ a))) + blocks[7] + 1735328473;
			c = (c << 14 | c >>> 18) + d << 0;
			b += (d ^ (a & (c ^ d))) + blocks[12] - 1926607734;
			b = (b << 20 | b >>> 12) + c << 0;
			bc = b ^ c;
			a += (bc ^ d) + blocks[5] - 378558;
			a = (a << 4 | a >>> 28) + b << 0;
			d += (bc ^ a) + blocks[8] - 2022574463;
			d = (d << 11 | d >>> 21) + a << 0;
			da = d ^ a;
			c += (da ^ b) + blocks[11] + 1839030562;
			c = (c << 16 | c >>> 16) + d << 0;
			b += (da ^ c) + blocks[14] - 35309556;
			b = (b << 23 | b >>> 9) + c << 0;
			bc = b ^ c;
			a += (bc ^ d) + blocks[1] - 1530992060;
			a = (a << 4 | a >>> 28) + b << 0;
			d += (bc ^ a) + blocks[4] + 1272893353;
			d = (d << 11 | d >>> 21) + a << 0;
			da = d ^ a;
			c += (da ^ b) + blocks[7] - 155497632;
			c = (c << 16 | c >>> 16) + d << 0;
			b += (da ^ c) + blocks[10] - 1094730640;
			b = (b << 23 | b >>> 9) + c << 0;
			bc = b ^ c;
			a += (bc ^ d) + blocks[13] + 681279174;
			a = (a << 4 | a >>> 28) + b << 0;
			d += (bc ^ a) + blocks[0] - 358537222;
			d = (d << 11 | d >>> 21) + a << 0;
			da = d ^ a;
			c += (da ^ b) + blocks[3] - 722521979;
			c = (c << 16 | c >>> 16) + d << 0;
			b += (da ^ c) + blocks[6] + 76029189;
			b = (b << 23 | b >>> 9) + c << 0;
			bc = b ^ c;
			a += (bc ^ d) + blocks[9] - 640364487;
			a = (a << 4 | a >>> 28) + b << 0;
			d += (bc ^ a) + blocks[12] - 421815835;
			d = (d << 11 | d >>> 21) + a << 0;
			da = d ^ a;
			c += (da ^ b) + blocks[15] + 530742520;
			c = (c << 16 | c >>> 16) + d << 0;
			b += (da ^ c) + blocks[2] - 995338651;
			b = (b << 23 | b >>> 9) + c << 0;
			a += (c ^ (b | ~d)) + blocks[0] - 198630844;
			a = (a << 6 | a >>> 26) + b << 0;
			d += (b ^ (a | ~c)) + blocks[7] + 1126891415;
			d = (d << 10 | d >>> 22) + a << 0;
			c += (a ^ (d | ~b)) + blocks[14] - 1416354905;
			c = (c << 15 | c >>> 17) + d << 0;
			b += (d ^ (c | ~a)) + blocks[5] - 57434055;
			b = (b << 21 | b >>> 11) + c << 0;
			a += (c ^ (b | ~d)) + blocks[12] + 1700485571;
			a = (a << 6 | a >>> 26) + b << 0;
			d += (b ^ (a | ~c)) + blocks[3] - 1894986606;
			d = (d << 10 | d >>> 22) + a << 0;
			c += (a ^ (d | ~b)) + blocks[10] - 1051523;
			c = (c << 15 | c >>> 17) + d << 0;
			b += (d ^ (c | ~a)) + blocks[1] - 2054922799;
			b = (b << 21 | b >>> 11) + c << 0;
			a += (c ^ (b | ~d)) + blocks[8] + 1873313359;
			a = (a << 6 | a >>> 26) + b << 0;
			d += (b ^ (a | ~c)) + blocks[15] - 30611744;
			d = (d << 10 | d >>> 22) + a << 0;
			c += (a ^ (d | ~b)) + blocks[6] - 1560198380;
			c = (c << 15 | c >>> 17) + d << 0;
			b += (d ^ (c | ~a)) + blocks[13] + 1309151649;
			b = (b << 21 | b >>> 11) + c << 0;
			a += (c ^ (b | ~d)) + blocks[4] - 145523070;
			a = (a << 6 | a >>> 26) + b << 0;
			d += (b ^ (a | ~c)) + blocks[11] - 1120210379;
			d = (d << 10 | d >>> 22) + a << 0;
			c += (a ^ (d | ~b)) + blocks[2] + 718787259;
			c = (c << 15 | c >>> 17) + d << 0;
			b += (d ^ (c | ~a)) + blocks[9] - 343485551;
			b = (b << 21 | b >>> 11) + c << 0;
			if (first) {
				h0 = a + 1732584193 << 0;
				h1 = b - 271733879 << 0;
				h2 = c - 1732584194 << 0;
				h3 = d + 271733878 << 0;
				first = false;
			} else {
				h0 = h0 + a << 0;
				h1 = h1 + b << 0;
				h2 = h2 + c << 0;
				h3 = h3 + d << 0;
			}
		}
		for (var off = 0; off < words.length; off += 16) {
			hashBlock(words.slice(off, off + 16));
		}
		function hexWord(h) {
			return hexChars.charAt((h >>> 4) & 15) + hexChars.charAt(h & 15) +
				hexChars.charAt((h >>> 12) & 15) + hexChars.charAt((h >>> 8) & 15) +
				hexChars.charAt((h >>> 20) & 15) + hexChars.charAt((h >>> 16) & 15) +
				hexChars.charAt((h >>> 28) & 15) + hexChars.charAt((h >>> 24) & 15);
		}
		return hexWord(h0) + hexWord(h1) + hexWord(h2) + hexWord(h3);
	}

	function inGameDir(path) {
		return path === state.gameDir || path.indexOf(state.gameDir + "/") === 0;
	}

	function skipStorageKey(key) {
		if (!key) return true;
		var k = String(key);
		if (k.indexOf("gv_") === 0) return true;
		if (k === "LocalKeys" || k.indexOf("LocalKeys") === 0) return true;
		if (k.length > 180) return true;
		return false;
	}

	function loadMeta() {
		try {
			var raw = origGetItem(META_KEY);
			if (!raw) return;
			var o = JSON.parse(raw);
			if (o && String(o.gid || "") === String(gid || "") && o.expectedUpdatedAt) state.expectedUpdatedAt = String(o.expectedUpdatedAt);
		} catch (e) { /* ignore */ }
	}

	function saveMeta() {
		try {
			origSetItem(META_KEY, JSON.stringify({ gid: gid, expectedUpdatedAt: state.expectedUpdatedAt }));
		} catch (e) { /* ignore */ }
	}

	function markDirty() {
		if (state.resetting || state.seeding || saveOff || !state.seedApplied) return;
		state.dirty = true;
	}

	function rememberLocalKey(key, value) {
		if (state.seeding || state.resetting || skipStorageKey(key)) return;
		var text = String(value);
		if (text.length > 200000) return;
		var k = String(key);
		if (state.localKeys[k] === text) return;
		state.localKeys[k] = text;
		if (debugSave) gvLog("GV_LS_WRITE", k);
		refreshMoney();
		markDirty();
	}

	function patchLocalStorage() {
		if (window.__gvLsPatched || saveOff) return;
		window.__gvLsPatched = true;
		var proto = Storage.prototype;
		var protoSet = proto.setItem;
		var protoGet = proto.getItem;
		var protoRemove = proto.removeItem;
		proto.setItem = function (key, value) {
			protoSet.call(this, key, value);
			if (this === localStorage) rememberLocalKey(key, value);
		};
		proto.getItem = function (key) {
			var value = protoGet.call(this, key);
			if (this === localStorage && value != null && !skipStorageKey(key)) {
				rememberLocalKey(key, value);
				if (debugSave) gvLog("GV_LS_READ", String(key));
			}
			return value;
		};
		proto.getItem = function (key) {
			var value = protoGet.call(this, key);
			if (this === localStorage && value != null && !skipStorageKey(key)) {
				rememberLocalKey(key, value);
				if (debugSave) gvLog("GV_LS_READ", String(key));
			}
			return value;
		};
		proto.removeItem = function (key) {
			protoRemove.call(this, key);
			if (this !== localStorage || state.seeding || state.resetting || skipStorageKey(key)) return;
			if (state.localKeys[String(key)] != null) {
				delete state.localKeys[String(key)];
				markDirty();
			}
		};
	}

	function noteYgSave(jsonData) {
		if (state.resetting || state.seeding || saveOff) return;
		if (jsonData == null) return;
		state.ygSave = typeof jsonData === "string" ? jsonData : JSON.stringify(jsonData);
		refreshMoney();
		markDirty();
	}

	function hasYgSave() {
		return !!(state.ygSave && state.ygSave !== "noData");
	}

	function applyYgLoad(sendback, inst) {
		var msg = JSON.stringify([state.ygSave]);
		if (sendback && inst && inst.SendMessage) {
			inst.SendMessage("YandexGame", "SetLoadSaves", msg);
			gvLog("GV_YG_DELIVERED");
		}
		logYgLoaded();
		return Promise.resolve(msg);
	}

	function logYgLoaded() {
		var idSave = "";
		try {
			var parsed = JSON.parse(state.ygSave);
			if (parsed && parsed.idSave != null) idSave = parsed.idSave;
		} catch (e) { /* ignore */ }
		refreshMoney();
		gvLog("GV_YG_LOADED", "idSave=" + idSave, "money=" + scoreNumber(state.money));
	}

	function takeMoney(acc, key, pri, num) {
		if (!isFinite(num)) return;
		if (acc.pri < 0 || pri < acc.pri) {
			acc.pri = pri;
			acc.val = num;
			acc.key = key;
		}
	}

	function walkMoney(node, acc, depth) {
		if (node == null || depth > 8) return;
		if (typeof node === "string") {
			var t = node.trim();
			if (t.charAt(0) === "{" || t.charAt(0) === "[") {
				try { walkMoney(JSON.parse(t), acc, depth + 1); } catch (e) { /* ignore */ }
			}
			return;
		}
		if (typeof node !== "object") return;
		if (Object.prototype.toString.call(node) === "[object Array]") {
			for (var i = 0; i < node.length; i++) walkMoney(node[i], acc, depth + 1);
			return;
		}
		for (var k in node) {
			if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
			var lk = String(k).toLowerCase();
			var v = node[k];
			var skipped = SKIP_RE.test(lk);
			var pri = MONEY_KEYS.indexOf(lk);
			if (!skipped && pri >= 0 && (typeof v === "number" || (typeof v === "string" && v !== "" && isFinite(Number(v))))) {
				takeMoney(acc, String(k), pri, Number(v));
			} else if (v && typeof v === "object") {
				walkMoney(v, acc, depth + 1);
			}
		}
	}

	function moneyFromRaw(text) {
		if (!text) return null;
		var best = null;
		for (var i = 0; i < MONEY_KEYS.length; i++) {
			var re = new RegExp("\"" + MONEY_KEYS[i] + "\"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)", "i");
			var m = re.exec(text);
			if (m && (best == null || i < best.pri)) best = { pri: i, key: MONEY_KEYS[i], val: Number(m[1]) };
		}
		return best;
	}

	function findMoney(extraText) {
		var acc = { pri: -1, val: 0, key: "" };
		if (state.ygSave) {
			try { walkMoney(JSON.parse(state.ygSave), acc, 0); } catch (e) { walkMoney(state.ygSave, acc, 0); }
		}
		walkMoney(state.localKeys, acc, 0);
		if (acc.pri >= 0) return acc;
		var raw = moneyFromRaw(state.ygSave);
		if (raw) return raw;
		for (var k in state.localKeys) {
			if (!Object.prototype.hasOwnProperty.call(state.localKeys, k)) continue;
			raw = moneyFromRaw(state.localKeys[k]);
			if (raw) return raw;
		}
		if (extraText) {
			raw = moneyFromRaw(extraText);
			if (raw) return raw;
		}
		return null;
	}

	function refreshMoney(extraText) {
		var found = findMoney(extraText);
		state.money = found ? found.val : 0;
		state.scoreKey = found ? found.key : "";
	}

	function logScore() {
		gvLog("GV_SCORE_SRC", "key=" + (state.scoreKey || ""), "value=" + scoreNumber(state.money));
	}

	function scoreNumber(n) {
		n = Number(n);
		if (!isFinite(n) || n < 0) return 0;
		return Math.floor(n);
	}

	function progressFromSave() {
		var level = 0;
		var stage = 0;
		function walk(node, depth) {
			if (!node || typeof node !== "object" || depth > 6) return;
			if (typeof node === "string") return;
			for (var k in node) {
				if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
				var lk = String(k).toLowerCase();
				var v = node[k];
				if (typeof v === "number" && isFinite(v)) {
					if (lk === "currentlevel" || lk === "levelindex") level = v;
					else if (lk === "currentstage" || lk === "stage" || lk === "wave") stage = v;
				} else if (v && typeof v === "object") {
					walk(v, depth + 1);
				}
			}
		}
		if (state.ygSave) {
			try { walk(JSON.parse(state.ygSave), 0); } catch (e) { /* ignore */ }
		}
		return { level: Math.max(0, Math.floor(level) || 0), stage: Math.max(0, Math.floor(stage) || 0) };
	}

	function bytesToBase64(bytes) {
		var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
		var chunk = 0x8000;
		var s = "";
		for (var i = 0; i < u8.length; i += chunk) {
			s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunk, u8.length)));
		}
		return btoa(s);
	}

	function base64ToBytes(b64) {
		if (!b64) return new Uint8Array(0);
		var bin = atob(b64);
		var out = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}

	function bytesToLatin1(bytes) {
		if (!bytes || !bytes.length) return "";
		var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
		var chunk = 0x8000;
		var s = "";
		for (var i = 0; i < u8.length; i += chunk) {
			s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunk, u8.length)));
		}
		return s;
	}

	function idbOpen() {
		return new Promise(function (resolve, reject) {
			if (state.idbBroken || saveOff || typeof indexedDB === "undefined") {
				state.idbBroken = true;
				reject(new Error("idb off"));
				return;
			}
			var done = false;
			var timer = setTimeout(function () {
				if (done) return;
				done = true;
				state.idbBroken = true;
				gvLog("GV_SYNC_LOCAL_ONLY", "idb open timeout");
				reject(new Error("idb timeout"));
			}, 2000);
			var req;
			try { req = indexedDB.open(DB_NAME, DB_VERSION); }
			catch (e) {
				clearTimeout(timer);
				state.idbBroken = true;
				reject(e);
				return;
			}
			req.onupgradeneeded = function (ev) {
				var db = ev.target.result;
				var store = db.objectStoreNames.contains(STORE) ? ev.target.transaction.objectStore(STORE) : db.createObjectStore(STORE);
				if (store && !store.indexNames.contains("timestamp")) {
					try { store.createIndex("timestamp", "timestamp", { unique: false }); } catch (err) { /* ignore */ }
				}
			};
			req.onsuccess = function () {
				if (done) { try { req.result.close(); } catch (e2) { /* ignore */ } return; }
				done = true;
				clearTimeout(timer);
				resolve(req.result);
			};
			req.onerror = function () {
				if (done) return;
				done = true;
				clearTimeout(timer);
				state.idbBroken = true;
				reject(req.error || new Error("idb"));
			};
			req.onblocked = function () {
				if (done) return;
				done = true;
				clearTimeout(timer);
				state.idbBroken = true;
				reject(new Error("idb blocked"));
			};
		});
	}

	function withStore(mode, fn) {
		return idbOpen().then(function (db) {
			return new Promise(function (resolve, reject) {
				var settled = false;
				var timer = setTimeout(function () {
					if (settled) return;
					settled = true;
					try { db.close(); } catch (e) { /* ignore */ }
					state.idbBroken = true;
					reject(new Error("idb tx timeout"));
				}, 3000);
				var tx;
				try { tx = db.transaction(STORE, mode); }
				catch (e) {
					clearTimeout(timer);
					try { db.close(); } catch (e2) { /* ignore */ }
					reject(e);
					return;
				}
				var store = tx.objectStore(STORE);
				var result;
				try { result = fn(store); }
				catch (err) {
					clearTimeout(timer);
					try { db.close(); } catch (e3) { /* ignore */ }
					reject(err);
					return;
				}
				tx.oncomplete = function () {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					try { db.close(); } catch (e4) { /* ignore */ }
					resolve(result);
				};
				tx.onerror = function () {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					try { db.close(); } catch (e5) { /* ignore */ }
					reject(tx.error || new Error("tx"));
				};
				tx.onabort = tx.onerror;
			});
		});
	}

	function remapPath(p, oldPrefix) {
		if (!p) return p;
		if (oldPrefix && p.indexOf(oldPrefix) === 0) return state.gameDir + p.substring(oldPrefix.length);
		var m = String(p).match(/^\/idbfs\/[a-f0-9]{32}(?=\/|$)/i);
		if (m) return state.gameDir + String(p).substring(m[0].length);
		return p;
	}

	function readStamp() {
		return withStore("readonly", function (store) {
			var parts = [];
			var req = store.openCursor();
			req.onsuccess = function () {
				var c = req.result;
				if (!c) return;
				var key = String(c.key);
				if (inGameDir(key)) {
					var ts = c.value && c.value.timestamp ? new Date(c.value.timestamp).getTime() : 0;
					parts.push(key + "@" + ts);
				}
				c.continue();
			};
			return parts;
		}).then(function (parts) {
			parts.sort();
			return parts.join("|");
		});
	}

	function readFilesForUpload() {
		return withStore("readonly", function (store) {
			var pack = { files: [], prefsText: "" };
			var req = store.openCursor();
			req.onsuccess = function () {
				var c = req.result;
				if (!c) return;
				var key = String(c.key);
				if (inGameDir(key)) {
					var v = c.value || {};
					var contents = v.contents;
					var keep = false;
					if (contents && /\/PlayerPrefs$/.test(key)) keep = true;
					else if (contents && contents.length <= MAX_SMALL) keep = true;
					if (keep) {
						var u8 = contents instanceof Uint8Array ? contents : new Uint8Array(contents);
						if (/\/PlayerPrefs$/.test(key)) {
							pack.prefsText = bytesToLatin1(u8);
							if (debugSave) {
								var hex = "";
								var hexLen = Math.min(256, u8.length);
								for (var hi = 0; hi < hexLen; hi++) {
									var hexByte = u8[hi];
									hex += (hexByte < 16 ? "0" : "") + hexByte.toString(16);
								}
								gvLog("GV_PREFS_HEX", hex);
								debugSaveText("GV_PREFS_KEYS", pack.prefsText);
							}
						}
						pack.files.push({
							p: key,
							m: v.mode || 33206,
							t: 0,
							dir: false,
							d: bytesToBase64(u8)
						});
					}
				}
				c.continue();
			};
			return pack;
		});
	}

	function deleteGameDir() {
		return withStore("readwrite", function (store) {
			var keys = [];
			var req = store.openCursor();
			req.onsuccess = function () {
				var c = req.result;
				if (!c) {
					for (var i = 0; i < keys.length; i++) store.delete(keys[i]);
					return;
				}
				var key = String(c.key);
				if (inGameDir(key)) keys.push(c.key);
				c.continue();
			};
		});
	}

	function putRecordFiles(files, oldPrefix) {
		var now = new Date();
		var dirs = {};
		var mapped = [];
		for (var i = 0; i < files.length; i++) {
			var f = files[i];
			if (!f || f.dir) continue;
			var path = remapPath(f.p, oldPrefix);
			if (!inGameDir(path)) continue;
			mapped.push({ path: path, mode: f.m || 33206, bytes: base64ToBytes(f.d || "") });
			var slash = path.lastIndexOf("/");
			if (slash > 0) dirs[path.substring(0, slash)] = true;
			dirs[state.gameDir] = true;
		}
		return withStore("readwrite", function (store) {
			for (var d in dirs) {
				if (!Object.prototype.hasOwnProperty.call(dirs, d)) continue;
				store.put({ timestamp: now, mode: 16877 }, d);
			}
			for (var n = 0; n < mapped.length; n++) {
				store.put({ timestamp: now, mode: mapped[n].mode || 33206, contents: mapped[n].bytes }, mapped[n].path);
			}
		});
	}

	function applyLocalKeys(map) {
		state.seeding = true;
		try {
			state.localKeys = {};
			if (!map) return;
			for (var k in map) {
				if (!Object.prototype.hasOwnProperty.call(map, k) || skipStorageKey(k)) continue;
				var val = map[k] == null ? "" : String(map[k]);
				origSetItem(k, val);
				state.localKeys[k] = val;
			}
		} finally {
			state.seeding = false;
		}
	}

	function clearTrackedLocalKeys() {
		var keys = [];
		for (var k in state.localKeys) {
			if (Object.prototype.hasOwnProperty.call(state.localKeys, k)) keys.push(k);
		}
		state.seeding = true;
		try {
			for (var i = 0; i < keys.length; i++) origRemoveItem(keys[i]);
			state.localKeys = {};
			state.ygSave = "";
			state.money = 0;
		} finally {
			state.seeding = false;
		}
	}

	function ygTextFromRecord(record) {
		if (!record) return "";
		if (record.ygSaves) return String(record.ygSaves);
		if (record.ygSave) return String(record.ygSave);
		return "";
	}

	function parseJsonLoose(text, depth) {
		if (typeof text !== "string" || depth > 2) return null;
		try {
			var parsed = JSON.parse(text);
			if (typeof parsed === "string") return parseJsonLoose(parsed, depth + 1);
			return parsed && typeof parsed === "object" ? parsed : null;
		} catch (e) {
			return null;
		}
	}

	function digHistory(obj, depth) {
		if (depth == null) depth = 0;
		if (obj == null || depth > 6) return { meta: null, updatedAt: null };
		if (typeof obj === "string") {
			var parsed = parseJsonLoose(obj, 0);
			return parsed ? digHistory(parsed, depth + 1) : { meta: null, updatedAt: null };
		}
		if (typeof obj !== "object") return { meta: null, updatedAt: null };
		if (Object.prototype.toString.call(obj) === "[object Array]") {
			for (var i = 0; i < obj.length; i++) {
				var hit = digHistory(obj[i], depth + 1);
				if (hit.meta || hit.updatedAt) return hit;
			}
			return { meta: null, updatedAt: null };
		}
		var updatedAt = obj.NgaySua || obj.ngaySua || obj.updatedAt || obj.UpdatedAt || null;
		var meta = obj.MetaData != null ? obj.MetaData : (obj.metadata != null ? obj.metadata : (obj.metaData != null ? obj.metaData : null));
		if (typeof meta === "string") meta = parseJsonLoose(meta, 0);
		if (meta && typeof meta === "object") {
			var looksLikeSave = meta.Record != null || meta.CurrentLevel != null || meta.TotalScore != null;
			if (!looksLikeSave) {
				var deeper = digHistory(meta, depth + 1);
				if (deeper.meta) {
					return { meta: deeper.meta, updatedAt: updatedAt ? String(updatedAt) : deeper.updatedAt };
				}
			}
			return { meta: meta, updatedAt: updatedAt ? String(updatedAt) : null };
		}
		if (obj.Record != null || obj.CurrentLevel != null || obj.TotalScore != null) {
			return { meta: obj, updatedAt: updatedAt ? String(updatedAt) : null };
		}
		var wrapKeys = ["data", "Data", "result", "Result", "d"];
		for (var w = 0; w < wrapKeys.length; w++) {
			if (obj[wrapKeys[w]] == null) continue;
			var inner = digHistory(obj[wrapKeys[w]], depth + 1);
			if (inner.meta) {
				return { meta: inner.meta, updatedAt: updatedAt ? String(updatedAt) : inner.updatedAt };
			}
			if (!updatedAt && inner.updatedAt) updatedAt = inner.updatedAt;
		}
		return { meta: null, updatedAt: updatedAt ? String(updatedAt) : null };
	}

	function formBody(fields) {
		var p = new URLSearchParams();
		for (var k in fields) {
			if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
			if (fields[k] == null) continue;
			p.set(k, String(fields[k]));
		}
		return p.toString();
	}

	function apiPost(path, fields) {
		return fetch("https://gamevui.vn/account/" + path, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
			body: formBody(fields)
		}).then(function (res) {
			return res.text().then(function (text) {
				var data = null;
				try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
				return { status: res.status, ok: res.ok, data: data, text: text || "" };
			});
		});
	}

	function getHistory() {
		return apiPost("GetHistoryGame", { gameId: gid, token: token });
	}

	function saveHistory(payload, expectedUpdatedAt, keepalive) {
		var fields = {
			gameId: gid,
			token: token,
			metadata: JSON.stringify(payload),
			Diem: payload.TotalScore
		};
		if (expectedUpdatedAt) fields.expectedUpdatedAt = expectedUpdatedAt;
		var init = {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
			body: formBody(fields)
		};
		if (keepalive) init.keepalive = true;
		return fetch("https://gamevui.vn/account/SaveHistoryGame", init).then(function (res) {
			return res.text().then(function (text) {
				var data = null;
				try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
				return { status: res.status, ok: res.ok, data: data, text: text || "" };
			});
		});
	}

	function isConflict(res) {
		if (!res) return false;
		if (res.status === 409) return true;
		var d = res.data;
		if (d && (d.conflict === true || d.status === 409 || d.Status === 409)) return true;
		return false;
	}

	function recordHasData(meta) {
		if (!meta || !meta.Record || typeof meta.Record !== "object") return false;
		var record = meta.Record;
		if (ygTextFromRecord(record)) return true;
		if (record.files && record.files.length) return true;
		if (record.localKeys && Object.keys(record.localKeys).length) return true;
		return false;
	}

	function historyUnreadable(res) {
		if (!res || !res.ok) return true;
		if (res.data && res.data.raw && Object.keys(res.data).length === 1) return true;
		var text = String(res.text || "").trim();
		if (!text || text === "null") return false;
		var dug = digHistory(res.data);
		if (dug.meta) return false;
		return /Record|files|ygSave|ygSaves|MetaData|metadata/.test(text);
	}

	function buildPayload(files, extraText) {
		refreshMoney(extraText);
		var prog = progressFromSave();
		var money = scoreNumber(state.money);
		var kept = files || [];
		var record = {
			__version__: 1,
			prefix: state.gameDir,
			files: kept,
			ygSave: state.ygSave || "",
			ygSaves: state.ygSave || "",
			localKeys: state.localKeys || {}
		};
		var payload = {
			CurrentLevel: prog.level,
			TotalScore: money,
			CurrentStage: prog.stage,
			SavedAt: new Date().toISOString(),
			Record: record
		};
		var json = JSON.stringify(payload);
		if (json.length > MAX_RECORD_CHARS) {
			payload.Record.files = kept.filter(function (f) { return f && /\/PlayerPrefs$/.test(f.p || ""); });
			json = JSON.stringify(payload);
		}
		if (json.length > MAX_RECORD_CHARS) {
			payload.Record.localKeys = {};
		}
		var prefs = false;
		var outFiles = payload.Record.files || [];
		for (var i = 0; i < outFiles.length; i++) {
			if (outFiles[i] && /\/PlayerPrefs$/.test(outFiles[i].p || "")) prefs = true;
		}
		gvLog("GV_SAVE_SHAPE", "files=" + outFiles.length, "prefs=" + (prefs ? "yes" : "no"), "yg=" + String(state.ygSave || "").length);
		gvLog("GV_SAVE_MAP", "yg=" + String(state.ygSave || "").length, "ls=" + Object.keys(state.localKeys).length, "score=" + money);
		logScore();
		return payload;
	}

	function emptyPayload() {
		return {
			CurrentLevel: 0,
			TotalScore: 0,
			CurrentStage: 0,
			SavedAt: new Date().toISOString(),
			Record: { __version__: 1, prefix: state.gameDir, files: [], ygSave: "", ygSaves: "", localKeys: {} }
		};
	}

	function adoptRemote(meta, updatedAt) {
		if (updatedAt) {
			state.expectedUpdatedAt = updatedAt;
			saveMeta();
		}
		if (!meta) return Promise.resolve();
		state.ygSave = ygTextFromRecord(meta.Record);
		if (meta.Record && meta.Record.localKeys) applyLocalKeys(meta.Record.localKeys);
		refreshMoney();
		state.dirty = false;
		return Promise.resolve();
	}

	function pushSave(keepalive) {
		if (!state.cloudActive || !state.seedApplied || state.resetting || saveOff) return Promise.resolve(false);
		var read = state.idbBroken ? Promise.resolve({ files: [], prefsText: "" }) : readFilesForUpload().catch(function () {
			state.idbBroken = true;
			return { files: [], prefsText: "" };
		});
		return read.then(function (pack) {
			if (pack.prefsText) refreshMoney(pack.prefsText);
			var payload = buildPayload(pack.files, pack.prefsText);
			return saveHistory(payload, state.expectedUpdatedAt, keepalive).then(function (res) {
				if (isConflict(res)) {
					gvLog("GV_SAVE_CONFLICT");
					state.conflictRetries += 1;
					gvLog("GV_SAVE_CONFLICT_RETRY_COUNT", state.conflictRetries);
					if (state.conflictRetries > 5) return false;
					return getHistory().then(function (latest) {
						var dug = digHistory(latest.data);
						var remoteAt = dug.meta && dug.meta.SavedAt ? Date.parse(dug.meta.SavedAt) : 0;
						var localAt = Date.parse(payload.SavedAt);
						if (dug.updatedAt) {
							state.expectedUpdatedAt = dug.updatedAt;
							saveMeta();
						}
						if (dug.meta && remoteAt && localAt && remoteAt > localAt) {
							return adoptRemote(dug.meta, dug.updatedAt).then(function () { return true; });
						}
						return pushSave(keepalive);
					});
				}
				if (!res.ok) {
					gvLog("GV_SAVE_FAIL", res.status);
					return false;
				}
				var dugOk = digHistory(res.data);
				if (dugOk.updatedAt) {
					state.expectedUpdatedAt = dugOk.updatedAt;
					saveMeta();
				}
				state.dirty = false;
				state.conflictRetries = 0;
				gvLog("GV_SAVE_OK");
				return true;
			});
		}).catch(function (err) {
			gvLog("GV_SAVE_FAIL", err && err.message);
			return false;
		});
	}

	function queueRetry() {
		if (state.retryTimer || state.resetting) return;
		state.retryTimer = setTimeout(function () {
			state.retryTimer = null;
			if (state.dirty && state.cloudActive && !state.resetting) flushSave(false);
		}, 1000);
	}

	function flushSave(keepalive) {
		if (!state.cloudActive || !state.seedApplied || state.resetting || state.seeding || saveOff) return Promise.resolve(false);
		if (state.idbBroken && !state.ygSave && !Object.keys(state.localKeys).length) return Promise.resolve(false);
		if (state.flushing) return Promise.resolve(false);
		state.flushing = true;
		return pushSave(!!keepalive).then(function (ok) {
			state.flushing = false;
			if (!ok && state.dirty) queueRetry();
			return ok;
		}).catch(function () {
			state.flushing = false;
			if (state.dirty) queueRetry();
			return false;
		});
	}

	function pollAndMaybeSave() {
		if (!state.cloudActive || !state.seedApplied || state.resetting || state.seeding || state.pollBusy || saveOff) return;
		if (document.hidden) return;
		if (state.idbBroken) { if (state.dirty) flushSave(false); return; }
		state.pollBusy = true;
		readStamp().then(function (sig) {
			if (state.lastStamp == null) {
				state.lastStamp = sig;
				if (state.needInitialPush && sig) state.dirty = true;
			} else if (sig !== state.lastStamp) {
				state.lastStamp = sig;
				state.dirty = true;
			}
			state.pollBusy = false;
			if (state.dirty) return flushSave(false);
		}).catch(function () {
			state.pollBusy = false;
		});
	}

	function startLoop() {
		if (state.loopStarted || !state.cloudActive) return;
		state.loopStarted = true;
		setInterval(pollAndMaybeSave, 10000);
		document.addEventListener("visibilitychange", function () {
			if (document.hidden) flushSave(true);
		});
		window.addEventListener("pagehide", function () { flushSave(true); });
	}

	function withTimeout(promise, ms) {
		return new Promise(function (resolve, reject) {
			var timer = setTimeout(function () { reject(new Error("timeout")); }, ms);
			promise.then(function (v) {
				clearTimeout(timer);
				resolve(v);
			}, function (e) {
				clearTimeout(timer);
				reject(e);
			});
		});
	}

	function loadHistorySafe(attempt) {
		return withTimeout(getHistory(), 5000).then(function (res) {
			gvLog("GV_LOAD_RAW", res.status, String(res.text || "").slice(0, 300));
			if (historyUnreadable(res)) throw new Error("history unreadable");
			return res;
		}).catch(function (err) {
			if (attempt >= 1) throw err;
			gvLog("GV_LOAD_RETRY", err && err.message ? err.message : err);
			return loadHistorySafe(attempt + 1);
		});
	}

	function debugSaveText(label, text) {
		if (!debugSave || !text) return;
		var keys = [];
		var seen = {};
		var re = /[A-Za-z][A-Za-z0-9_]{2,40}/g;
		var m;
		while ((m = re.exec(text)) && keys.length < 40) {
			if (!seen[m[0]]) {
				seen[m[0]] = 1;
				keys.push(m[0]);
			}
		}
		gvLog(label, keys.join(","));
	}

	function seedFromMeta(meta) {
		var late = !!window.__gvUnityStarted;
		var record = meta.Record || {};
		state.seeding = true;
		state.ygSave = ygTextFromRecord(record);
		applyLocalKeys(record.localKeys || {});
		refreshMoney();
		var files = record.files || [];
		var hasPrefs = false;
		for (var i = 0; i < files.length; i++) {
			if (files[i] && /\/PlayerPrefs$/.test(files[i].p || "")) hasPrefs = true;
		}
		return deleteGameDir().then(function () {
			if (!files.length) return;
			return putRecordFiles(files, record.prefix || "");
		}).then(function () {
			return readStamp();
		}).then(function (sig) {
			state.lastStamp = sig;
			state.seeding = false;
			state.seedApplied = true;
			gvLog("GV_SYNC_SEEDED", "files=" + files.length, "prefs=" + (hasPrefs ? "yes" : "no"));
			gvLog("GV_CLOUD_APPLIED");
			if (late) gvLog("GV_SYNC_LATE_SEED");
			debugSaveText("GV_YG_KEYS", state.ygSave);
			return { seeded: true, lateSeed: late };
		}).catch(function (e) {
			state.seeding = false;
			throw e;
		});
	}

	function init() {
		gvLog("GV_BUILD", 3);
		state.gameDir = "/idbfs/" + md5Hex(documentDirUrl());
		gvLog("GV_GAMEDIR", state.gameDir);
		if (saveOff) {
			gvLog("GV_SYNC_LOCAL_ONLY", "gvsave=0");
			return Promise.resolve({ seeded: false, lateSeed: false });
		}
		patchLocalStorage();
		loadMeta();
		if (!gid || !token) {
			state.cloudActive = false;
			state.seedApplied = true;
			gvLog("GV_SYNC_LOCAL_ONLY", "No gid/token -> local fallback (dev only)");
			return Promise.resolve({ seeded: false, lateSeed: false });
		}
		state.cloudActive = true;
		gvLog("Cloud sync active (production)");
		return loadHistorySafe(0).then(function (res) {
			var dug = digHistory(res.data);
			if (dug.updatedAt) {
				state.expectedUpdatedAt = dug.updatedAt;
				saveMeta();
			}
			if (recordHasData(dug.meta)) {
				return seedFromMeta(dug.meta).then(function (info) {
					if (!info.lateSeed) startLoop();
					return info;
				});
			}
			state.seedApplied = true;
			state.needInitialPush = true;
			gvLog("GV_SYNC_SEEDED", "empty");
			startLoop();
			return { seeded: false, lateSeed: false };
		}).catch(function (err) {
			state.cloudActive = false;
			state.seedApplied = false;
			gvLog("GV_SYNC_LOAD_FAIL");
			gvLog("GV_SYNC_LOCAL_ONLY", err && err.message ? err.message : err);
			return { seeded: false, lateSeed: false };
		});
	}

	function isWiped(meta) {
		if (!meta) return false;
		if (Number(meta.TotalScore) !== 0 || Number(meta.CurrentLevel) !== 0) return false;
		var rec = meta.Record || {};
		if (rec.ygSave || rec.ygSaves) return false;
		if (rec.files && rec.files.length) return false;
		if (rec.localKeys && Object.keys(rec.localKeys).length) return false;
		return true;
	}

	function wipeCloudOnce(payload) {
		return saveHistory(payload, state.expectedUpdatedAt, false).then(function (res) {
			if (isConflict(res)) {
				return getHistory().then(function (latest) {
					var dug = digHistory(latest.data);
					if (dug.updatedAt) state.expectedUpdatedAt = dug.updatedAt;
					return saveHistory(payload, state.expectedUpdatedAt, false);
				});
			}
			return res;
		}).then(function (res) {
			if (!res || !res.ok) throw new Error("save");
			var dug = digHistory(res.data);
			if (dug.updatedAt) {
				state.expectedUpdatedAt = dug.updatedAt;
				saveMeta();
			}
			return getHistory();
		}).then(function (res) {
			if (!res.ok) throw new Error("verify");
			var dug = digHistory(res.data);
			if (dug.updatedAt) state.expectedUpdatedAt = dug.updatedAt;
			if (!isWiped(dug.meta)) throw new Error("not wiped");
			return true;
		});
	}

	function tryWipe(attempt, useFallback) {
		var payload = emptyPayload();
		return wipeCloudOnce(payload).catch(function () {
			if (attempt >= 3) {
				if (!useFallback) {
					gvLog("GV_RESET_FALLBACK_DEFAULT");
					return tryWipe(1, true);
				}
				throw new Error("wipe failed");
			}
			return tryWipe(attempt + 1, useFallback);
		});
	}

	function finishLocalWipe() {
		var chain = state.idbBroken ? Promise.resolve() : deleteGameDir().catch(function () { /* ignore */ });
		return chain.then(function () {
			clearTrackedLocalKeys();
			state.dirty = false;
			state.expectedUpdatedAt = null;
			saveMeta();
		});
	}

	function reloadBust() {
		var url = new URL(location.href);
		url.searchParams.set("_gv", String(Date.now()));
		location.replace(url.toString());
	}

	function resetData() {
		if (state.resetting) return Promise.resolve();
		state.resetting = true;
		if (!gid || !token || saveOff) {
			gvLog("GV_RESET_LOCAL_ONLY");
			return finishLocalWipe().then(function () {
				window.alert("Đã xóa dữ liệu trên máy này. Chưa đồng bộ cloud (thiếu gid/token).");
				reloadBust();
			}).catch(function () {
				state.resetting = false;
				window.alert("Không xóa được dữ liệu trên máy.");
			});
		}
		return tryWipe(1, false).then(function () {
			gvLog("GV_RESET_CLOUD_VERIFIED");
			return finishLocalWipe();
		}).then(function () {
			reloadBust();
		}).catch(function () {
			state.resetting = false;
			gvLog("GV_RESET_FAIL");
			window.alert("Không xóa được dữ liệu cloud. Dữ liệu trên máy được giữ nguyên.");
		});
	}

	function readMoney() {
		refreshMoney();
		if (state.money) {
			logScore();
			return Promise.resolve(scoreNumber(state.money));
		}
		if (state.idbBroken || saveOff || !state.gameDir) {
			logScore();
			return Promise.resolve(0);
		}
		return readFilesForUpload().then(function (pack) {
			if (pack.prefsText) {
				refreshMoney(pack.prefsText);
				debugSaveText("GV_PREFS_KEYS", pack.prefsText);
			}
			logScore();
			return scoreNumber(state.money);
		}).catch(function () {
			logScore();
			return scoreNumber(state.money);
		});
	}

	var burstUntil = 0;
	var burstOn = false;

	function syncHud() {
		var wrap = document.getElementById("gv-hud-actions");
		var canvas = document.getElementById("unity-canvas");
		var cover = document.getElementById("loading-cover");
		if (!wrap || !canvas) return;
		var coverOn = cover && cover.style.display !== "none" && cover.offsetParent !== null;
		if (cover && cover.style.display === "none") coverOn = false;
		if (coverOn) {
			wrap.style.display = "none";
			return;
		}
		var rect = canvas.getBoundingClientRect();
		if (!rect.width || !rect.height) {
			wrap.style.display = "none";
			return;
		}
		var shortSide = Math.min(rect.width, rect.height);
		var s = shortSide / 720;
		var icon = Math.max(64, Math.round(70 * s));
		var imgs = wrap.querySelectorAll("img");
		for (var i = 0; i < imgs.length; i++) {
			imgs[i].style.width = icon + "px";
			imgs[i].style.height = icon + "px";
		}
		wrap.style.display = "flex";
		var pad = Math.max(8, Math.round(12 * Math.min(s, 1.5)));
		var w = wrap.offsetWidth || (icon * 2 + 8);
		var h = wrap.offsetHeight || icon;
		wrap.style.top = Math.round(rect.bottom - pad - h) + "px";
		wrap.style.left = Math.round(rect.right - pad - w) + "px";
	}

	function burstSync() {
		burstUntil = Date.now() + 400;
		if (burstOn) return;
		burstOn = true;
		function tick() {
			syncHud();
			if (Date.now() < burstUntil) requestAnimationFrame(tick);
			else burstOn = false;
		}
		requestAnimationFrame(tick);
	}

	function bindActionUi() {
		if (document.getElementById("gv-hud-actions")) {
			burstSync();
			return;
		}
		var wrap = document.createElement("div");
		wrap.id = "gv-hud-actions";
		wrap.innerHTML =
			'<button type="button" id="gv-reset-btn" title="Xóa dữ liệu" aria-label="Xóa dữ liệu">' +
			'<img src="reset-data.png" alt="" draggable="false">' +
			"</button>" +
			'<button type="button" id="gv-send-score-btn" title="Gửi điểm" aria-label="Gửi điểm">' +
			'<img src="save-score.png" alt="" draggable="false">' +
			"</button>";
		var modal = document.createElement("div");
		modal.id = "gv-reset-modal";
		modal.innerHTML =
			'<div class="gv-box" role="dialog" aria-modal="true">' +
			"<p>Bạn có chắc chắn xóa không?</p>" +
			"<p>Mọi dữ liệu sẽ bị xóa vĩnh viễn và không thể khôi phục.</p>" +
			'<div class="gv-actions">' +
			'<button type="button" class="gv-cancel" id="gv-reset-cancel">Hủy</button>' +
			'<button type="button" class="gv-ok" id="gv-reset-confirm">Xác nhận</button>' +
			"</div></div>";
		document.body.appendChild(wrap);
		document.body.appendChild(modal);

		function stop(e) {
			if (e) { e.preventDefault(); e.stopPropagation(); }
		}
		wrap.addEventListener("selectstart", stop);
		wrap.addEventListener("dragstart", stop);

		document.getElementById("gv-send-score-btn").addEventListener("click", function (e) {
			stop(e);
			readMoney().then(function (n) {
				try {
					if (typeof GV !== "undefined" && GV) new GV().saveScore(n);
				} catch (err) { /* ignore */ }
			});
		});
		document.getElementById("gv-reset-btn").addEventListener("click", function (e) {
			stop(e);
			modal.style.display = "flex";
		});
		document.getElementById("gv-reset-cancel").addEventListener("click", function (e) {
			stop(e);
			modal.style.display = "none";
		});
		document.getElementById("gv-reset-confirm").addEventListener("click", function (e) {
			stop(e);
			modal.style.display = "none";
			resetData();
		});

		window.addEventListener("resize", burstSync);
		window.addEventListener("orientationchange", burstSync);
		document.addEventListener("fullscreenchange", burstSync);
		document.addEventListener("webkitfullscreenchange", burstSync);
		if (window.visualViewport) {
			window.visualViewport.addEventListener("resize", burstSync);
			window.visualViewport.addEventListener("scroll", burstSync);
		}
		var canvas = document.getElementById("unity-canvas");
		if (canvas && typeof ResizeObserver !== "undefined") {
			new ResizeObserver(burstSync).observe(canvas);
		}
		burstSync();
	}

	window.GamevuiSave = {
		init: init,
		noteYgSave: noteYgSave,
		hasYgSave: hasYgSave,
		applyYgLoad: applyYgLoad,
		getScoreToSend: function () {
			refreshMoney();
			logScore();
			return scoreNumber(state.money);
		},
		readMoney: readMoney,
		resetData: resetData,
		bindActionUi: bindActionUi,
		burstSync: burstSync,
		getSyncState: function () {
			return {
				expectedUpdatedAt: state.expectedUpdatedAt,
				dirty: state.dirty,
				gameDir: state.gameDir,
				cloudActive: state.cloudActive
			};
		}
	};

	function whenBody(fn) {
		if (document.body) fn();
		else document.addEventListener("DOMContentLoaded", fn);
	}
	whenBody(bindActionUi);
})();
