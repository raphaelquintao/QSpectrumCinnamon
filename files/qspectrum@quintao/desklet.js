/*
 * Copyright (c) 2026 - Raphael Quintao <raphaelquintao@gmail.com>
 * https://github.com/raphaelquintao/qspectrumcinnamon
 * SPDX-License-Identifier: Apache-2.0
 */

const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const QUtils = require('js/QUtils.js');
const {QAudioBands} = require('js/QAudioBands.js');
const {QRingVisualizer} = require('js/QRingVisualizer.js');
const {QBarsVisualizer} = require('js/QBarsVisualizer.js');
const {QAdvancedVisualizer} = require('js/QAdvancedVisualizer.js');

const {_, qLOG} = QUtils;


global.QDEBUG = true;


const SETTINGS_KEYS = [
  'style',
  'scroll_resize',
  'noise_reduction',
  'smooth_filter',
  'smooth_amount',
  'autosens',
  'sensitivity',
  'threshold',
  'max_fps',
  'source',
  'background_enabled',
  'background_color',
  'border_color',
  'theme',
  'color_from',
  'color_to',
  'cap_color',
  'accent_color',
  'glow_enabled',
  'glow_strength',
  'glow_radius',
  'glow_core',
  'shade',
  'shade_intensity',
  'shade_speed',
  'ring_size',
  'ring_substyle',
  'ring_inner_radius',
  'ring_inner_width',
  'ring_bar_fill',
  'ring_min_length',
  'ring_rotation',
  'ring_rotation_react',
  'ring_rotation_spectral',
  'ring_bars',
  'ring_mirror',
  'bars_width',
  'bars_substyle',
  'bars_fill',
  'bars_line_width',
  'bars_min_length',
  'bars_count',
  'bars_mirror',
  'cap_enabled',
  'cap_size',
  'cap_fall',
  'cap_fall_animation',
  'advanced_preset',
  'advanced_size',
  'advanced_intensity',
  'advanced_speed'
];

const THEME_PRESETS = {
  neon:   {
    color_from:   'rgba(204,40,149,0.8)',
    color_to:     'rgba(255,185,25,0.8)',
    cap_color:    'rgba(153, 204, 202, 0.5)',
    accent_color: 'rgba(255,180,120,0.5)'
  },
  mono:   {
    color_from:   'rgba(120,120,130,0.8)',
    color_to:     'rgba(235,235,240,0.8)',
    cap_color:    'rgba(255,255,255,0.3)',
    accent_color: 'rgba(255,255,255,0.3)'
  },
  sunset: {
    color_from:   'rgba(150,40,200,0.8)',
    color_to:     'rgba(255,120,40,0.8)',
    cap_color:    'rgba(255,220,180,0.5)',
    accent_color: 'rgba(99, 69, 44, 0.8)'
  },
  matrix: {
    color_from:   'rgba(6,70,42,0.8)',
    color_to:     'rgba(31,255,70,0.8)',
    cap_color:    'rgba(150,255,180,0.5)',
    accent_color: 'rgba(31,127,70,0.8)'
  },
  vaporwave: {
    color_from:   'rgba(255,60,180,0.8)',
    color_to:     'rgba(80,220,255,0.8)',
    cap_color:    'rgba(235,195,255,0.5)',
    accent_color: 'rgba(255,140,220,0.5)'
  },
  cyberpunk: {
    color_from:   'rgba(0,240,255,0.8)',
    color_to:     'rgba(252,238,10,0.8)',
    cap_color:    'rgba(255,60,120,0.5)',
    accent_color: 'rgba(252,238,10,0.5)'
  },
  tron: {
    color_from:   'rgba(0,150,255,0.8)',
    color_to:     'rgba(120,255,255,0.8)',
    cap_color:    'rgba(255,255,255,0.5)',
    accent_color: 'rgba(0,220,255,0.5)'
  }
};

// Canvas size setting per style, stepped by scroll-to-resize. The bounds mirror
// the spinbutton ranges in settings-schema.json.
const SIZE_SETTINGS = {
  ring:     {key: 'ring_size',     min: 100, max: 1000, step: 10},
  bars:     {key: 'bars_width',    min: 100, max: 2000, step: 10},
  advanced: {key: 'advanced_size', min: 100, max: 1200, step: 10}
};

class SoundBarsDesklet extends Desklet.Desklet {
  
  constructor(metadata, desklet_id) {
    super(metadata, desklet_id);
    
    this.metadata = metadata;
    this._renderer = null;
    this._audio = null;
    this._enabled = true;
    this._position_save_id = 0;
    this._position_signal_ids = [];
    
    this.setHeader(metadata.name);
    
    this.settings = new Settings.DeskletSettings(this, metadata.uuid, desklet_id);
    for (const key of SETTINGS_KEYS) {
      // Re-read this[key] rather than trusting callback arg order.
      this.settings.bind(key, key, () => this._on_setting_changed(key));
    }
    
    // Persist the desklet's own position (in the hidden "position" setting),
    // independent of Cinnamon's per-instance-id bookkeeping (a reload can
    // assign a fresh id, and thus a default spot, otherwise forgetting where
    // the user put it).
    this._position_signal_ids = [
      this.actor.connect('notify::x', () => this._schedule_position_save()),
      this.actor.connect('notify::y', () => this._schedule_position_save())
    ];
    
    // Scroll over the desklet to step the active style's canvas size.
    this._scroll_accum = 0;
    this._scroll_id = this.actor.connect('scroll-event', (a, e) => this._on_scroll_event(a, e));
    
    this._build_renderer();
    this._build_audio();
    this._build_menu();
    this._update_decoration();
  }
  
  // ---- options -----------------------------------------------------------
  
  _shared_opts() {
    return {
      max_fps:            this.max_fps,
      noise_reduction:    this.noise_reduction,
      smooth_filter:      this.smooth_filter,
      smooth_amount:      this.smooth_amount,
      autosens:           this.autosens,
      sensitivity:        this.sensitivity,
      glow:               this.glow_enabled,
      glow_strength:      this.glow_strength,
      glow_radius:        this.glow_radius,
      glow_core:          this.glow_core,
      shade:              this.shade,
      shade_intensity:    this.shade_intensity,
      shade_speed:        this.shade_speed,
      caps:               this.cap_enabled,
      cap_size:           this.cap_size,
      cap_fall:           this.cap_fall,
      cap_fall_animation: this.cap_fall_animation,
    };
  }
  
  _theme_colors() {
    if (this.theme && this.theme !== 'user' && THEME_PRESETS[this.theme]) {
      return THEME_PRESETS[this.theme];
    }
    return {
      color_from:   this.color_from,
      color_to:     this.color_to,
      cap_color:    this.cap_color,
      accent_color: this.accent_color
    };
  }
  
  _ring_opts() {
    const t = this._theme_colors();
    return Object.assign(this._shared_opts(), t, {
      size:              this.ring_size,
      bars:              this.ring_bars,
      substyle:          this.ring_substyle,
      ring_radius:       this.ring_inner_radius,
      ring_width:        this.ring_inner_width,
      bar_fill:          this.ring_bar_fill,
      min_length:        this.ring_min_length,
      rotation_speed:    this.ring_rotation,
      rotation_react:    this.ring_rotation_react,
      rotation_spectral: this.ring_rotation_spectral
    });
  }
  
  _bars_opts() {
    const t = this._theme_colors();
    return Object.assign(this._shared_opts(), t, {
      width:      this.bars_width,
      bars:       this.bars_count,
      substyle:   this.bars_substyle,
      bar_fill:   this.bars_fill,
      min_length: this.bars_min_length,
      line_width: this.bars_line_width,
      mirror:     this.bars_mirror
    });
  }
  
  _active_opts() {
    if (this.style === 'bars') return this._bars_opts();
    if (this.style === 'advanced') return this._advanced_opts();
    return this._ring_opts();
  }
  
  // Advanced style: a GPU-only shader preset. It has its own intensity and
  // animation-speed controls (independent of the Shades section) and reuses
  // the shared audio/motion settings plus the theme colors; the spectrum
  // resolution follows bars_count.
  _advanced_opts() {
    const t = this._theme_colors();
    const dir = (this.metadata && this.metadata.path)
      ? this.metadata.path + '/shaders'
      : '';
    return Object.assign(this._shared_opts(), t, {
      preset:     this.advanced_preset,
      size:       this.advanced_size,
      intensity:  this.advanced_intensity,
      speed:      this.advanced_speed,
      frame:      this.background_enabled ? 1 : 0,
      bars:       this.bars_count,
      shader_dir: dir
    });
  }
  
  _active_count() {
    if (this.style === 'advanced') return this.bars_count;
    return this.style === 'bars' ? this.bars_count : this.ring_bars;
  }
  
  _active_fold() {
    if (this.style === 'advanced') return 'none';
    if (this.style === 'bars') return 'half-centre';
    return this.ring_mirror ? 'quad' : 'none';
  }
  
  // ---- build -------------------------------------------------------------
  
  _build_renderer() {
    if (this._renderer) {
      this._renderer.destroy();
      this._renderer = null;
    }
    const opts = this._active_opts();
    if (this.style === 'bars') this._renderer = new QBarsVisualizer(opts);
    else if (this.style === 'advanced') this._renderer = new QAdvancedVisualizer(opts);
    else this._renderer = new QRingVisualizer(opts);
    this.setContent(this._renderer.actor);
    this._renderer.start();
  }
  
  _build_audio() {
    if (this._audio) {
      this._audio.stop();
      this._audio = null;
    }
    this._audio = new QAudioBands({
      display_bars: this._active_count(),
      threshold:    this.threshold,
      source:       this.source,
      fold:         this._active_fold(),
      interval_ms:  Math.max(10, Math.round(1000 / this.max_fps))
    });
    this._audio.connect('bands', (a, amps, centroid) => {
      if (this._enabled && this._renderer) {
        this._renderer.set_bands(amps);
        this._renderer.set_centroid(centroid);
      }
    });
    this._audio.connect('error', (a, msg) => qLOG.e('QSpectrum audio', msg));
    this._audio.start();
  }
  
  _on_setting_changed(key) {
    if (key === 'style') {
      this._build_renderer();
      this._build_audio();
      return;
    }
    
    // shared audio settings
    if (key === 'threshold' || key === 'source' || key === 'max_fps') {
      this._build_audio();
      if (this._renderer) this._renderer.set_options(this._active_opts());
      return;
    }
    
    // appearance: desklet background / border
    if (['background_enabled', 'background_color', 'border_color'].includes(key)) {
      this._update_decoration();
      // Full-frame presets (e.g. Sunset) inset themselves so the frame shows.
      if (this._renderer) this._renderer.set_options(this._active_opts());
      return;
    }
    
    // shared theme colors (used by both visualizer styles)
    if (['theme', 'color_from', 'color_to', 'cap_color', 'accent_color'].includes(key)) {
      if (this._renderer) this._renderer.set_options(this._active_opts());
      return;
    }
    
    if (key.startsWith('advanced_')) {
      if (this.style !== 'advanced') return;   // inactive style
      if (key === 'advanced_size') {
        // Resize the existing renderer in place (no rebuild) so scrolling
        // resizes the desklet in realtime.
        if (this._renderer) this._renderer.set_options(this._active_opts());
        return;
      }
      if (key === 'advanced_preset') {
        if (this._renderer && this._renderer.set_preset) {
          this._renderer.set_preset(this.advanced_preset);
        }
        return;
      }
      if (this._renderer) this._renderer.set_options(this._active_opts());
      return;
    }
    
    if (key.startsWith('ring_')) {
      if (this.style !== 'ring') return;   // inactive style
      if (key === 'ring_size') {
        // Resize the existing renderer in place (no rebuild) so scrolling
        // resizes the desklet in realtime.
        if (this._renderer) this._renderer.set_options(this._active_opts());
        return;
      }
      if (key === 'ring_bars') {
        this._build_audio();
        this._build_renderer();
        return;
      }
      if (key === 'ring_mirror') {
        this._build_audio();
        return;
      }
      if (this._renderer) this._renderer.set_options(this._active_opts());
      return;
    }
    
    if (key.startsWith('bars_')) {
      if (this.style === 'advanced') {
        // Advanced mode uses bars_count as its spectrum resolution.
        if (key === 'bars_count') {
          this._build_audio();
          this._build_renderer();
        }
        return;
      }
      if (this.style !== 'bars') return;   // inactive style
      if (key === 'bars_width' || key === 'bars_mirror') {
        // Resize the existing renderer in place (no rebuild) so scrolling
        // resizes the desklet in realtime.
        if (this._renderer) this._renderer.set_options(this._active_opts());
        return;
      }
      if (key === 'bars_count') {
        this._build_audio();
        this._build_renderer();
        return;
      }
      if (this._renderer) this._renderer.set_options(this._active_opts());
      return;
    }
    
    // shared motion / other visual settings
    if (this._renderer) this._renderer.set_options(this._active_opts());
  }
  
  // Take over the desklet frame: Cinnamon's own background/border is removed so
  // the visualizer sits on a transparent canvas unless the user enables a
  // custom background, in which case we draw it ourselves.
  _update_decoration() {
    if (!this._header || !this.content) return;
    
    const dec = global.settings.get_int('desklet-decorations');
    const prevent = this.metadata['prevent-decorations'];
    const with_header = !prevent && dec === 2;
    const enabled = this.background_enabled === true;
    
    // Header only when the user is not taking over the frame.
    if (with_header && !enabled) this._header.show();
    else this._header.hide();
    
    // Always drop the theme background/border; we own the content styling.
    this.content.style_class = '';
    if (enabled) {
      const bg = this.background_color || 'rgba(0,0,0,0.35)';
      const bd = this.border_color || 'rgba(255,255,255,0.15)';
      this.content.set_style(`background-color: ${bg}; border: 1px solid ${bd}; border-radius: 4px;`);
    } else {
      this.content.set_style('');
    }
  }
  
  // ---- menu / lifecycle --------------------------------------------------
  
  _build_menu() {
    this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this._menu.addAction('Enabled', () => this._toggle_enabled());
    this._menu.addAction('Reload', () => this._reload());
  }
  
  _toggle_enabled() {
    this._enabled = !this._enabled;
    if (this._enabled) {
      this._audio.start();
      this._renderer.start();
    } else {
      this._audio.stop();
      if (this._renderer) {
        this._renderer.set_bands(new Array(this._active_count()).fill(0));
      }
    }
  }
  
  _reload() {
    const cmd = 'dbus-send --session --dest=org.Cinnamon.LookingGlass --type=method_call'
      + ' /org/Cinnamon/LookingGlass org.Cinnamon.LookingGlass.ReloadExtension'
      + ` string:'${this.metadata.uuid}' string:'DESKLET'`;
    Util.spawnCommandLine(cmd);
  }
  
  // ---- scroll to resize ---------------------------------------------------
  
  // Mouse wheel (or two-finger scroll) over the desklet steps the active
  // style's canvas size setting and applies it immediately.
  _on_scroll_event(actor, event) {
    if (!this.scroll_resize) return Clutter.EVENT_PROPAGATE;
    
    const dir = event.get_scroll_direction();
    let steps = 0;
    if (dir === Clutter.ScrollDirection.UP) {
      steps = 1;
    } else if (dir === Clutter.ScrollDirection.DOWN) {
      steps = -1;
    } else if (dir === Clutter.ScrollDirection.SMOOTH) {
      // Touchpads send many small deltas; accumulate them into whole steps.
      const delta = event.get_scroll_delta();
      this._scroll_accum += delta[1];
      if (this._scroll_accum <= -1.0) {
        steps = 1;
        this._scroll_accum += 1.0;
      } else if (this._scroll_accum >= 1.0) {
        steps = -1;
        this._scroll_accum -= 1.0;
      }
    } else {
      return Clutter.EVENT_PROPAGATE;   // horizontal scrolling is not ours
    }
    if (steps === 0) return Clutter.EVENT_STOP;
    
    const spec = SIZE_SETTINGS[this.style] || SIZE_SETTINGS.ring;
    const current = this[spec.key];
    const next = Math.min(spec.max, Math.max(spec.min, current + steps * spec.step));
    if (next !== current) {
      this.settings.setValue(spec.key, next);
      // Settings.setValue() only writes the value; unlike a change made on the
      // settings page (which arrives over DBus) it does not fire the binding
      // callback, so apply the change ourselves.
      this._on_setting_changed(spec.key);
    }
    return Clutter.EVENT_STOP;
    
  }
  
  // ---- position persistence ---------------------------------------------
  
  _read_position() {
    try {
      const pos = this.settings.getValue('position');
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
    } catch (e) { /* no saved position yet */ }
    return null;
  }
  
  _write_position() {
    if (!this.actor || !this.settings) return;
    try {
      this.settings.setValue('position', {x: this.actor.get_x(), y: this.actor.get_y()});
    } catch (e) {
      qLOG.e('QSpectrum position save failed', `${e}`);
    }
  }
  
  _schedule_position_save() {
    if (this._position_save_id) return;
    this._position_save_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
      this._position_save_id = 0;
      this._write_position();
      return false;
    });
  }
  
  on_desklet_added_to_desktop() {
    const pos = this._read_position();
    if (pos) this.actor.set_position(pos.x, pos.y);
  }
  
  on_desklet_removed() {
    if (this._position_save_id) {
      GLib.source_remove(this._position_save_id);
      this._position_save_id = 0;
    }
    for (const id of this._position_signal_ids) {
      try { this.actor.disconnect(id); } catch (e) { /* gone */ }
    }
    this._position_signal_ids = [];
    if (this._scroll_id) {
      try { this.actor.disconnect(this._scroll_id); } catch (e) { /* gone */ }
      this._scroll_id = 0;
    }
    if (this._audio) {
      this._audio.stop();
      this._audio = null;
    }
    if (this._renderer) {
      this._renderer.destroy();
      this._renderer = null;
    }
    if (this.settings) {
      // On reload Cinnamon builds the new instance before the outgoing one is
      // torn down (removal is deferred behind the desklet fade), so only
      // unregister when we are still the settings object the manager holds.
      const manager = Main.settingsManager;
      const active = manager.uuids[this.settings.uuid]
        && manager.uuids[this.settings.uuid][this.settings.instanceId] === this.settings;
      if (active) {
        try { this.settings.finalize(); } catch (e) { /* gone */ }
      }
      this.settings = null;
    }
  }
}

function main(metadata, desklet_id) {
  return new SoundBarsDesklet(metadata, desklet_id);
}
