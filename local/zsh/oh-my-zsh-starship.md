# Oh My Zsh and Starship compatibility

## Conclusion

They can be used together; they are not mutually exclusive. Oh My Zsh manages zsh configuration and plugins, including optional prompt themes. Starship supplies a shell prompt. Use Starship instead of an Oh My Zsh theme, not instead of the whole framework.

## Primary-source findings

- [Oh My Zsh's README](https://github.com/ohmyzsh/ohmyzsh/blob/master/README.md) describes it as a framework for managing zsh configuration, with plugins and themes. Its Themes section explicitly says themes control the prompt.
- [Oh My Zsh's initialization source](https://github.com/ohmyzsh/ohmyzsh/blob/master/oh-my-zsh.sh) loads libraries, plugins and custom configuration independently of theme loading. The theme-loading block is guarded by `if [[ -n "$ZSH_THEME" ]]`; `ZSH_THEME=""` disables that block without disabling the framework.
- [Starship's installation instructions](https://github.com/starship/starship/blob/master/README.md#step-2-set-up-your-shell-to-use-starship) describe Starship as a cross-shell prompt and tell zsh users to place `eval "$(starship init zsh)"` at the end of `~/.zshrc`.
- [Oh My Zsh's installation instructions](https://github.com/ohmyzsh/ohmyzsh/blob/master/README.md#basic-installation) warn that an existing `.zshrc` is renamed to `.zshrc.pre-oh-my-zsh` and preserved settings must be moved into the new file. Missing custom functions after installation are therefore not evidence of a Starship conflict.

## Recommended integration

Derived from the initialization code and installation instructions above:

```zsh
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""
plugins=(git)
source "$ZSH/oh-my-zsh.sh"

# Load after Oh My Zsh; this profile already initializes Starship.
[ -r "$HOME/.config/lif-shell.zsh" ] && . "$HOME/.config/lif-shell.zsh"
```

Do not add a second Starship initialization: [`profile.zsh`](profile.zsh) already owns it, alongside the CLI functions and autosuggestions. Avoid loading another prompt theme afterward.

## Local verification

After restoring the profile source line, a fresh `zsh -ic` session reported:

- `ZSH_THEME` empty (Oh My Zsh theme disabled).
- Both Oh My Zsh hooks and `prompt_starship_precmd` in `precmd_functions`.
- `cc` and `pi` present as shell functions.

This verifies startup integration, not visual rendering in an interactive terminal. The immediate breakage was the installer's replacement of `.zshrc`, which removed the profile source line.
