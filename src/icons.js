// Pulls the largest icon out of a Windows .exe (PE file) so the library can
// show real app icons. Returns the path of a cached .png/.ico, or null.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAX_READ = 512 * 1024 * 1024;

function iconDir() {
  const dir = path.join(app.getPath('userData'), 'icons');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parse(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) return null; // "MZ"
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x4550) return null; // "PE\0\0"
  const sections = buf.readUInt16LE(pe + 6);
  const optSize = buf.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const dirs = buf.readUInt16LE(opt) === 0x20b ? opt + 112 : opt + 96;
  const resRva = buf.readUInt32LE(dirs + 2 * 8);
  if (!resRva) return null;
  const secs = [];
  for (let i = 0, s = opt + optSize; i < sections; i++, s += 40) {
    secs.push({ va: buf.readUInt32LE(s + 12), vsize: Math.max(buf.readUInt32LE(s + 8), buf.readUInt32LE(s + 16)), raw: buf.readUInt32LE(s + 20) });
  }
  const off = (rva) => {
    const s = secs.find((x) => rva >= x.va && rva < x.va + x.vsize);
    return s ? rva - s.va + s.raw : -1;
  };
  const root = off(resRva);
  if (root < 0) return null;

  const entries = (dir) => {
    const n = buf.readUInt16LE(dir + 12) + buf.readUInt16LE(dir + 14);
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = dir + 16 + i * 8;
      const data = buf.readUInt32LE(e + 4);
      out.push({ id: buf.readUInt32LE(e), sub: !!(data & 0x80000000), at: root + (data & 0x7fffffff) });
    }
    return out;
  };
  // Follows type → name → language down to the first data blob.
  const leaf = (e) => {
    while (e.sub) {
      const next = entries(e.at)[0];
      if (!next) return null;
      e = next;
    }
    const start = off(buf.readUInt32LE(e.at));
    return start < 0 ? null : buf.subarray(start, start + buf.readUInt32LE(e.at + 4));
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

function extract(exe) {
  try {
    const st = fs.statSync(exe);
    if (st.size > MAX_READ) return null;
    const key = crypto.createHash('sha1').update(`${exe}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 16);
    for (const ext of ['png', 'ico']) {
      const cached = path.join(iconDir(), `${key}.${ext}`);
      if (fs.existsSync(cached)) return cached;
    }
    const icon = parse(fs.readFileSync(exe));
    if (!icon) return null;
    const out = path.join(iconDir(), `${key}.${icon.ext}`);
    fs.writeFileSync(out, icon.data);
    return out;
  } catch {
    return null;
  }
}

module.exports = { extract, parse };
