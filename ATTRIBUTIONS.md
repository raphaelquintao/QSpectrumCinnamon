# Attributions

QSpectrum stands on the shoulders of giants. Every mathematical transformation, filter, and visual technique used here is documented below to honor the authors, researchers, and open-source maintainers who made this possible.

QSpectrum itself is licensed under **Apache-2.0**; the third-party items below maintain their own licenses.

## Table of Contents
- [Audio Capture & FFT](#audio-capture-and-fft)
- [Signal Analysis](#signal-analysis)
- [Smoothing & Filtering](#smoothing-and-filtering)
- [Rendering: Cairo](#rendering--cairo)
- [Rendering: GLSL](#rendering--glsl)
- [Technical Notes](#technical-notes)

---

## Audio Capture and FFT

QSpectrum does not implement the transform itself: GStreamer's `spectrum` element analyses the audio and posts magnitudes, which are then post-processed.

- **Spectrum element** (LGPL) — [gst-plugins-good](https://gstreamer.freedesktop.org/documentation/spectrum/index.html)
- **FFT** — GStreamer's `gst-fft` (derived from **Kiss FFT** by Mark Borgerding, BSD-3-Clause). 
  - *Algorithm:* Cooley & Tukey's radix decomposition (*Math. Comp. 1965*). 
  - [Kiss FFT](https://github.com/mborgerding/kissfft) | [DOI](https://doi.org/10.1090/S0025-5718-1965-0178586-1)
- **Windowing** — Uses a **Hamming** window (`GST_FFT_WINDOW_HAMMING`). [Wikipedia](https://en.wikipedia.org/wiki/Window_function)
- **High-pass** — GStreamer's `audiocheblimit` (Chebyshev) at 50 Hz to drop DC and rumble.
- **Magnitude** — dBFS: `10·log10(|X|²/nfft²)`, averaged over intervals and floored at the element's threshold.

## Signal Analysis

- **Log-spaced band grouping** — `f_k = FMIN·(FMAX/FMIN)^(k/U)`, modeled after IEC 61260. [Wikipedia](https://en.wikipedia.org/wiki/Octave_band)
- **dB to amplitude** — Standard decibel conversion, `10^(dB/20)`. [Wikipedia](https://en.wikipedia.org/wiki/Decibel)
- **Noise floor / gate** — Downward expander for silence. [Wikipedia](https://en.wikipedia.org/wiki/Noise_gate)
- **Spectral tilt** — Pink-noise (1/f) compensation, +4.5 dB/octave (`pow(f/1000, 0.7475)`). [Wikipedia](https://en.wikipedia.org/wiki/Pink_noise)
- **Power-law compression** — `x^0.8` soft dynamic-compression curve.
- **Spectral centroid** — MIR timbre descriptor used to bias ring rotation. [Wikipedia](https://en.wikipedia.org/wiki/Spectral_centroid)

## Smoothing and Filtering

- **Leaky integrator** — One-pole IIR exponential smoothing (J.O. Smith, *Introduction to Digital Filters*). [CCRMA](https://ccrma.stanford.edu/~jos/filters/)
- **Level-meter ballistics** — VU/PPM attack & release (IEC 60268-17). [Wikipedia](https://en.wikipedia.org/wiki/VU_meter)
- **Onset detection** — Half-wave-rectified energy rise. [Wikipedia](https://en.wikipedia.org/wiki/Onset_(audio))
- **Automatic gain control (AGC)** — [Wikipedia](https://en.wikipedia.org/wiki/Automatic_gain_control)
- **Monstercat filter** — Geometric-decay peak-envelope spreading, after CAVA (Karl Stavestrand, MIT). [GitHub](https://github.com/karlstav/cava)
- **Skirt filter** — 1D grayscale morphological dilation (Matheron & Serra). [Wikipedia](https://en.wikipedia.org/wiki/Mathematical_morphology)
- **Smooth filter** — 3-tap FIR moving average ([1,2,1]/4 binomial kernel). [Wikipedia](https://en.wikipedia.org/wiki/Binomial_filter)
- **Gaussian filter** — 1D Gaussian kernel convolution. [Wikipedia](https://en.wikipedia.org/wiki/Gaussian_blur)

## Rendering — Cairo

- **Vector primitives** — Rounded rectangles, linear/radial gradients, and arcs. [Cairo](https://www.cairographics.org/)
- **Easing curves** — AHEasing (Warren Moore, MIT), modeling Robert Penner's equations. [GitHub](https://github.com/warrenm/AHEasing)

## Rendering — GLSL

- **Sine-fract hash** — Canonical hash for Shades. [The Book of Shaders](https://thebookofshaders.com/10/)
- **Hash without Sine** — Dave Hoskins' sine-free hash. [Shadertoy](https://www.shadertoy.com/view/4djSRW)
- **Value noise** — Smoothstep-interpolated lattice noise. [The Book of Shaders](https://thebookofshaders.com/11/)
- **Fractional Brownian motion (fBm)** — Multi-octave noise (Mandelbrot & Van Ness, 1968). [Wikipedia](https://en.wikipedia.org/wiki/Fractional_Brownian_motion) | [Inigo Quilez](https://iquilezles.org/articles/fbm/)
- **Domain warping** — Noise-warped noise fields. [Inigo Quilez](https://iquilezles.org/articles/warp/)
- **Rounded-box SDF** — Inset frame mask for Sunset. [Inigo Quilez](https://iquilezles.org/articles/distfunctions2d/)
- **Blackbody ramp** — Fire Ring palette (approximates Planckian locus). [Wikipedia](https://en.wikipedia.org/wiki/Planckian_locus)
- **Hue rotation** — Rodrigues' rotation formula. [Wikipedia](https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula)
- **Sobel operator** — 3x3 gradient kernels for Outline (Sobel & Feldman, 1968). [Wikipedia](https://en.wikipedia.org/wiki/Sobel_operator)
- **Luma** — Rec. 709 coefficients. [Wikipedia](https://en.wikipedia.org/wiki/Rec._709)
- **Random dithering** — 1/255 noise floor to break gradient banding. [Wikipedia](https://en.wikipedia.org/wiki/Dither)

## Technical Notes

| Item | Details |
| :--- | :--- |
| **Parameters** | Falloff knock `0.028`, noise reduction `0.77`, tilt exponent `0.7475`. |
| **Monstercat** | Refers to the visual style; implementation is CAVA's `monstercat_filter` (Karl Stavestrand, MIT). |
| **Custom Filters** | The **skirt**, **smooth**, and **gaussian** filters are custom QSpectrum implementations. |
