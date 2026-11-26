/**
 * Strict canonical JSON and synchronous SHA-256 for JSON-safe engineering data.
 * Browser/Node compatible; contains no product, workflow, or release authority.
 */

export const CANONICAL_JSON_SHA256_PROFILE = 'CANONICAL_JSON_SHA256_V1';

export function canonicalJson(value) {
  return stringifyValue(value, new WeakSet(), []);
}

/**
 * The JSON path of the value being serialised, for error messages only. `trail` holds the keys
 * (strings) and array indices (numbers) from the root; the path string is built only when an error
 * is thrown, so the common case does not pay for it.
 */
function pathOf(trail) {
  let path = '$';
  for (const step of trail) path += typeof step === 'number' ? `[${step}]` : `.${step}`;
  return path;
}

export function canonicalSha256(value) {
  return `sha256:${sha256Hex(utf8Bytes(canonicalJson(value)))}`;
}

function stringifyValue(value, seen, trail) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${pathOf(trail)} contains a non-finite number.`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== 'object') throw new TypeError(`${pathOf(trail)} contains non-JSON data.`);
  if (seen.has(value)) throw new TypeError(`${pathOf(trail)} contains a cycle.`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError(`${pathOf(trail)} uses a custom array prototype.`);
      }
      const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
      if (keys.some((key) => typeof key === 'symbol') || keys.length !== value.length) {
        throw new TypeError(`${pathOf(trail)} contains array holes or extra properties.`);
      }
      const rows = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        trail.push(index);
        validateDescriptor(descriptor, trail);
        rows.push(stringifyValue(descriptor.value, seen, trail));
        trail.pop();
      }
      return `[${rows.join(',')}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError(`${pathOf(trail)} must contain plain JSON objects.`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) throw new TypeError(`${pathOf(trail)} contains symbol keys.`);
    const ordered = [...keys].sort(codeUnitCompare);
    const parts = [];
    for (const key of ordered) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      trail.push(key);
      validateDescriptor(descriptor, trail);
      parts.push(`${JSON.stringify(key)}:${stringifyValue(descriptor.value, seen, trail)}`);
      trail.pop();
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function validateDescriptor(descriptor, trail) {
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)
    || 'get' in descriptor || 'set' in descriptor) {
    throw new TypeError(`${pathOf(trail)} contains a non-JSON property.`);
  }
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utf8Bytes(text) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
  const encoded = unescape(encodeURIComponent(text));
  return Uint8Array.from(encoded, (character) => character.charCodeAt(0));
}

const SHA256_K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Standard SHA-256 (FIPS 180-4) of a byte array, as lowercase hex. Arithmetic is done on signed
 * 32-bit integers (`| 0`), which wraps exactly like unsigned 32-bit addition; the state is only
 * read as unsigned (`>>> 0`) for the final hex output.
 */
function sha256Hex(bytes) {
  const bitLength = bytes.length * 8;
  const totalLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);
  let h0 = 0x6a09e667 | 0; let h1 = 0xbb67ae85 | 0; let h2 = 0x3c6ef372 | 0; let h3 = 0xa54ff53a | 0;
  let h4 = 0x510e527f | 0; let h5 = 0x9b05688c | 0; let h6 = 0x1f83d9ab | 0; let h7 = 0x5be0cd19 | 0;
  const w = new Int32Array(64);
  const k = SHA256_K;
  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getInt32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const sigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choose + k[i] + w[i]) | 0;
      const sigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
}
