local wezterm = require 'wezterm'

local config = wezterm.config_builder()

-- Paths for launch menu entries
local comfyui_bat_path = "C:\\Apps\\ComfyUI-Portable\\run_nvidia_gpu.bat"
local comfyui_v2_bat_path = "C:\\Apps\\ComfyUI-Portable-V2\\ComfyUI-Easy-Install\\run_nvidia_gpu.bat"
local comfyui_cwd = "C:\\Apps\\ComfyUI-Portable"
local comfyui_remote_script = "d:\\share\\Scripts\\ComfyUI-RemoteStart.ps1"
local comfyui_remote_stop_script = "d:\\share\\Scripts\\ComfyUI-RemoteStop.ps1"
local claude_cwd = "D:\\Git\\stable-diffusion"
local claude_cwd_lif = "D:\\share\\ComfyuiPersonalNodes\\comfyui-lif-nodes"

-- Launch menu configuration
config.launch_menu = {
  {
    label = "Claude:Stable Diffusion",
    args = { 'claude', '--dangerously-skip-permissions' },
    cwd = claude_cwd,
  },
  {
    label = "Claude:LIF Node",
    args = { 'claude', '--dangerously-skip-permissions' },
    cwd = claude_cwd_lif,
  },
  {
    label = "Claude: Playground",
    args = { 'claude', '--dangerously-skip-permissions' },
    cwd = 'D:\\Git\\playground',
  },
  {
    label = "Codex:Stable Diffusion",
    args = { 'codex' },
    cwd = claude_cwd,
  },
  {
    label = "Codex:LIF Node",
    args = { 'codex', '--cd', claude_cwd_lif },
  },  
  {
    label = "OpenCode: LIF Node",
    args = { 'opencode' },
    cwd = claude_cwd_lif,
  },
  {
    label = "OpenCode: Stable Diffusion",
    args = { 'opencode' },
    cwd = claude_cwd,
  },
}

-- Window appearance
config.initial_cols = 120
config.initial_rows = 28
-- Nerd Font is installed Windows-side; WezTerm renders from the host.
-- Installed under the abbreviated family names "JetBrainsMono NF" / "NFM",
-- which WezTerm resolves from the canonical names via DirectWrite.
config.font = wezterm.font_with_fallback {
  'JetBrainsMono Nerd Font',
  'JetBrainsMono Nerd Font Mono',
}
config.font_size = 10
config.color_scheme = 'rose-pine-moon'
config.max_fps = 120

-- Tab bar
config.enable_tab_bar = true
config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = "TITLE | RESIZE"

-- Dim inactive panes. Note: with WezTerm's splits disabled in favour of
-- Zellij, WezTerm only ever has one pane, so this is inert unless those
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

-- Default shell
config.default_prog = { 'pwsh.exe', '-NoLogo' }

-- Keybindings
-- Zellij is the multiplexer here, so WezTerm's own pane splitting and pane
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