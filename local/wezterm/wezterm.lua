-- WezTerm config - https://wezterm.org/config/files.html
--
-- Shared by every environment. Machine-specific values come from the overlay
-- (~/.config/lif-host.lua); see environments/README.md. Reload is automatic on
-- save, but note that WezTerm falls back to its FULL defaults on any config
-- error and prints nothing, so a clean-looking launch proves nothing. Verify:
--   wezterm show-keys | grep -c Split    # 0 = loaded, 6 = defaults
--
-- Herdr is the multiplexer. WezTerm's own pane splitting is deliberately
-- surrendered to it, so nothing here re-binds a Split* action.

local wezterm = require 'wezterm'
local act = wezterm.action

local config = wezterm.config_builder()

-- --- Platform detection ---
-- target_triple is set by WezTerm itself, so this is reliable regardless of
-- shell environment (unlike os.getenv 'OS', which only exists on Windows).
local triple = wezterm.target_triple:lower()
local is_macos = triple:find 'darwin' ~= nil
local is_windows = triple:find 'windows' ~= nil

-- The primary modifier. macOS puts these on Command; everywhere else Command
-- is the OS's own key, so the same actions live on Ctrl+Shift. `mod2` is the
-- second tier (the "and also shift" variant), spelled out rather than built as
-- `mod .. '|SHIFT'` because that would yield an invalid 'CTRL|SHIFT|SHIFT'
-- off macOS.
local mod = is_macos and 'SUPER' or 'CTRL|SHIFT'
local mod2 = is_macos and 'SUPER|SHIFT' or 'CTRL|SHIFT|ALT'

-- --- Environment overlay: per-machine paths, kept out of this repo ---
-- `pcall(dofile)` rather than `require` so a *syntax error* in the overlay
-- degrades too -- an unguarded read would silently break everything below.
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

-- --- Launch menu ---
-- Entries whose overlay key is absent or empty are skipped, so a machine that
-- has not defined one gets a smaller menu rather than an entry pointing nowhere.
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

-- --- Font ---
-- The Nerd Font is a prerequisite this repo does not install; it must exist on
-- the machine WezTerm *renders* on (the Windows side when WezTerm drives a WSL
-- shell). Windows installs it under the abbreviated family names
-- "JetBrainsMono NF"/"NFM", which WezTerm resolves from the canonical names via
-- DirectWrite. The emoji fallback is named only on macOS, where that family
-- exists; elsewhere WezTerm picks its own, and naming a missing family would
-- only produce a startup warning.
local font_fallback = {
  'JetBrainsMono Nerd Font',
  'JetBrainsMono Nerd Font Mono',
}
if is_macos then
  table.insert(font_fallback, 'Apple Color Emoji')
end
config.font = wezterm.font_with_fallback(font_fallback)

-- Display-specific, so the environment owns it: a HiDPI Mac wants more than a
-- 1080p Windows box. The default matches windows-5090, whose hand-placed
-- overlay predates this key -- do not raise it without setting font_size in
-- every overlay.
config.font_size = overlay.font_size or 10
config.line_height = 1.10
config.harfbuzz_features = { 'calt=1', 'liga=1' }

-- --- Theme ---
-- Matches starship/starship.toml's catppuccin_mocha palette. Change both or
-- neither; the prompt's segment backgrounds are picked to sit on this one.
config.color_scheme = 'Catppuccin Mocha'

-- --- Rendering ---
-- Above the 60fps default so scrolling feels smooth on a high-refresh display.
-- Costs some GPU/battery; drop to 60 if that matters on a laptop.
config.max_fps = 120

-- --- Window ---
config.initial_cols = 120
config.initial_rows = 28
config.window_padding = { left = 12, right = 12, top = 10, bottom = 10 }
-- No titlebar anywhere: the mod+drag mouse binding at the bottom of this file
-- replaces it as the way to move the window.
config.window_decorations = 'RESIZE'
config.window_close_confirmation = 'NeverPrompt'
config.adjust_window_size_when_changing_font_size = false
config.scrollback_lines = 100000
config.mouse_wheel_scrolls_tabs = false
config.audible_bell = 'Disabled'

-- --- Tab bar ---
config.enable_tab_bar = true
config.use_fancy_tab_bar = true
config.hide_tab_bar_if_only_one_tab = true

-- Assign the whole table once. window_frame is nil by default, so an
-- unconditional `config.window_frame.font_size = x` would index nil and throw
-- -- and WezTerm silently falls back to its defaults when a config throws.
-- Assigning here first is what makes the Windows branch below safe.
config.window_frame = {
  font = wezterm.font('JetBrainsMono Nerd Font', { weight = 'Bold' }),
}

-- Dim inactive panes so the active split is obvious. With splitting surrendered
-- to Herdr, WezTerm only ever has one pane, so this is inert unless those
-- bindings are ever restored. Kept so it works if they are.
config.inactive_pane_hsb = {
  saturation = 0.9,
  brightness = 0.7,
}

-- --- Transparency ---
-- One dial to turn if the terminal feels too see-through or too solid. The
-- platform blur effects below need it under 1.0 to show at all.
config.window_background_opacity = 0.8

-- macOS gets its frosted effect from macos_window_background_blur; Windows 11
-- gets the equivalent from win32_system_backdrop = 'Acrylic'.
if is_macos then
  config.macos_window_background_blur = 20
end

if is_windows then
  config.win32_system_backdrop = 'Acrylic'
  config.window_background_opacity = 0.7
  config.window_frame.font_size = 5.0
end

-- --- macOS keys ---
-- Pass Option through as a real Alt so Herdr's Alt+letter bindings arrive.
if is_macos then
  config.send_composed_key_when_left_alt_is_pressed = false
  config.send_composed_key_when_right_alt_is_pressed = false
end

-- --- Cursor ---
config.default_cursor_style = 'BlinkingBar'
config.cursor_blink_rate = 500

-- --- Shell ---
-- Forced only on Windows: 'pwsh.exe' does not exist on macOS or WSL, and
-- WezTerm's own default there (the login shell) is what we want. No shell is
-- pinned to a multiplexer -- start Herdr on demand with the `tm` function, so
-- new windows and tabs do not all mirror one session.
if is_windows then
  config.default_prog = { 'pwsh.exe', '-NoLogo' }
end

-- --- Maximize toggle ---
-- There is no built-in maximize action, and window:get_dimensions() reports
-- fullscreen but not maximized state, so track it ourselves per window id.
-- This table resets on config reload, which just means the first press after a
-- reload may maximize an already-maximized window (harmless).
local maximized = {}

wezterm.on('toggle-maximize', function(window)
  local id = tostring(window:window_id())
  if maximized[id] then
    window:restore()
    maximized[id] = nil
  else
    window:maximize()
    maximized[id] = true
  end
end)

-- --- Keys ---
local disable = act.DisableDefaultAssignment

config.keys = {
  -- Newline without submitting, for agent CLIs.
  { key = 'Enter', mods = 'SHIFT', action = act.SendString '\x1b\r' },

  -- Surrender pane splitting to Herdr. WezTerm registers each chord twice --
  -- once in its shifted form and once unshifted -- so both spellings must be
  -- disabled or the binding survives. Verified against `wezterm show-keys`.
  { key = '"', mods = 'ALT|CTRL',       action = disable },
  { key = '%', mods = 'ALT|CTRL',       action = disable },
  { key = "'", mods = 'SHIFT|ALT|CTRL', action = disable },
  { key = '5', mods = 'SHIFT|ALT|CTRL', action = disable },
  { key = '"', mods = 'SHIFT|ALT|CTRL', action = disable },
  { key = '%', mods = 'SHIFT|ALT|CTRL', action = disable },

  -- Window and tab management stay with WezTerm; Herdr owns everything inside
  -- the single pane. Pane *navigation* is deliberately unbound for the same
  -- reason -- and WezTerm ships no ActivatePaneDirection default, so there is
  -- nothing to surrender there either.
  --
  -- Left bound by WezTerm on purpose (neither split nor navigation):
  --   SHIFT|ALT|CTRL + arrows -> AdjustPaneSize
  --   CTRL / SHIFT|CTRL + Z   -> TogglePaneZoomState
  { key = 'w', mods = mod,      action = act.CloseCurrentPane { confirm = false } },
  { key = 'w', mods = mod2,     action = act.CloseCurrentTab { confirm = false } },
  { key = 'k', mods = mod,      action = act.ClearScrollback 'ScrollbackAndViewport' },
  -- Maximize/restore. Option/Alt+Enter remains fullscreen (a WezTerm default).
  { key = 'Enter', mods = mod2, action = act.EmitEvent 'toggle-maximize' },
}

-- --- Mouse ---
-- window_decorations = 'RESIZE' removes the titlebar, so mod+drag anywhere in
-- the terminal body becomes the way to move the window.
config.mouse_bindings = {
  {
    event = { Down = { streak = 1, button = 'Left' } },
    mods = mod,
    action = act.StartWindowDrag,
  },
}

return config
