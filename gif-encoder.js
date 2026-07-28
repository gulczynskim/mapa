// Minimal, dependency-free GIF89a encoder -- written from scratch for the
// "Pobierz dynamiczną mapę zmian" export (see exportChangeGif in app.js).
// Not a general-purpose library; deliberately simple: a fixed 256-color
// GLOBAL palette shared across every frame (built once via median-cut over
// all frames combined, so colors don't flicker between frames and the file
// only stores one color table), standard GIF LZW compression, an infinite-
// loop NETSCAPE2.0 application extension. No transparency, no per-frame
// local color tables, no interlacing -- none of this map export needs them.
//
// Public API: encodeGif({ width, height, frames, delayCentiseconds, loop })
// -- frames is an array of Uint8ClampedArray/Uint8Array RGBA pixel buffers
// (e.g. straight from canvas ctx.getImageData(...).data), all the same
// width*height*4 length. Returns a Uint8Array of the complete GIF file.

// Median-cut color quantization: recursively splits the bucket with the
// largest single-channel range at its median along that axis, until there
// are `maxColors` buckets, then averages each bucket to one palette entry.
// Standard algorithm (Heckbert 1982) -- not exact-optimal like k-means but
// fast and more than good enough for a choropleth map (a handful of large
// solid-fill regions plus modest anti-aliasing at borders/text, not
// photographic detail).
function quantizeMedianCut(samples, maxColors) {
  if (samples.length === 0) return [[255, 255, 255]];

  function channelRanges(bucket) {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const [r, g, b] of bucket) {
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      if (g < gMin) gMin = g;
      if (g > gMax) gMax = g;
      if (b < bMin) bMin = b;
      if (b > bMax) bMax = b;
    }
    return { r: rMax - rMin, g: gMax - gMin, b: bMax - bMin };
  }

  let buckets = [samples];
  while (buckets.length < maxColors) {
    let splitIdx = -1;
    let splitAxisIdx = 0;
    let maxRange = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      const ranges = channelRanges(buckets[i]);
      const localMax = Math.max(ranges.r, ranges.g, ranges.b);
      if (localMax > maxRange) {
        maxRange = localMax;
        splitIdx = i;
        splitAxisIdx = ranges.r === localMax ? 0 : ranges.g === localMax ? 1 : 2;
      }
    }
    if (splitIdx === -1) break; // every remaining bucket is a single color -- nothing left to split
    const bucket = buckets[splitIdx];
    bucket.sort((a, b) => a[splitAxisIdx] - b[splitAxisIdx]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(splitIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  return buckets.map((bucket) => {
    let rSum = 0, gSum = 0, bSum = 0;
    for (const [r, g, b] of bucket) {
      rSum += r;
      gSum += g;
      bSum += b;
    }
    const n = bucket.length;
    return [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)];
  });
}

// Nearest-palette-index lookup, cached by exact RGB triple -- a choropleth
// map is overwhelmingly large solid-fill regions (a handful of distinct
// colors covering thousands of pixels each), so caching turns what would be
// a brute-force 256-entry search per pixel into one real search per
// DISTINCT color actually seen, which is a tiny fraction of total pixels.
function buildNearestIndexLookup(palette) {
  const cache = new Map();
  return function nearestIndex(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const [pr, pg, pb] = palette[i];
      const dr = pr - r, dg = pg - g, db = pb - b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    cache.set(key, best);
    return best;
  };
}

// Standard GIF-flavor LZW: codes 0..clearCode-1 are literal single-index
// codes (clearCode = 2^minCodeSize), clearCode itself resets the
// dictionary, eoiCode ends the stream. New codes are added for every
// (prefix, next-symbol) pair not already seen, code width grows from
// minCodeSize+1 up to 12 bits as the dictionary fills, and hitting the
// 4096-code ceiling forces an explicit clear + reset (never silently drops
// data). Dictionary keyed by a plain NUMBER (prefixCode*4096+symbol), not a
// string, so there's no string concatenation/hashing per pixel -- matters
// here since a single frame can be 500,000+ pixels.
function lzwEncodeIndices(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const bytesOut = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let curCodeSize;
  let nextCode;

  function emit(code) {
    bitBuffer |= code << bitCount;
    bitCount += curCodeSize;
    while (bitCount >= 8) {
      bytesOut.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  }

  let dict;
  function resetDict() {
    dict = new Map();
    nextCode = eoiCode + 1;
    curCodeSize = minCodeSize + 1;
  }

  resetDict();
  emit(clearCode);

  let prefixCode = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const symbol = indices[i];
    const key = prefixCode * 4096 + symbol;
    const existing = dict.get(key);
    if (existing !== undefined) {
      prefixCode = existing;
      continue;
    }
    emit(prefixCode);
    if (nextCode < 4096) {
      dict.set(key, nextCode);
      nextCode++;
      if (nextCode > (1 << curCodeSize) - 1 && curCodeSize < 12) curCodeSize++;
    } else {
      emit(clearCode);
      resetDict();
    }
    prefixCode = symbol;
  }
  emit(prefixCode);
  emit(eoiCode);
  if (bitCount > 0) bytesOut.push(bitBuffer & 0xff);
  return bytesOut;
}

// GIF image data is framed into sub-blocks of at most 255 bytes, each
// prefixed by its own length byte, terminated by a zero-length block.
function packSubBlocks(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
    i += 255;
  }
  out.push(0);
  return out;
}

function encodeGif({ width, height, frames, delayCentiseconds = 100, loop = 0 }) {
  const MAX_COLORS = 256;
  const MIN_CODE_SIZE = 8; // log2(256) -- always a full 256-entry table, see module docstring

  // Sample a bounded number of pixels across ALL frames combined for
  // quantization (not every pixel of every frame -- a multi-year GIF at
  // gmina-map resolution could easily be tens of millions of pixels total,
  // and median-cut only needs a representative sample to find good buckets).
  const totalPixels = (width * height) * frames.length;
  const targetSamples = 20000;
  const stride = Math.max(1, Math.floor(totalPixels / targetSamples));
  const samples = [];
  let seen = 0;
  for (const frame of frames) {
    for (let px = 0; px < width * height; px++) {
      if (seen % stride === 0) {
        const i = px * 4;
        samples.push([frame[i], frame[i + 1], frame[i + 2]]);
      }
      seen++;
    }
  }

  const palette = quantizeMedianCut(samples, MAX_COLORS);
  while (palette.length < MAX_COLORS) palette.push(palette[palette.length - 1] || [0, 0, 0]);
  const nearestIndex = buildNearestIndexLookup(palette);

  const bytes = [];
  const pushBytes = (...vals) => bytes.push(...vals);
  const pushAscii = (s) => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };
  const pushU16 = (v) => bytes.push(v & 0xff, (v >> 8) & 0xff);

  pushAscii("GIF89a");
  pushU16(width);
  pushU16(height);
  // packed byte: global color table present, color resolution 8 bits,
  // not sorted, table size 2^(7+1) = 256 entries.
  pushBytes(0xf7, 0, 0);
  for (const [r, g, b] of palette) pushBytes(r, g, b);

  // NETSCAPE2.0 application extension -- without this the GIF plays once
  // and stops; `loop` = 0 means loop forever (the spec's own convention).
  pushBytes(0x21, 0xff, 0x0b);
  pushAscii("NETSCAPE2.0");
  pushBytes(0x03, 0x01);
  pushU16(loop);
  pushBytes(0x00);

  for (const frame of frames) {
    // Graphic Control Extension: disposal method 1 ("do not dispose") since
    // every frame fully repaints the whole canvas anyway -- no transparency.
    pushBytes(0x21, 0xf9, 0x04, 0x04);
    pushU16(delayCentiseconds);
    pushBytes(0x00, 0x00);

    // Image Descriptor: no local color table, not interlaced.
    pushBytes(0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(width);
    pushU16(height);
    pushBytes(0x00);

    const indices = new Uint8Array(width * height);
    for (let px = 0; px < width * height; px++) {
      const i = px * 4;
      indices[px] = nearestIndex(frame[i], frame[i + 1], frame[i + 2]);
    }
    const lzwBytes = lzwEncodeIndices(indices, MIN_CODE_SIZE);
    pushBytes(MIN_CODE_SIZE);
    for (const b of packSubBlocks(lzwBytes)) pushBytes(b);
  }

  pushBytes(0x3b); // trailer
  return new Uint8Array(bytes);
}
