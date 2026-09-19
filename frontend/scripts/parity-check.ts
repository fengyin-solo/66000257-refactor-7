import { buildMessageMap, decodeFrameBytes, generateMockPayload, toDefaultDbc, encodeRawValue, getSignalDefinition, isOutOfRange } from '../src/shared/signal-engine';
import { parseDbc, DEFAULT_DBC_CONTENT } from '../src/utils/dbc-parser';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('FAIL:', msg); }
}

// Deterministic PRNG
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Reference: OLD frontend implementation (verbatim formulas) ----------
function oldFrontendFrame(rng: () => number) {
  const rpm = Math.floor(800 + rng() * 5200);
  const speed = Math.floor(rng() * 120);
  const temp = Math.floor(70 + rng() * 35);
  const throttle = Math.floor(rng() * 100);
  const load = Math.floor(rng() * 100);
  const rpmRaw = Math.round(rpm / 0.25);
  const b = [rpmRaw & 0xFF, (rpmRaw >> 8) & 0xFF, speed & 0xFF, (temp + 40) & 0xFF,
    Math.round(throttle / 0.392) & 0xFF, Math.round(load / 0.392) & 0xFF, 0, 0];
  const data = b.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const decoded = { EngineRPM: rpm, VehicleSpeed: speed, CoolantTemp: temp, ThrottlePosition: throttle, EngineLoad: load };
  return { data, decoded };
}

// ---------- Reference: OLD backend implementation (verbatim formulas, Java semantics) ----------
function jround(x: number) { return Math.floor(x + 0.5); } // Math.round(double)
function oldBackendFrame(rng: () => number) {
  let rpm = 800 + rng() * 5200;
  let speed = rng() * 120;
  let temp = 70 + rng() * 35;
  let throttle = rng() * 100;
  let load = rng() * 100;
  const r2 = (v: number) => jround(v * 100) / 100;
  rpm = r2(rpm); speed = r2(speed); temp = r2(temp); throttle = r2(throttle); load = r2(load);
  const rpmRaw = jround(rpm / 0.25);
  const b = [rpmRaw & 0xFF, (rpmRaw >> 8) & 0xFF, ((speed as unknown as number) | 0) & 0xFF,
    (((temp as unknown as number) | 0) + 40) & 0xFF,
    jround(throttle / 0.392) & 0xFF, jround(load / 0.392) & 0xFF];
  const data = b.map(x => (x < 0 ? x + 256 : x).toString(16).padStart(2, '0').toUpperCase()).join(' ') + ' 00 00';
  const decoded: Record<string, number> = {};
  (['EngineRPM', 'VehicleSpeed', 'CoolantTemp', 'ThrottlePosition', 'EngineLoad'] as const)
    .forEach((n, i) => { decoded[n] = [rpm, speed, temp, throttle, load][i]; });
  return { data, decoded };
}

// ---------- Parity: frontend style ----------
for (const seed of [1, 2, 42, 9999, 123456]) {
  const r1 = mulberry32(seed), r2 = mulberry32(seed);
  for (let i = 0; i < 2000; i++) {
    const oldF = oldFrontendFrame(r1);
    const newF = generateMockPayload(8, r2, Math.floor);
    assert(oldF.data === newF.data, `FE bytes mismatch seed=${seed} i=${i}: ${oldF.data} vs ${newF.data}`);
    assert(JSON.stringify(oldF.decoded) === JSON.stringify(newF.decoded), 'FE decoded mismatch');
    // decode bytes via engine, like addFrame does
    const msgMap = buildMessageMap();
    const frame = { arbitrationId: 2015, data: newF.data, dlc: 8 };
    const decoded = decodeFrameBytes(frame, msgMap.get(2015));
    // re-decode must be consistent with factor/offset; spot check via integer expectations
    assert(decoded.EngineRPM === oldF.decoded.EngineRPM, 'RPM redecode mismatch');
    assert(decoded.VehicleSpeed === oldF.decoded.VehicleSpeed, 'Speed redecode mismatch');
    assert(decoded.CoolantTemp === oldF.decoded.CoolantTemp, 'Temp redecode mismatch');
  }
}

// ---------- Parity: backend style (Java semantics port) ----------
for (const seed of [1, 7, 42, 777, 987654]) {
  const r1 = mulberry32(seed), r2 = mulberry32(seed);
  for (let i = 0; i < 2000; i++) {
    const oldF = oldBackendFrame(r1);
    const newF = generateMockPayload(8, r2, v => jround(v * 100) / 100);
    assert(oldF.data === newF.data, `BE bytes mismatch seed=${seed} i=${i}: ${oldF.data} vs ${newF.data}`);
    assert(JSON.stringify(oldF.decoded) === JSON.stringify(newF.decoded), 'BE decoded mismatch');
  }
}

// ---------- Range/out-of-bound semantics ----------
assert(isOutOfRange('EngineRPM', -0.001) === true, 'rpm below');
assert(isOutOfRange('EngineRPM', 0) === false, 'rpm at min');
assert(isOutOfRange('EngineRPM', 16383.75) === false, 'rpm at max');
assert(isOutOfRange('EngineRPM', 16383.76) === true, 'rpm above max');
assert(isOutOfRange('CoolantTemp', -40) === false, 'temp at min');
assert(isOutOfRange('CoolantTemp', 215) === false, 'temp at max');
assert(isOutOfRange('UnknownSignal', 1) === false, 'unknown signal');
const rpmDef = getSignalDefinition('EngineRPM')!;
assert(encodeRawValue(rpmDef, 16383.75) === 65535, 'rpm raw max');
assert(encodeRawValue(rpmDef, 999999) === 65535, 'rpm saturate high');
assert(encodeRawValue(rpmDef, -100) === 0, 'rpm saturate low');

// ---------- DBC: generated text round-trips through parseDbc, equal to buildMessageMap ----------
const generated = parseDbc(toDefaultDbc());
const fromJson = buildMessageMap();
assert(generated.size === fromJson.size, 'message count');
for (const [id, msg] of fromJson) {
  const g = generated.get(id);
  assert(!!g, `generated missing msg ${id}`);
  assert(g!.name === msg.name && g!.dlc === msg.dlc && g!.sender === msg.sender, `msg header ${id}`);
  assert(g!.signals.length === msg.signals.length, `sig count ${id}`);
  for (let i = 0; i < msg.signals.length; i++) {
    const a = g!.signals[i], b = msg.signals[i];
    assert(a.name === b.name && a.startBit === b.startBit && a.bitLength === b.bitLength &&
      a.factor === b.factor && a.offset === b.offset && a.minValue === b.minValue &&
      a.maxValue === b.maxValue && a.unit === b.unit, `signal ${id}/${b.name} DBC round-trip`);
  }
}

// Generated default DBC must still match the historical template (unit for temp was degC historically;
// canonical definition says °C, which the display also uses — only that token differs intentionally).
const historical = `VERSION ""

NS_ :

BS_:

BU_: ECU Dashboard

BO_ 2015 OBD_Request: 8 ECU
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" Dashboard
 SG_ VehicleSpeed : 16|8@1+ (1,0) [0|255] "km/h" Dashboard
 SG_ CoolantTemp : 24|8@1+ (1,-40) [-40|215] "°C" Dashboard
 SG_ ThrottlePosition : 32|8@1+ (0.392,0) [0|100] "%" Dashboard
 SG_ EngineLoad : 40|8@1+ (0.392,0) [0|100] "%" Dashboard

BO_ 2024 OBD_Response_Engine: 8 ECU
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" Dashboard
 SG_ VehicleSpeed : 16|8@1+ (1,0) [0|255] "km/h" Dashboard
 SG_ CoolantTemp : 24|8@1+ (1,-40) [-40|215] "°C" Dashboard
 SG_ ThrottlePosition : 32|8@1+ (0.392,0) [0|100] "%" Dashboard
 SG_ EngineLoad : 40|8@1+ (0.392,0) [0|100] "%" Dashboard

BO_ 2025 OBD_Response_Transmission: 8 ECU
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" Dashboard
 SG_ VehicleSpeed : 16|8@1+ (1,0) [0|255] "km/h" Dashboard
 SG_ CoolantTemp : 24|8@1+ (1,-40) [-40|215] "°C" Dashboard
 SG_ ThrottlePosition : 32|8@1+ (0.392,0) [0|100] "%" Dashboard
 SG_ EngineLoad : 40|8@1+ (0.392,0) [0|100] "%" Dashboard
`;
assert(DEFAULT_DBC_CONTENT === historical, 'default DBC text matches historical template (°C canonical)');

// ---------- User DBC with a JSON-unknown signal still decodes via message definition ----------
const userDbc = `BO_ 100 Custom: 8 ECU
 SG_ NewSignal : 0|8@1+ (2,1) [1|511] "V" Dashboard
`;
const custom = parseDbc(userDbc).get(100)!;
const customDecoded = decodeFrameBytes({ arbitrationId: 100, data: '19 00 00 00 00 00 00 00', dlc: 8 }, custom);
assert(customDecoded.NewSignal === 2 * 25 + 1, 'custom DBC signal decode');

if (failures === 0) console.log('ALL PARITY CHECKS PASSED');
else { console.error(`${failures} FAILURES`); process.exit(1); }
