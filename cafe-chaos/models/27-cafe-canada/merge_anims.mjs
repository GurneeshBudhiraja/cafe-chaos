// Fold every animation in a glb into one named Ambient (Blender exports one per animated object).
// Usage: node merge_anims.mjs in.glb [out.glb]
import { readFileSync, writeFileSync } from 'node:fs';
const [, , src, dst = src] = process.argv;
const buf = readFileSync(src);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
const rest = buf.subarray(20 + jsonLen);
const anims = json.animations ?? [];
if (anims.length > 1) {
  const samplers = [];
  const channels = [];
  for (const a of anims) {
    const base = samplers.length;
    samplers.push(...a.samplers);
    for (const c of a.channels) channels.push({ ...c, sampler: c.sampler + base });
  }
  json.animations = [{ name: 'Ambient', samplers, channels }];
} else if (anims.length === 1) json.animations[0].name = 'Ambient';
let text = JSON.stringify(json);
while (text.length % 4) text += ' ';
const jsonChunk = Buffer.from(text);
const header = Buffer.alloc(12);
header.write('glTF', 0);
header.writeUInt32LE(2, 4);
const chunkHeader = Buffer.alloc(8);
chunkHeader.writeUInt32LE(jsonChunk.length, 0);
chunkHeader.writeUInt32LE(0x4e4f534a, 4);
const out = Buffer.concat([header, chunkHeader, jsonChunk, rest]);
out.writeUInt32LE(out.length, 8);
writeFileSync(dst, out);
console.log(`${dst}: ${anims.length} animations -> ${json.animations.length} (${json.animations[0]?.channels.length ?? 0} channels)`);
