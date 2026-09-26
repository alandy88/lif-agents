# HIG check areas

Every audit walks all areas. The slugs are the pages to fetch with `scripts/hig.py`; the
numbers are cached from those pages and the page wins if they disagree.

## Accessibility — `accessibility`, `voiceover`

- Control size, default / minimum: iOS & iPadOS 44×44 / 28×28 pt; macOS 28×28 / 20×20;
  tvOS 66×66 / 56×56; visionOS 60×60 / 28×28; watchOS 44×44 / 28×28.
- Contrast (WCAG AA): 4.5:1 for text up to 17 pt; 3:1 for 18 pt and up, or bold.
  Check light and dark appearance, and Increase Contrast.
- Text scales to 200% (watchOS 140%) through Dynamic Type or equivalent; layout survives it.
- Information never rides on colour alone; every control has an accessibility label;
  Reduce Motion and Reduce Transparency are honoured.

## Typography — `typography`

- Body text default / minimum: iOS & iPadOS 17 / 11 pt; macOS 13 / 10; tvOS 29 / 23;
  visionOS 17 / 12; watchOS 16 / 12.
- Hierarchy through the system text styles, not ad-hoc sizes; thin weights go larger.

## Colour and appearance — `color`, `dark-mode`, `materials`

- System and semantic colours over hard-coded values; an accent colour used consistently.
- Dark Mode supported and checked, not inverted.
- Liquid Glass belongs to the control and navigation layer floating above content, never
  to the content layer; used sparingly on custom controls.

## Layout — `layout`, `right-to-left`

- Most important content top and leading; controls distinct from content.
- Respects safe areas and adapts to size classes, orientation, and window resizing.
- No more than three icon buttons or two text buttons side by side.
- Leading/trailing, not left/right, so right-to-left languages mirror.

## Navigation — `navigation-and-search`, `tab-bars`, `sidebars`, `toolbars`

- The platform's navigation model: tab bar for top-level sections on iPhone, sidebar on
  iPad and Mac; no overflow tabs; tabs navigate, they do not act.
- People always know where they are and how to go back.

## Controls — `buttons`, `menus-and-actions`, `selection-and-input`

- One prominent button for the most likely action; style, not size, marks the preferred
  choice; destructive actions use the destructive role.
- Custom buttons have a press state; icons are familiar (SF Symbols) or labelled.

## Presentation and feedback — `modality`, `alerts`, `sheets`, `feedback`, `loading`

- Modality only for focused, short tasks, always with an obvious way out.
- Alerts are rare and name the action on their buttons.
- Every action gets visible feedback; long work shows progress; empty, loading, and error
  states are designed.

## Content and writing — `writing`, `entering-data`, `undo-and-redo`

- Labels are short, specific, and consistent in capitalisation.
- Inputs use the right keyboard and content types, validate inline, and keep entered data.
- Mistakes are recoverable: undo, or confirmation before anything destructive.

## Trust — `privacy`, `onboarding`, `launching`

- Permissions are requested in context, with the reason, only when needed.
- Onboarding is short and skippable; launch goes straight to content.
