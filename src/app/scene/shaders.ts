// GLSL for the diorama. Everything is lit by one real sun (see sun.ts) and shares these uniforms:
// uSunDir/uSunColor, uSkyAmb/uGroundAmb, uFog*, uNightF, uExag, the slab heightfield uHF and night lights.

export const COMMON = /* glsl */ `
uniform float uExag;
uniform float uC;
uniform float uCY;
uniform float uK;
uniform vec4 uSlab;        // world x0, z0, w, h
uniform sampler2D uHF;     // sqrt-encoded heights, R8
uniform float uHMax;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uNightF;
uniform float uTime;

float latScale(float z) {
  float my = z / uC + uCY;
  float lat = atan(sinh(3.14159265 * (1.0 - 2.0 * my)));
  return uK / cos(lat);
}
vec2 slabUv(vec2 xz) { return (xz - uSlab.xy) / uSlab.zw; }
float hfH(vec2 suv) { float v = texture(uHF, suv).r; return v * v * uHMax; }
float hfHLod(vec2 suv, float lod) { float v = textureLod(uHF, suv, lod).r; return v * v * uHMax; }

vec3 applyFog(vec3 col, vec3 world) {
  vec3 V = world - cameraPosition;
  float dist = length(V);
  float amt = 1.0 - exp(-dist * uFogDensity);
  float sunAmt = pow(max(dot(V / max(dist, 1e-4), normalize(uSunDir + vec3(0.0, 0.05, 0.0))), 0.0), 6.0);
  vec3 fc = mix(uFogColor, uFogSunColor, sunAmt);
  return mix(col, fc, clamp(amt, 0.0, 1.0));
}

// hash / value noise / fbm
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`

export const TERRAIN_VERT = /* glsl */ `
${COMMON}
uniform vec4 uRect;          // tile world x0, z0, w, h
uniform sampler2D uHeights;  // 65×65 metres (R32F) when uHasDetail
uniform float uHasDetail;
uniform float uSkirt;
out vec2 vUv;
out vec3 vWorld;
out float vH;
out float vS;
out vec2 vSuv;
void main() {
  vec2 g = position.xz;
  vec3 w = vec3(uRect.x + g.x * uRect.z, 0.0, uRect.y + g.y * uRect.w);
  vec2 suv = slabUv(w.xz);
  float h;
  if (uHasDetail > 0.5) h = texture(uHeights, (g * 64.0 + 0.5) / 65.0).r;
  else h = hfHLod(suv, 0.0);
  float s = latScale(w.z);
  w.y = max(h, 0.0) / 1000.0 * s * uExag + position.y * uSkirt;
  vUv = g; vWorld = w; vH = h; vS = s; vSuv = suv;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`

export const TERRAIN_FRAG = /* glsl */ `
${COMMON}
layout(location = 0) out highp vec4 outColor;
uniform sampler2D uImg;
uniform vec4 uImgST;      // scale.xy, offset.zw into uImg
uniform sampler2D uGrad;
uniform float uHasGrad;
uniform sampler2D uNight;
uniform vec2 uHFTexel;
uniform float uSnowline;
uniform int uSteps;
uniform vec4 uFocus;      // x, z, radius, amount
in vec2 vUv;
in vec3 vWorld;
in float vH;
in float vS;
in vec2 vSuv;

float shadowAt(vec3 p, vec3 L, float s) {
  if (L.y <= 0.0) return 0.0;
  float res = 1.0;
  float t = 1.2;
  vec3 o = p + vec3(0.0, 0.10 * s * uExag, 0.0);
  float top = 5.0 * s * uExag;
  for (int i = 0; i < 40; i++) {
    if (i >= uSteps) break;
    vec3 q = o + L * t;
    vec2 suv = slabUv(q.xz);
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0 || q.y > top) break;
    float th = hfH(suv) / 1000.0 * s * uExag;
    res = min(res, 18.0 * (q.y - th) / t);
    if (res < -0.05) break;
    t *= 1.27;
  }
  return smoothstep(0.0, 1.0, res);
}

void main() {
  vec3 albedo = texture(uImg, vUv * uImgST.xy + uImgST.zw).rgb;
  // Sentinel-2 mosaics are a touch dark and flat: lift and warm them slightly.
  float l0 = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = mix(vec3(l0), albedo, 0.96) * vec3(1.2, 1.16, 1.08);

  // slope → normal
  vec2 g;
  if (uHasGrad > 0.5) {
    vec2 e = (texture(uGrad, vUv).rg * 255.0 - 128.0) / 127.0;
    g = sign(e) * e * e * 4.0;
  } else {
    float pxm = uSlab.z * uHFTexel.x / vS * 1000.0;
    float hl = hfH(vSuv - vec2(uHFTexel.x, 0.0)), hr = hfH(vSuv + vec2(uHFTexel.x, 0.0));
    float hu = hfH(vSuv - vec2(0.0, uHFTexel.y)), hd = hfH(vSuv + vec2(0.0, uHFTexel.y));
    g = vec2(hr - hl, hd - hu) / (2.0 * pxm);
  }
  float slopeTrue = length(g);
  vec3 n = normalize(vec3(-g.x * uExag, 1.0, -g.y * uExag));
  vec3 L = normalize(uSunDir);

  // water: the sea (DEM ≤ 0) and flat, dark, blue-ish lakes
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  float blueish = smoothstep(0.0, 0.02, albedo.b - albedo.r * 0.95) * smoothstep(0.0, 0.015, albedo.b - albedo.g * 0.8);
  float water = max(step(vH, 0.5) * smoothstep(0.35, 0.12, lum) * max(blueish, 0.35),
                    step(slopeTrue, 0.012) * smoothstep(0.16, 0.07, lum) * blueish);
  water = clamp(water, 0.0, 1.0);

  // May snow: typical snowline, lower on north-facing slopes, never on cliffs
  float north = clamp(-n.z / max(0.2, length(n.xz)), -1.0, 1.0) * smoothstep(0.03, 0.2, slopeTrue);
  float jitter = (fbm(vWorld.xz * 1.7) - 0.5) * 360.0;
  float line = uSnowline - north * 330.0 + jitter;
  float snow = smoothstep(line - 150.0, line + 250.0, vH) * (1.0 - smoothstep(0.5, 0.95, slopeTrue)) * (1.0 - water);
  // keep the photo's texture (rock ribs, glaciers) showing through the snow
  vec3 snowCol = vec3(0.78, 0.82, 0.88) * (0.7 + 0.6 * smoothstep(0.02, 0.35, l0));
  albedo = mix(albedo, snowCol, snow * 0.5);

  // lighting (plus soft shadows of passing fair-weather clouds)
  float sh = shadowAt(vWorld, L, vS);
  vec2 cp = (vWorld.xz + L.xz / max(L.y, 0.15) * 2.0) * 0.045 + vec2(uTime * 0.012, uTime * 0.004);
  float cloud = smoothstep(0.58, 0.8, fbm(cp)) * 0.32 * (1.0 - smoothstep(250.0, 700.0, length(cameraPosition - vWorld)));
  sh *= 1.0 - cloud;
  float ndl = max(dot(n, L), 0.0);
  float avg = hfHLod(vSuv, 3.5);
  float ao = clamp(1.0 - max(0.0, avg - vH) / 900.0, 0.55, 1.0);
  vec3 amb = mix(uGroundAmb, uSkyAmb, 0.5 + 0.5 * n.y) * ao * 1.35;
  vec3 col = albedo * (uSunColor * ndl * sh + amb);

  if (water > 0.01) {
    vec3 V = normalize(vWorld - cameraPosition);
    vec2 wp = vWorld.xz * 6.0;
    vec3 wn = normalize(vec3((vnoise(wp + uTime * 0.35) - 0.5) * 0.18, 1.0, (vnoise(wp.yx - uTime * 0.3) - 0.5) * 0.18));
    vec3 R = reflect(V, wn);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, wn), 0.0), 5.0);
    vec3 sky = mix(uSkyAmb * 1.6, uFogSunColor, pow(max(dot(R, L), 0.0), 3.0));
    float spec = pow(max(dot(R, L), 0.0), 900.0) * 60.0 + pow(max(dot(R, L), 0.0), 90.0) * 1.2;
    vec3 deep = albedo * 0.55 * (uSunColor * max(L.y, 0.0) * sh + amb);
    vec3 wcol = mix(deep, sky, fres) + uSunColor * spec * sh;
    col = mix(col, wcol, water);
  }

  // night: real VIIRS lights, warm sodium glow
  float lights = texture(uNight, vSuv).r;
  col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.6) * 3.2 * uNightF;

  // focus: gently quiet everything away from where you are choosing
  if (uFocus.w > 0.0) {
    float d = length(vWorld.xz - uFocus.xy) / uFocus.z;
    float f = smoothstep(0.85, 1.4, d) * uFocus.w;
    float gl = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(gl) * 0.55, f * 0.75);
  }

  col = applyFog(col, vWorld);
  outColor = vec4(col, 1.0);
}
`

export const WALL_VERT = /* glsl */ `
${COMMON}
attribute float aH;
attribute float aTop;
uniform float uDepth;
out vec3 vWorld;
out float vH;
out float vTopY;
void main() {
  vec3 w = position;
  float s = latScale(w.z);
  float top = max(aH, 0.0) / 1000.0 * s * uExag;
  w.y = aTop > 0.5 ? top : -uDepth;
  vWorld = w; vH = aH; vTopY = top;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`

export const WALL_FRAG = /* glsl */ `
${COMMON}
layout(location = 0) out highp vec4 outColor;
uniform vec3 uNormal;
uniform float uDepth;
in vec3 vWorld;
in float vH;
in float vTopY;
void main() {
  float along = dot(vWorld.xz, vec2(0.7071, 0.7071));
  float y = vWorld.y;
  float wob = (fbm(vec2(along * 0.02, y * 0.05)) - 0.5) * 6.0;
  float band = sin((y + wob) * 0.55) * 0.5 + 0.5;
  float band2 = sin((y + wob * 1.7) * 0.17 + 1.3) * 0.5 + 0.5;
  vec3 earth = mix(vec3(0.34, 0.24, 0.17), vec3(0.52, 0.40, 0.29), band);
  earth = mix(earth, vec3(0.25, 0.20, 0.17), band2 * 0.45);
  float depthT = clamp(-y / uDepth, 0.0, 1.0);
  earth *= mix(1.0, 0.55, depthT);
  // a grassy lip and a soil layer just under the surface
  float lip = smoothstep(1.6, 0.0, vTopY - y);
  earth = mix(earth, vec3(0.18, 0.24, 0.12), lip * step(0.5, vH));
  vec3 col = earth;
  // sea: a slice of water above the sea floor
  float sea = step(vH, 0.5) * smoothstep(-3.0, -2.4, y);
  col = mix(col, mix(vec3(0.02, 0.10, 0.20), vec3(0.05, 0.28, 0.42), smoothstep(-3.0, 0.0, y)), sea);
  float ndl = max(dot(uNormal, normalize(uSunDir)), 0.0);
  vec3 lit = col * (uSunColor * ndl * 0.8 + mix(uGroundAmb, uSkyAmb, 0.5) * 1.1);
  lit = applyFog(lit, vWorld);
  outColor = vec4(lit, 1.0);
}
`

export const SEA_VERT = /* glsl */ `
${COMMON}
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

// A sea of cloud far below the floating slab, catching the same sun and the slab's shadow.
export const SEA_FRAG = /* glsl */ `
${COMMON}
layout(location = 0) out highp vec4 outColor;
uniform float uSlabBottom;
in vec3 vWorld;
void main() {
  vec3 L = normalize(uSunDir);
  vec2 p = vWorld.xz * 0.0022;
  float t = uTime * 0.004;
  float n = fbm(p + vec2(t, t * 0.6));
  float n2 = fbm(p * 2.7 - vec2(t * 1.4, 0.0));
  float c = smoothstep(0.25, 0.85, n * 0.7 + n2 * 0.45);
  // fake relief lighting on the cloud tops
  float nx = fbm(p + vec2(0.02, 0.0) + vec2(t, t * 0.6)) - n;
  float nz = fbm(p + vec2(0.0, 0.02) + vec2(t, t * 0.6)) - n;
  vec3 cn = normalize(vec3(-nx * 30.0, 1.0, -nz * 30.0));
  float ndl = clamp(dot(cn, L) * 0.6 + 0.4, 0.0, 1.0);
  // shadow of the slab: trace toward the sun up to the slab's underside
  float sh = 1.0;
  if (L.y > 0.01) {
    float tt = (uSlabBottom - vWorld.y) / L.y;
    vec2 hit = vWorld.xz + L.xz * tt;
    vec2 suv = slabUv(hit);
    vec2 d = max(-suv, suv - 1.0);
    float out_ = max(d.x * uSlab.z, d.y * uSlab.w);
    sh = mix(0.35, 1.0, smoothstep(-60.0, 160.0, out_));
  }
  vec3 base = uSkyAmb * 1.1 + uFogColor * 0.15;
  vec3 col = mix(base * 0.45, base * 0.8 + uSunColor * 0.28 * ndl, c) * sh;
  col = mix(col, col * 0.3 + vec3(0.01, 0.015, 0.03), uNightF * 0.8);
  col = applyFog(col, vWorld);
  outColor = vec4(col, 1.0);
}
`

// Route ribbons: screen-space wide lines draped on the terrain, with a moving pulse of light,
// colour by direction / battery / climb, gold where you have actually driven, and an x-ray pass for
// the parts hidden behind mountains or inside tunnels.
export const RIBBON_VERT = /* glsl */ `
${COMMON}
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aAlong;
attribute vec4 aColor;
attribute float aSoc;
attribute float aGrade;
attribute float aDriven;
attribute float aTunnel;
uniform vec2 uRes;
uniform float uWidth;
uniform float uLift;
out float vSide;
out float vAlong;
out vec4 vColor;
out float vSoc;
out float vGrade;
out float vDriven;
out float vTunnel;
out vec3 vWorld;
vec3 lifted(vec3 p) { return vec3(p.x, p.y * uExag + uLift, p.z); }
void main() {
  vec3 P = lifted(position), A = lifted(aPrev), B = lifted(aNext);
  mat4 vp = projectionMatrix * viewMatrix;
  vec4 cp = vp * vec4(P, 1.0), ca = vp * vec4(A, 1.0), cb = vp * vec4(B, 1.0);
  vec2 sp = cp.xy / cp.w * uRes, sa = ca.xy / ca.w * uRes, sb = cb.xy / cb.w * uRes;
  vec2 d1 = normalize(sp - sa + 1e-6), d2 = normalize(sb - sp + 1e-6);
  vec2 dir = normalize(d1 + d2);
  vec2 nrm = vec2(-dir.y, dir.x);
  float miter = 1.0 / max(0.35, dot(nrm, vec2(-d1.y, d1.x)));
  vec2 off = nrm * aSide * uWidth * miter;
  cp.xy += off / uRes * cp.w;
  cp.z -= 0.0015 * cp.w; // gentle depth bias so the ribbon sits on the surface
  gl_Position = cp;
  vSide = aSide; vAlong = aAlong; vColor = aColor; vSoc = aSoc; vGrade = aGrade; vDriven = aDriven; vTunnel = aTunnel; vWorld = P;
}
`

export const RIBBON_FRAG = /* glsl */ `
${COMMON}
layout(location = 0) out highp vec4 outColor;
uniform int uMode;        // 0 route colours, 1 battery, 2 climb
uniform float uDraw;      // km drawn so far (intro animation)
uniform float uXray;      // 1 for the occluded pass
uniform float uOpacity;
uniform float uPulse;
uniform float uSweep;     // km position of a travelling glow (selected day), < 0 = off
in float vSide;
in float vAlong;
in vec4 vColor;
in float vSoc;
in float vGrade;
in float vDriven;
in float vTunnel;
in vec3 vWorld;
vec3 socColor(float s) {
  s = clamp(s / 100.0, 0.0, 1.0);
  vec3 lo = vec3(1.0, 0.25, 0.2), mid = vec3(1.0, 0.75, 0.2), hi = vec3(0.35, 1.0, 0.55);
  return s < 0.5 ? mix(lo, mid, s * 2.0) : mix(mid, hi, (s - 0.5) * 2.0);
}
vec3 gradeColor(float g) {
  float a = clamp(abs(g) / 0.09, 0.0, 1.0);
  return g >= 0.0 ? mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.3, 0.25), a) : mix(vec3(0.55, 0.85, 1.0), vec3(0.4, 0.5, 1.0), a);
}
void main() {
  if (vAlong > uDraw) discard;
  float edge = abs(vSide);
  float core = smoothstep(1.0, 0.25, edge);
  vec3 c = vColor.rgb;
  if (uMode == 1) c = socColor(vSoc);
  else if (uMode == 2) c = gradeColor(vGrade);
  if (vDriven > 0.5) c = vec3(1.0, 0.74, 0.16);
  // flowing light in the direction of travel
  float pulse = pow(fract(vAlong / 40.0 - uTime * 0.18), 10.0) * uPulse;
  // the drawing head glows
  float head = smoothstep(uDraw - 25.0, uDraw, vAlong) * step(uDraw, 1e5 - 1.0);
  float sweep = uSweep >= 0.0 ? exp(-abs(vAlong - uSweep) / 4.0) + 0.35 * smoothstep(uSweep, uSweep - 60.0, vAlong) * step(vAlong, uSweep) : 0.0;
  vec3 col = c * (1.25 + pulse * 2.5 + head * 3.0 + sweep * 2.2) + vec3(1.0) * smoothstep(0.45, 0.0, edge) * (0.55 + sweep);
  if (vDriven > 0.5) col = c * (1.6 + 0.6 * pow(max(0.0, sin(vAlong * 0.9 - uTime * 2.4)), 8.0)) + vec3(1.0, 0.9, 0.6) * smoothstep(0.35, 0.0, edge) * 0.4;
  float a = core * vColor.a * uOpacity;
  if (uXray > 0.5 || vTunnel > 0.5) {
    float dash = step(0.5, fract(vAlong / 1.2));
    a *= 0.35 * dash;
  }
  outColor = vec4(col, a);
}
`

export const GATE_VERT = /* glsl */ `
${COMMON}
attribute vec3 aOffset;
attribute vec3 aTint;
attribute float aScale;
uniform float uSize;
out vec3 vN;
out vec3 vTint;
out vec3 vWorld;
void main() {
  vec3 w = aOffset * vec3(1.0, uExag, 1.0) + position * uSize * aScale;
  vN = normal; vTint = aTint; vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`

export const GATE_FRAG = /* glsl */ `
${COMMON}
layout(location = 0) out highp vec4 outColor;
in vec3 vN;
in vec3 vTint;
in vec3 vWorld;
void main() {
  float ndl = max(dot(normalize(vN), normalize(uSunDir)), 0.0);
  vec3 col = vTint * (0.55 + ndl * 0.7) + vTint * 0.6;
  outColor = vec4(col, 1.0);
}
`
