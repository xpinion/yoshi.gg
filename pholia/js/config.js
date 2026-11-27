// ============================================================
//  PHOLIA'S MISSION — TWEAKABLE SETTINGS
//  Change numbers here to adjust how the game feels.
//  (Speeds are in pixels per second. One tile = 32 pixels.)
// ============================================================
window.PM = window.PM || {};

PM.CONFIG = {
  // --- Screen ---
  WIDTH: 960,
  HEIGHT: 540,
  TILE: 32,

  // --- Pholia movement ---
  RUN_SPEED: 230,
  RUN_ACCEL: 2200,          // how fast she gets up to speed
  AIR_ACCEL: 1600,
  FRICTION: 2600,           // how fast she stops on the ground
  GRAVITY: 2000,
  MAX_FALL: 900,
  JUMP_VELOCITY: 730,       // higher = jumps higher (~4 tiles by default)
  JUMP_CUT: 0.45,           // releasing jump early cuts the jump to this fraction
  COYOTE_TIME: 0.09,        // seconds you can still jump after running off a ledge
  JUMP_BUFFER: 0.12,        // seconds a jump press is remembered before landing
  DUCK_SPEED: 90,

  SWIM_STROKE: 330,         // upward push per jump press while swimming
  SWIM_MAX_FALL: 150,
  AUTORUN_FLEA_SPEED: 185,  // how fast the Giant Flea chases in auto-run levels

  DASH_SPEED: 560,
  DASH_TIME: 0.17,
  DASH_COOLDOWN: 0.55,

  ATTACK_TIME: 0.22,
  ATTACK_COOLDOWN: 0.32,
  ATTACK_RANGE: 34,
  POUNCE_BOUNCE: 520,       // bounce after landing on an enemy

  THROW_MIN: 300,           // throw speed with no charge
  THROW_MAX: 760,           // throw speed fully charged
  THROW_CHARGE_TIME: 0.8,

  // --- Health & lives ---
  START_HEARTS: 6,
  START_LIVES: 9,
  MAX_LIVES: 9,
  HURT_INVULN: 1.2,         // seconds of blinking after getting hit
  SLUDGE_DAMAGE: 1,         // hearts lost when touching sewer sludge
  SPIKE_DAMAGE: 1,

  // --- Power-ups ---
  POWERUP_DURATION: 20,     // seconds
  DROP_CHANCE: 0.25,        // chance a small enemy drops a power-up
  DROP_TABLE: { feather: 0.35, spring: 0.35, puff: 0.30 },
  FEATHER_SPEED_MULT: 1.85,
  PUFF_BLAST_RADIUS: 80,

  // --- Damage by biome (hearts). Index 0 = sewer ... 4 = tunnels ---
  ENEMY_DAMAGE: [0.5, 1, 1, 1.5, 1.5],
  BOSS_DAMAGE: [1, 1.5, 2, 2.5, 3],

  // --- Shop prices (coins) ---
  PRICES: { fish: 15, bigfish: 40, feather: 25, spring: 25, puff: 20, hat: 60 },

  // --- Sound ---
  MUSIC_VOLUME: 0.5,
  SFX_VOLUME: 0.6,

  // --- Debug ---
  SHOW_HITBOXES: false,
};
