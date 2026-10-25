# linux-5090

`plasmoids/local.temps/` is a KDE Plasma 6 panel widget showing CPU, GPU and
coolant temperatures with monochrome icons. Its sensor ids are this machine's
own (`nct6687` board chip, the RTX 5090 as `gpu/gpu1`, the NZXT Kraken Elite),
which is why it lives here. Find new ids with `kstatsviewer --list` if the
hardware changes.

Install by linking it into Plasma's widget folder, then restart the shell and
add "Temps" to a panel:

```sh
ln -sfn "$PWD/plasmoids/local.temps" ~/.local/share/plasma/plasmoids/local.temps
systemctl --user restart plasma-plasmashell
```
