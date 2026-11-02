# Designing a roster promo

Pick one option per slot, fit it to the BGM, and check it against the ledger. The menus are starting points:
inventing a new opening or transition beats reusing one.

## Fixed rules (the user's, November 2026)

- ≤15.0 s, vertical 1080x1920. Frame 0 already shows faces. The drop lands by 2.0 s.
- The opening shows every card's avatar within about 2 s, so viewers see the whole roster before the drop.
- Then each card's full-body art, cut on the beat.
- Visuals and 卡点 only: no question, hook or call-to-action copy (no 你选几号, 评论区, "7套配色").
  Numerals (01–07), names and a small collection caption are graphic elements and may stay.
- The ending regroups the cards into the opening's layout, so the last frame flows into frame 0. The audio end is the
  bar before the cut start (`cutmusic.py --loop`), so the replay is seamless.
- Premium promotional design with 手书 texture: the character on twos with line boil, line art turning to colour on
  a hit, hand-lettered names, marker doodles; type and graphics move smoothly at 30 fps with easeOutExpo.

## Fit the BGM

Build the timeline from the music's sections, in beats.

| Music event | Use it for |
|---|---|
| Build / near-silence before the drop | the roster opening; line art of card 01 in the last 8th |
| Drop downbeat | the biggest hit: card 01 pulled out of the opening, 1–2 impact frames (invert), zoom punch |
| Kick (beats 1, 3) | cuts and zoom punches |
| Clap / snare (beats 2, 4) | secondary hit: shake, a doodle, a type pop |
| 8ths / 16ths (hats, cowbell) | avatar flicks in the opening, staggered slides, boil steps |
| Riser or reverse cymbal | whip pan or push-through into the next card |
| Break, half-time bar, stop | the hero card's hold, or the ending regroup |
| Vocal chop | a name or numeral slam |

Card length: about 1 s rounded to the beat grid (2 beats at 110–140 BPM, 1 beat above 150, 1 bar below 80);
the hero card (usually the last, or the user's favourite) gets double. Keep cuts on bar or half-bar boundaries
so they follow the phrase. A track with no clear drop: make the opening's last move the hit on the first strong
downbeat. A slow or sparse track: fewer, longer cards with slow pushes; save flashes for the few real hits.

## Menus

**Openings** (all 7 avatars within ~2 s, frame 0 shows faces):

| Opening | Built | Notes |
|---|---|---|
| Parallax film strips | `examples/strip.py` | three tilted strips, opposite directions, glide then hard stop on 8ths |
| Poker hand | `examples/hand.py` | cards slide up on staggered 16ths, fan, flick one per 8th; one is pulled on the drop |
| 3D carousel ring | `examples/ring.py` | ring snaps one step per 8th with spin blur; back cards are illegible on phones |
| Polaroid scatter | untried | photos drop onto a desk on 16ths with a shutter tick each, slight rotations |
| Slot-machine reels | untried | three reels spin and lock face by face on 8ths |
| Split columns | untried | screen cut into 7 vertical slices, each a face, sliding at different speeds |
| Magazine grid | untried | tiles assemble a cover layout, masthead last, the cover becomes card 01 |
| Kaleidoscope tiles | untried | mirrored face tiles rotating on beats, collapsing to one face on the drop |

**Transitions between cards** (each lands its cut on the beat):

| Transition | Built (`trans()`) | Watch for |
|---|---|---|
| Whip pan | `whip` | stretch the colour image; a grey blur reads as a glitch |
| Diagonal blades | `blades` | one all-black frame slipped through in the Daki run |
| Iris through the eye | `iris` | needs the eye point per card |
| Key-colour slab carrying the numeral | `block` | |
| Push-through a detail | `push` | push into a coloured area; white shirts wash out |
| Smear frames | `smear` | 2–3 frames of directional stretch of the actual image |
| Character-silhouette wipe | untried | the next card revealed through the current card's mask |
| Glitch slices | untried | horizontal bands offset for 2–3 frames |
| Ink splash mask | untried | a boiling marker blot grows to fill the frame |
| Light leak burn | untried | warm leak whites out only the edges, never the face |

**Card framings** (alternate close and wide; never two of the same scale in a row): face, chin and hands, outfit
detail (print, accessory), hair in motion, shoes, three-quarter body, full body.

**Type systems**: huge numeral behind the character, cut by its mask (check it stays readable beside the legs);
editorial bottom slab with numeral, brush name and English name; vertical CJK column; numeral row as the opening's
header. One system per video.

**Card colour**: each card's key colour comes from its outfit. Avoid white flash frames on pale art: they wash the
whole screen to white. Use the key colour or an inverted frame for impact instead.

## Anti-repetition rules

1. The opening differs from the last three ledger entries.
2. The transition order differs from the last entry, and no transition appears twice in a row.
3. At least four different transition kinds per video.
4. The type system or the palette treatment differs from the last entry.
5. Every card's reveal differs from its neighbours' (line art→colour, mask wipe, impact frame, plain hard cut).
6. The hero card gets a treatment no other card has (a full bar, a stop, a different framing scale).

## Douyin notes

- 2-second bounce: the account's average 2 s bounce rate was 47 % in the 2026-11-03 works snapshot, so the first
  second carries the video: faces, motion and a hit before 2 s.
- Replays count (抖音's stated targets include 重复观看), which is why the loop matters.
- Cut to the exact sound that will be posted. A trending sound swapped in on Douyin afterwards loses the sync, so
  get a copy of that sound for timing first.
