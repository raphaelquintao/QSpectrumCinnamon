// Fire Ring — realistic flames that grow with the bars, plus a beat-driven
// puff of smoke and embers (like blowing on a campfire).
// QSpectrum advanced preset. Original GLSL; the polar flame approach is
// inspired by Burn-My-Windows (Simon Schneegans) but reimplemented from
// scratch. Noise/hash sources: see ATTRIBUTIONS.md.
//
// Layout: `p` is normalised so the canvas half-height is 1.0, i.e. the nearest
// canvas edge sits at r = 1.0. Every radius below is bounded well inside that
// and the final coverage fades to zero before it, so the animation can never
// clamp against an edge.

uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_bars;
uniform float u_level;
uniform float u_centroid;
uniform float u_bass;
uniform float u_treble;
uniform float u_beat;                    // decaying onset envelope (0..1)
uniform vec2  u_resolution;
uniform vec3  u_color_from;
uniform vec3  u_color_to;
uniform vec3  u_accent;
uniform float u_spectrum[64];

const float TAU = 6.283185307179586;

// Hash without Sine — Dave Hoskins. https://www.shadertoy.com/view/4djSRW
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Value noise, smoothstep interpolation. https://thebookofshaders.com/11/
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// Fractional Brownian motion (6 octaves). https://iquilezles.org/articles/fbm/
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

// Spectrum sample: 64 bands uploaded as a float array, linearly interpolated.
float spectrum(float u) {
  float f = clamp(u, 0.0, 1.0) * 63.0;
  float v = 0.0;
  for (int i = 0; i < 64; i++) {
    v += u_spectrum[i] * clamp(1.0 - abs(float(i) - f), 0.0, 1.0);
  }
  return v;
}

// Wrap-aware spectrum, so the ring has no seam where the spectrum ends meet.
float spectrum_wrap(float u) {
  return spectrum(fract(u));
}

// Blend neighbouring bands into a continuous curve: the flames then rise and
// fall fluidly with the music instead of stepping from bar to bar.
float spectrum_smooth(float u) {
  float d = 1.0 / 64.0;
  float s = spectrum_wrap(u);
  s += spectrum_wrap(u - d) + spectrum_wrap(u + d);
  s += spectrum_wrap(u - 2.0 * d) + spectrum_wrap(u + 2.0 * d);
  return s * 0.2;
}

// Blackbody-ish ramp: near-black -> deep red -> orange -> yellow -> white.
// Colours approximate the Planckian locus over a flame's temperature range.
vec3 fire_ramp(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c = vec3(0.05, 0.006, 0.000);
  c = mix(c, vec3(0.55, 0.060, 0.005), smoothstep(0.00, 0.22, x));
  c = mix(c, vec3(0.95, 0.250, 0.015), smoothstep(0.22, 0.45, x));
  c = mix(c, vec3(1.00, 0.580, 0.060), smoothstep(0.45, 0.66, x));
  c = mix(c, vec3(1.00, 0.850, 0.300), smoothstep(0.66, 0.84, x));
  c = mix(c, vec3(1.00, 0.980, 0.880), smoothstep(0.84, 1.00, x));
  return c;
}

// Turbulence for the flame edge, sampled through `dir` so it wraps seamlessly
// around the ring. The -t terms advect the field outward (the flames rise);
// a beat speeds the flow up, like a gust of air.
float flame_noise(vec2 dir, float q, float t, float bass, float beat) {
  vec2 b = dir * (2.2 + 2.6 * bass);
  float flow = 1.05 + 1.30 * beat;
  float n1 = fbm(b + dir * q * 2.4 + vec2(0.0, -t * flow));
  float n2 = fbm(b * 2.4 + dir * q * 5.5 + vec2(0.0, -t * flow * 1.9));
  return clamp(n1 * 0.65 + n2 * 0.35, 0.0, 1.0);
}

void main() {
  vec2 uv = cogl_tex_coord_in[0].st;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float u = fract(ang / TAU + 0.5);
  vec2 dir = vec2(cos(ang), sin(ang));

  float t = u_time * max(u_speed, 0.01);
  float bass = clamp(u_bass, 0.0, 1.0);
  float treble = clamp(u_treble, 0.0, 1.0);
  float level = clamp(u_level, 0.0, 1.0);
  float beat = clamp(u_beat, 0.0, 1.0);
  float amp = spectrum_smooth(u);

  // --- burner ---------------------------------------------------------------
  float R0 = 0.26 + 0.030 * bass;        // hollow core radius
  float q = r - R0;                      // outward distance from the burner

  // --- flames ---------------------------------------------------------------
  // The bar value sets the flame height, so the ring silhouette follows the
  // music. Turbulence only perturbs that height, keeping the bars readable
  // while the edge stays fluid.
  float height = 0.06 + 0.44 * amp;
  height *= 1.0 + 0.30 * beat;           // a gust flares the flames
  float turb = flame_noise(dir, q, t, bass, beat);
  float wobble = (turb - 0.5) * (0.09 + 0.10 * amp);
  float front = min(height + wobble, 0.52);   // ceiling: never near the edge

  // Soft-edged silhouette: bright at the burner, dissolving into the tips.
  float flame = clamp((front - q) * 9.0, 0.0, 1.0);
  flame *= smoothstep(-0.010, 0.045, q); // fade into the hollow core
  // Near the tip the flame erodes into separate tongues where turbulence is low.
  float tip = smoothstep(0.30, 1.0, q / max(front, 0.001));
  flame *= 1.0 - tip * (1.0 - turb) * 0.85;
  flame = clamp(flame, 0.0, 1.0);

  float hot = exp(-max(q, 0.0) * 10.0);
  float temp = flame * (0.42 + 0.72 * hot);
  // Thin, very hot rim hugging the burner.
  temp += exp(-max(q, 0.0) * 34.0) * smoothstep(-0.02, 0.03, q) * 0.9;

  // --- embers / particles ---------------------------------------------------
  // Sparse points drifting outward. A beat blows a denser, faster burst out.
  float cell = 34.0;
  vec2 gp = (p - dir * (t * 0.10 + beat * 0.12)) * cell;
  vec2 gi = floor(gp);
  vec2 gf = fract(gp) - 0.5;
  float h1 = hash21(gi);
  float h2 = hash21(gi + 11.7);
  vec2 off = (vec2(h2, hash21(gi + 23.1)) - 0.5) * 0.7;
  float dd = length(gf - off);
  float gate = step(0.82 - 0.22 * treble - 0.40 * beat, h1);
  float band = smoothstep(R0 + 0.02, R0 + 0.16, r)
             * (1.0 - smoothstep(R0 + 0.34, R0 + 0.56, r));
  float twinkle = 0.55 + 0.45 * sin(t * (3.0 + 9.0 * h2) + h1 * 40.0);
  float sparks = (1.0 - smoothstep(0.0, 0.16, dd)) * gate * band * twinkle
               * (0.45 + 2.0 * treble + 1.5 * beat);

  // --- smoke ----------------------------------------------------------------
  // One puff per beat: it starts at the burner and expands outward as the
  // envelope decays, exactly like blowing a campfire.
  float puff_r = R0 + 0.05 + (1.0 - beat) * 0.52;
  float pd = (r - puff_r) / 0.14;
  float puff = exp(-pd * pd) * beat;
  float sn = fbm(dir * 3.2 + dir * r * 2.0 + vec2(0.0, -t * 0.85));
  float smoke = clamp(puff * (0.50 + 0.75 * sn), 0.0, 1.0);

  // --- shade ----------------------------------------------------------------
  temp *= 0.60 + 0.55 * level;

  vec3 col = fire_ramp(temp);
  col = mix(col, vec3(0.26, 0.25, 0.24), clamp(smoke * 0.65, 0.0, 0.80));

  float a = clamp(temp + sparks + smoke * 0.42, 0.0, 1.0);
  a *= u_intensity;
  a = clamp(a, 0.0, 1.0);
  // Safety fade: coverage reaches zero before the nearest canvas edge.
  a *= 1.0 - smoothstep(0.90, 1.0, r);

  cogl_color_out = vec4(col, a);
}
