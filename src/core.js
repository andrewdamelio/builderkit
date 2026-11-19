// BuilderKit core — pure functions. Needs globals: ethers (v6), MessagePack (@msgpack/msgpack).
const HL = (() => {
  const ZERO = "0x0000000000000000000000000000000000000000";
  const LIMITS = { perp: 100, spot: 1000 }; // max f (tenths of a bp): 0.1% perps, 1% spot

  // ---------- fee units ----------
  // f is in tenths of a basis point. 1 bp = 0.01%, so f=10 -> 0.01%, f=1 -> 0.001%
  const fToPct = (f) => Number(f) / 1000;               // percent number
  const fToBps = (f) => Number(f) / 10;
  const pctToF = (pct) => Math.round(Number(pct) * 1000);
  const fToRateString = (f) => {                        // "0.05%" style string for maxFeeRate
    let s = (Number(f) / 1000).toFixed(3).replace(/\.?0+$/, "");
    return s + "%";
  };
  const parseRateString = (s) => {
    const m = String(s).trim().match(/^(\d+(?:\.\d+)?)%$/);
    if (!m) throw new Error('maxFeeRate must look like "0.1%"');
    const f = Number(m[1]) * 1000;
    if (Math.abs(f - Math.round(f)) > 1e-9) throw new Error("maxFeeRate finer than 0.001% (f must be an integer)");
    return Math.round(f);
  };

  // ---------- wire formatting (matches hyperliquid-python-sdk float_to_wire) ----------
  function floatToWire(x) {
    const n = Number(x);
    if (!isFinite(n)) throw new Error("not a number: " + x);
    let s = n.toFixed(8);
    if (Math.abs(Number(s) - n) >= 1e-12) throw new Error("float_to_wire causes rounding: " + x);
    s = s.replace(/\.?0+$/, "");
    if (s === "-0" || s === "") s = "0";
    return s;
  }

  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());

  // ---------- user-signed action: ApproveBuilderFee ----------
  const APPROVE_TYPES = {
    "HyperliquidTransaction:ApproveBuilderFee": [
      { name: "hyperliquidChain", type: "string" },
      { name: "maxFeeRate", type: "string" },
      { name: "builder", type: "address" },
      { name: "nonce", type: "uint64" },
    ],
  };
  const APPROVE_PRIMARY = "HyperliquidTransaction:ApproveBuilderFee";

  function buildApproveAction({ builder, maxFeeRate, nonce, mainnet = true, signatureChainId = "0x66eee" }) {
    if (!isAddr(builder)) throw new Error("builder must be a 0x address");
    parseRateString(maxFeeRate);
    return {
      type: "approveBuilderFee",
      signatureChainId,
      hyperliquidChain: mainnet ? "Mainnet" : "Testnet",
      maxFeeRate,
      builder: builder.trim().toLowerCase(),
      nonce: Number(nonce),
    };
  }
  function approveTypedData(action) {
    const domain = {
      name: "HyperliquidSignTransaction",
      version: "1",
      chainId: parseInt(action.signatureChainId, 16),
      verifyingContract: ZERO,
    };
    const message = {
      hyperliquidChain: action.hyperliquidChain,
      maxFeeRate: action.maxFeeRate,
      builder: action.builder,
      nonce: action.nonce,
    };
    return { domain, types: APPROVE_TYPES, primaryType: APPROVE_PRIMARY, message };
  }
  // Full JSON for eth_signTypedData_v4
  function toV4(td) {
    return {
      domain: td.domain,
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        ...td.types,
      },
      primaryType: td.primaryType,
      message: td.message,
    };
  }
  const typedHash = (td) => ethers.TypedDataEncoder.hash(td.domain, td.types, td.message);

  // ---------- L1 action: order with builder ----------
  function orderWire({ asset, isBuy, px, sz, reduceOnly = false, tif = "Gtc", cloid }) {
    const w = {
      a: Number(asset),
      b: !!isBuy,
      p: floatToWire(px),
      s: floatToWire(sz),
      r: !!reduceOnly,
      t: { limit: { tif } },
    };
    if (cloid) w.c = cloid;
    return w;
  }
  function buildOrderAction(orders, builder) {
    const action = { type: "order", orders, grouping: "na" };
    if (builder) action.builder = { b: builder.b.trim().toLowerCase(), f: Number(builder.f) };
    return action;
  }
  function u64be(n) {
    const out = new Uint8Array(8);
    let v = BigInt(n);
    for (let i = 7; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
    return out;
  }
  function actionHash(action, nonce, vaultAddress = null, expiresAfter = null) {
    const packed = MessagePack.encode(action);
    const parts = [packed, u64be(nonce)];
    if (!vaultAddress) parts.push(new Uint8Array([0]));
    else parts.push(new Uint8Array([1]), ethers.getBytes(vaultAddress));
    if (expiresAfter != null) parts.push(new Uint8Array([0]), u64be(expiresAfter));
    return ethers.keccak256(ethers.concat(parts));
  }
  function l1TypedData(hash, mainnet = true) {
    return {
      domain: { name: "Exchange", version: "1", chainId: 1337, verifyingContract: ZERO },
      types: { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] },
      primaryType: "Agent",
      message: { source: mainnet ? "a" : "b", connectionId: hash },
    };
  }

  // ---------- signatures ----------
  function splitSig(sig) {
    const s = ethers.Signature.from(sig);
    return { r: s.r, s: s.s, v: s.v };
  }
  async function signTyped(wallet, td) {
    return splitSig(await wallet.signTypedData(td.domain, td.types, td.message));
  }
  function recover(td, sig) {
    const joined = ethers.Signature.from({ r: sig.r, s: sig.s, v: Number(sig.v) }).serialized;
    return ethers.verifyTypedData(td.domain, td.types, td.message, joined);
  }

  // Given a full /exchange body, rebuild what was signed and recover the signer.
  function inspectExchangeBody(body, mainnetHint = true) {
    const { action, nonce, signature } = body;
    if (!action || !signature) throw new Error("Body needs action, nonce and signature");
    const notes = [];
    let td, kind;
    if (action.type === "approveBuilderFee") {
      kind = "User-signed · ApproveBuilderFee";
      if (!action.signatureChainId) throw new Error("approveBuilderFee action is missing signatureChainId");
      td = approveTypedData(action);
      if (Number(action.nonce) !== Number(nonce)) notes.push({ lvl: "err", msg: "action.nonce ≠ body nonce — the exchange will reject this." });
      try {
        const f = parseRateString(action.maxFeeRate);
        if (f > LIMITS.spot) notes.push({ lvl: "err", msg: `maxFeeRate ${action.maxFeeRate} exceeds the 1% ceiling.` });
        else if (f > LIMITS.perp) notes.push({ lvl: "warn", msg: `maxFeeRate ${action.maxFeeRate} is above the 0.1% perps cap — only spot orders can use the full amount.` });
      } catch (e) { notes.push({ lvl: "err", msg: e.message }); }
    } else {
      kind = "L1 action · " + action.type;
      const mainnet = body.isMainnet ?? mainnetHint;
      const h = actionHash(action, nonce, body.vaultAddress || null, body.expiresAfter ?? null);
      td = l1TypedData(h, mainnet);
      notes.push({ lvl: "info", msg: `Action hash ${h.slice(0, 10)}… on ${mainnet ? "mainnet (source a)" : "testnet (source b)"}. Key order in action matters — it is msgpack-hashed as-is.` });
      if (action.builder) {
        const f = Number(action.builder.f);
        if (!Number.isInteger(f)) notes.push({ lvl: "err", msg: "builder.f must be an integer (tenths of a bp)." });
        if (f > LIMITS.spot) notes.push({ lvl: "err", msg: `builder.f=${f} exceeds the 1% hard cap.` });
        else if (f > LIMITS.perp) notes.push({ lvl: "warn", msg: `builder.f=${f} (${fToPct(f)}%) is over the perps cap of 0.1% — perp orders will be rejected.` });
        if (action.builder.b !== String(action.builder.b).toLowerCase()) notes.push({ lvl: "warn", msg: "builder.b is not lowercase; the SDKs lowercase it before hashing." });
      }
    }
    const signer = recover(td, signature);
    return { kind, signer, typedHash: typedHash(td), notes, td };
  }

  // ---------- LZ4 frame decoder (for builder_fills .csv.lz4) ----------
  function lz4Decode(input) {
    const src = input instanceof Uint8Array ? input : new Uint8Array(input);
    let out = new Uint8Array(Math.max(1024, src.length * 4));
    let op = 0;
    const ensure = (n) => {
      if (op + n <= out.length) return;
      let len = out.length * 2;
      while (len < op + n) len *= 2;
      const nb = new Uint8Array(len); nb.set(out.subarray(0, op)); out = nb;
    };
    const u32 = (i) => (src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24)) >>> 0;
    let ip = 0;
    while (ip < src.length) {
      const magic = u32(ip);
      if ((magic & 0xfffffff0) === 0x184d2a50) { ip += 8 + u32(ip + 4); continue; } // skippable frame
      if (magic !== 0x184d2204) throw new Error("Not an LZ4 frame (bad magic)");
      ip += 4;
      const flg = src[ip++]; ip++; // BD
      const blockChecksum = flg & 0x10, contentSize = flg & 0x08, contentChecksum = flg & 0x04, dictId = flg & 0x01;
      if (contentSize) ip += 8;
      if (dictId) ip += 4;
      ip++; // header checksum
      for (;;) {
        const bsz = u32(ip); ip += 4;
        if (bsz === 0) break;
        const size = bsz & 0x7fffffff;
        if (bsz & 0x80000000) { ensure(size); out.set(src.subarray(ip, ip + size), op); op += size; ip += size; }
        else {
          const end = ip + size;
          while (ip < end) {
            const token = src[ip++];
            let lit = token >> 4;
            if (lit === 15) { let b; do { b = src[ip++]; lit += b; } while (b === 255); }
            ensure(lit); out.set(src.subarray(ip, ip + lit), op); op += lit; ip += lit;
            if (ip >= end) break;
            const off = src[ip] | (src[ip + 1] << 8); ip += 2;
            let ml = token & 15;
            if (ml === 15) { let b; do { b = src[ip++]; ml += b; } while (b === 255); }
            ml += 4;
            if (off === 0 || off > op) throw new Error("Corrupt LZ4 block");
            ensure(ml);
            let m = op - off;
            for (let k = 0; k < ml; k++) out[op++] = out[m++];
          }
          ip = end;
        }
        if (blockChecksum) ip += 4;
      }
      if (contentChecksum) ip += 4;
    }
    return out.subarray(0, op);
  }

  const fillsUrl = (builder, yyyymmdd, mainnet = true) =>
    `https://stats-data.hyperliquid.xyz/${mainnet ? "Mainnet" : "Testnet"}/builder_fills/${builder.trim().toLowerCase()}/${yyyymmdd}.csv.lz4`;

  return {
    ZERO, LIMITS, fToPct, fToBps, pctToF, fToRateString, parseRateString, floatToWire, isAddr,
    buildApproveAction, approveTypedData, toV4, typedHash, orderWire, buildOrderAction, actionHash,
    l1TypedData, splitSig, signTyped, recover, inspectExchangeBody, lz4Decode, fillsUrl,
  };
})();
if (typeof module !== "undefined") module.exports = HL;
