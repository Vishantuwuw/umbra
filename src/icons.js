// Pulls the largest icon out of a Windows .exe (PE file) so the library can
// show real app icons. Returns the path of a cached .png/.ico, or null.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAX_BLOB = 16 * 1024 * 1024;
const MAX_SECTION = 64 * 1024 * 1024;

function iconDir() {
  const dir = path.join(app.getPath('userData'), 'icons');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Reads byte ranges of a file on demand, keeping the ranges already read.
function fileReader(fd, size) {
  const chunks = [];
  const bytes = (at, len) => {
    if (at < 0 || len < 0 || at + len > size) throw new RangeError('Read past end of file');
    const c = chunks.find((x) => at >= x.at && at + len <= x.at + x.buf.length);
    if (c) return c.buf.subarray(at - c.at, at - c.at + len);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, at);
    return buf;
  };
  const load = (at, len) => {
    len = Math.max(0, Math.min(len, size - at));
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, at);
    chunks.push({ at, buf });
  };
  return { bytes, load, size };
}

function bufferReader(buf) {
  return {
    bytes: (at, len) => {
      if (at < 0 || len < 0 || at + len > buf.length) throw new RangeError('Read past end of buffer');
      return buf.subarray(at, at + len);
    },
    load: () => {},
    size: buf.length,
  };
}

function parse(src) {
  const r = Buffer.isBuffer(src) ? bufferReader(src) : src;
  r.load(0, 4096);
  const u16 = (at) => r.bytes(at, 2).readUInt16LE(0);
  const u32 = (at) => r.bytes(at, 4).readUInt32LE(0);
  if (u16(0) !== 0x5a4d) return null; // "MZ"
  const pe = u32(0x3c);
  if (u32(pe) !== 0x4550) return null; // "PE\0\0"
  const sections = u16(pe + 6);
  const optSize = u16(pe + 20);
  const opt = pe + 24;
  r.load(opt, optSize + sections * 40);
  const dirs = u16(opt) === 0x20b ? opt + 112 : opt + 96;
  const resRva = u32(dirs + 2 * 8);
  if (!resRva) return null;
  const secs = [];
  for (let i = 0, s = opt + optSize; i < sections; i++, s += 40) {
    secs.push({ va: u32(s + 12), vsize: Math.max(u32(s + 8), u32(s + 16)), raw: u32(s + 20), rawSize: u32(s + 16) });
  }
  const off = (rva) => {
    const s = secs.find((x) => rva >= x.va && rva < x.va + x.vsize);
    return s ? rva - s.va + s.raw : -1;
  };
  const root = off(resRva);
  if (root < 0) return null;
  const rsrc = secs.find((x) => resRva >= x.va && resRva < x.va + x.vsize);
  r.load(rsrc.raw, Math.min(rsrc.rawSize, MAX_SECTION));

  const entries = (dir) => {
    const n = u16(dir + 12) + u16(dir + 14);
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = dir + 16 + i * 8;
      const data = u32(e + 4);
      out.push({ id: u32(e), sub: !!(data & 0x80000000), at: root + (data & 0x7fffffff) });
    }
    return out;
  };
  // Follows type → name → language down to the first data blob. Real trees are
  // three levels deep; the cap stops a malformed (looping) tree.
  const leaf = (e) => {
    if (e.at === undefined) return null;
    const seen = new Set();
    while (e.sub) {
      if (seen.has(e.at) || seen.size > 8) return null;
      seen.add(e.at);
      const next = entries(e.at)[0];
      if (!next) return null;
      e = next;
    }
    const start = off(u32(e.at));
    const len = u32(e.at + 4);
    return start < 0 || len > MAX_BLOB ? null : r.bytes(start, len);
  };

  const types = entries(root);
  const group = types.find((t) => t.id === RT_GROUP_ICON);
  const icons = types.find((t) => t.id === RT_ICON);
  if (!group || !icons) return null;
  const grp = leaf(entries(group.at)[0] || {});
  if (!grp) return null;
  const count = grp.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 14;
    const size = grp[e] || 256;
    const bits = grp.readUInt16LE(e + 6);
    const score = size * 100 + bits;
    if (!best || score > best.score) best = { score, size, bits, id: grp.readUInt16LE(e + 12), entry: grp.subarray(e, e + 12) };
  }
  if (!best) return null;
  const iconEntry = entries(icons.at).find((x) => x.id === best.id);
  const data = iconEntry && leaf(iconEntry);
  if (!data) return null;
  if (data.subarray(0, 4).equals(PNG)) return { ext: 'png', data };
  // Wrap a bare DIB icon in a one-image .ico container.
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  best.entry.copy(header, 6, 0, 8);
  header.writeUInt32LE(data.length, 14);
  header.writeUInt32LE(22, 18);
  return { ext: 'ico', data: Buffer.concat([header, data]) };
}

// Reads only the PE headers and the resource section, not the whole exe.
function extract(exe) {
  let fd = null;
  try {
    const st = fs.statSync(exe);
    const key = crypto.createHash('sha1').update(`${exe}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 16);
    for (const ext of ['png', 'ico']) {
      const cached = path.join(iconDir(), `${key}.${ext}`);
      if (fs.existsSync(cached)) return cached;
    }
    fd = fs.openSync(exe, 'r');
    const icon = parse(fileReader(fd, st.size));
    if (!icon) return null;
    const out = path.join(iconDir(), `${key}.${icon.ext}`);
    fs.writeFileSync(out, icon.data);
    return out;
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

module.exports = { extract, parse };
