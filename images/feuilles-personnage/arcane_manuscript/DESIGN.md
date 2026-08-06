---
name: Arcane Manuscript
colors:
  surface: '#fcf9f0'
  surface-dim: '#dddad1'
  surface-bright: '#fcf9f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ea'
  surface-container: '#f1eee5'
  surface-container-high: '#ebe8df'
  surface-container-highest: '#e5e2da'
  on-surface: '#1c1c17'
  on-surface-variant: '#4e4540'
  inverse-surface: '#31312b'
  inverse-on-surface: '#f4f1e8'
  outline: '#80756f'
  outline-variant: '#d2c4bd'
  surface-tint: '#6d5b50'
  primary: '#271a12'
  on-primary: '#ffffff'
  primary-container: '#3e2f26'
  on-primary-container: '#ac968a'
  inverse-primary: '#dac2b5'
  secondary: '#775a19'
  on-secondary: '#ffffff'
  secondary-container: '#fed488'
  on-secondary-container: '#785a1a'
  tertiary: '#3e0a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#5f1a06'
  on-tertiary-container: '#e37e62'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#f7ded0'
  primary-fixed-dim: '#dac2b5'
  on-primary-fixed: '#261911'
  on-primary-fixed-variant: '#54433a'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c176'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4201'
  tertiary-fixed: '#ffdbd1'
  tertiary-fixed-dim: '#ffb5a0'
  on-tertiary-fixed: '#3b0900'
  on-tertiary-fixed-variant: '#7b2e18'
  background: '#fcf9f0'
  on-background: '#1c1c17'
  surface-variant: '#e5e2da'
typography:
  display-lg:
    fontFamily: EB Garamond
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: EB Garamond
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: EB Garamond
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Literata
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Literata
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Work Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 24px
  gutter: 16px
  section-gap: 40px
---

## Brand & Style
The design system establishes a bridge between high-fantasy immersion and modern utility. It targets players who desire the tactile, evocative feel of an ancient grimoire without sacrificing the speed and clarity of a digital tool.

The aesthetic is **Tactile & Refined**, drawing heavily from medieval cartography and academic manuscripts. It avoids the "heavy" clunkiness of traditional skeuomorphism in favor of a sophisticated "Editorial Antiquity" style. This is achieved through high-quality micro-textures, delicate linework, and a layout that breathes with intentional whitespace, ensuring the UI feels like a curated artifact rather than a cluttered game menu.

## Colors
The palette is rooted in organic, historical pigments.

*   **Primary (Iron Gall):** A deep, warm charcoal used for maximum legibility in body text and primary headers.
*   **Secondary (Burnished Gold):** A muted, non-metallic gold reserved for interactive states, critical highlights, and decorative flourishes.
*   **Tertiary (Oxblood Leather):** A desaturated, earthy red used sparingly for health indicators, negative status effects, or combat-related callouts.
*   **Neutral (Vellum & Parchment):** A range of ivory and beige tones. The background uses a subtle grain texture to simulate aged paper, while containers use a slightly lighter, "cleaner" parchment tone to create hierarchy.

## Typography
The typography system prioritizes the "literary" feel of a physical book. 

*   **Headlines:** Utilize **EB Garamond** for its classical proportions and historical elegance. It should be used for character names, section headers, and significant titles.
*   **Body:** **Literata** provides superior legibility for long-form spell descriptions and inventory notes, maintaining a "bookish" charm while being optimized for digital screens.
*   **Functional Labels:** **Work Sans** is used for dense data, modifiers (+5, 18 AC), and navigation labels. Its clean, geometric nature provides a necessary modern contrast to the serif fonts, ensuring technical data is never misread.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a "logical grouping" philosophy. Components are clustered into thematic blocks (e.g., Ability Scores, Combat Stats, Features) that reflow based on device width.

*   **Desktop:** A 12-column grid. Combat stats and core attributes are pinned to the left or top, while expansive lists (Inventory, Spells) occupy the primary center/right columns.
*   **Mobile:** A single-column stack. Heavy use of tabs or "accordions" to hide secondary information (like Background/Traits) while keeping HP and Action buttons persistent.
*   **Rhythm:** Generous margins are used around the parchment "sheets" to simulate a book laying on a table. Internal spacing within components is tight and efficient to minimize scrolling.

## Elevation & Depth
This design system avoids traditional drop shadows in favor of **Tonal Layering** and **Material Offsets**.

*   **Stacked Vellum:** Depth is created by placing lighter parchment surfaces on top of darker, more textured backgrounds.
*   **Leather Binding:** Sidebars and persistent navigation elements use a dark "leather" texture (Primary Color) to appear "underneath" or "holding" the paper sheets.
*   **Fine Outlines:** Instead of shadows, elements are defined by 1px "etched" borders in a slightly darker tan or a very thin 0.5px gold rule for interactive elements.
*   **Backdrop Blurs:** Used exclusively for modal overlays (e.g., viewing spell details), creating a "focused lens" effect over the background sheet.

## Shapes
The shape language is primarily **Soft (0.25rem)**, mimicking the hand-cut edges of old paper and leather-bound journals. 

*   **Buttons:** Rectangular with very slight corner rounding to feel "architectural" and sturdy.
*   **Ability Score Circles:** Perfectly circular "wax seal" or "coin" shapes are used sparingly for key attributes (STR, DEX, etc.) to create focal points.
*   **Dividers:** Use "fine-line" flourishes—horizontal rules that taper at the ends, common in 18th-century typesetting.

## Components
*   **Buttons:** Styled as "Inscribed Labels." Primary buttons have a solid Primary Color background with Gold text. Secondary buttons are outlined in Gold with Primary text.
*   **Ability Score Cards:** Vertical rectangles with the modifier prominently displayed in the center using a Display font, and the base score in a small Label font at the bottom.
*   **Input Fields:** Ghost-style inputs. No background, just a Primary Color bottom border that glows slightly Gold when focused.
*   **Chips/Tags:** Used for "Proficiencies" or "Conditions." Styled with a light parchment fill and a thin, dark-grey dashed border to look like hand-stitched patches.
*   **Health Bar:** A horizontal bar with a "textured" fill—appearing like ink or thick paint rather than a flat digital gradient.
*   **Modals:** Styled as "Unfolded Scrolls," expanding vertically with a subtle parchment roll animation at the top and bottom.