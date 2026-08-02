local wezterm = require 'wezterm'

local config = wezterm.config_builder()

-- Environment overlay: per-machine paths, kept out of this repo.
-- `pcall(dofile)` rather than `require` so a *syntax error* in the overlay
-- degrades too -- WezTerm silently falls back to its full defaults on any
-- config error and prints nothing, so an unguarded read would break
-- everything below invisibly. See environments/README.md.
local ok, overlay = pcall(dofile, wezterm.home_dir .. '/.config/lif-host.lua')
if not ok or type(overlay) ~= 'table' then overlay = {} end

-- "" is truthy in Lua, so an overlay that sets a key to the empty string rather
-- than omitting it would add a menu entry pointing at nowhere -- the exact harm
-- install/AGENTS.md tells the installing agent to avoid, reached by following
-- its advice to leave a value empty. Treat empty and absent as the same thing.
local function cwd_or_nil(v)
  if type(v) == 'string' and v ~= '' then return v end
end

local sd_cwd = cwd_or_nil(overlay.stable_diffusion_cwd)
local lif_node_cwd = cwd_or_nil(overlay.lif_node_cwd)
local playground_cwd = cwd_or_nil(overlay.playground_cwd)

-- Launch menu configuration. Entries whose overlay key is absent or empty are
-- skipped, so a host that has not defined one gets a smaller menu rather than
-- an entry pointing nowhere.
config.launch_menu = {}
local menu = config.launch_menu

if sd_cwd then
  table.insert(menu, {
    label = "Claude:Stable Diffusion",
    args = { 'claude', '--dangerously-skip-permissions' },
    cwd = sd_cwd,
  })
end
if lif_node_cwd then
  table.insert(menu, {
    label = "Claude:LIF Node",
    args = { 'claude', '--dangerously-skip-permissions' },
    cwd = lif_node_cwd,
  })
end
if playground_cwd then
  table.insert(menu, {
    label = "Claude: Playground",
    args = { 'claude', '--dangerously-skip-permissions' },
    cwd = playground_cwd,
  })
end
if sd_cwd then
  table.insert(menu, {
    label = "Codex:Stable Diffusion",
    args = { 'codex' },
    cwd = sd_cwd,
  })
end
if lif_node_cwd then
  table.insert(menu, {
    label = "Codex:LIF Node",
    args = { 'codex', '--cd', lif_node_cwd },
  })
  table.insert(menu, {
    label = "OpenCode: LIF Node",
    args = { 'opencode' },
    cwd = lif_node_cwd,
  })
end
if sd_cwd then
  table.insert(menu, {
    label = "OpenCode: Stable Diffusion",
    args = { 'opencode' },
    cwd = sd_cwd,
  })
end

-- Window appearance
config.initial_cols = 120
config.initial_rows = 28
-- The Nerd Font is a prerequisite this repo does not install; it must be
-- present on the machine WezTerm runs on (that is the Windows side when
-- WezTerm renders a WSL shell, and the Mac itself on macOS). Windows installs
-- it under the abbreviated family names "JetBrainsMono NF" / "NFM", which
-- WezTerm resolves from the canonical names via DirectWrite.
config.font = wezterm.font_with_fallback {
  'JetBrainsMono Nerd Font',
  'JetBrainsMono Nerd Font Mono',
}
-- Display-specific, so the environment may override it (a HiDPI Mac usually
-- wants more than 10).
config.font_size = overlay.font_size or 10
config.color_scheme = 'rose-pine-moon'
config.max_fps = 120

-- Tab bar
config.enable_tab_bar = true
config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = "TITLE | RESIZE"

-- Dim inactive panes. Note: with WezTerm's splits disabled in favour of
-- Herdr, WezTerm only ever has one pane, so this is inert unless those
-- bindings are restored. Kept so it works if they ever are.
config.inactive_pane_hsb = {
  saturation = 0.0,
  brightness = 0.5,
}

local is_windows = wezterm.target_triple:find('windows') ~= nil

if is_windows then
  config.win32_system_backdrop = "Acrylic"
  config.window_background_opacity = 0.7
  -- Must assign the whole table: config.window_frame is nil by default,
  -- so `config.window_frame.font_size = 10.0` indexes nil and throws --
  -- and WezTerm silently falls back to its defaults when a config throws.
  config.window_frame = { font_size = 5.0 }
end

-- Default shell. Forced only on Windows -- 'pwsh.exe' does not exist on WSL or
-- macOS, and WezTerm's own default there (the login shell) is what we want.
if is_windows then
  config.default_prog = { 'pwsh.exe', '-NoLogo' }
end

-- Keybindings
-- Herdr is the multiplexer here, so WezTerm's own pane splitting and pane
-- navigation are surrendered to it. Tab bindings are deliberately untouched,
-- as is WezTerm's built-in mux server (never enabled).
local disable = wezterm.action.DisableDefaultAssignment

config.keys = {
  { key = "Enter", mods = "SHIFT", action = wezterm.action.SendString("\x1b\r") },

  -- Pane splits. WezTerm registers each chord twice -- once in its shifted
  -- form and once unshifted -- so both spellings must be disabled or the
  -- binding survives. Verified against `wezterm show-keys`.
  { key = '"', mods = "ALT|CTRL",       action = disable },
  { key = "%", mods = "ALT|CTRL",       action = disable },
  { key = "'", mods = "SHIFT|ALT|CTRL", action = disable },
  { key = "5", mods = "SHIFT|ALT|CTRL", action = disable },
  { key = '"', mods = "SHIFT|ALT|CTRL", action = disable },
  { key = "%", mods = "SHIFT|ALT|CTRL", action = disable },

  -- Pane navigation: WezTerm ships no ActivatePaneDirection binding by
  -- default, so there is nothing to surrender here. Left as a note so this
  -- doesn't look like an oversight.
  --
  -- Deliberately NOT disabled (neither split nor navigation):
  --   SHIFT|ALT|CTRL + arrows -> AdjustPaneSize
  --   CTRL/SHIFT|CTRL + Z    -> TogglePaneZoomState
}

return config
