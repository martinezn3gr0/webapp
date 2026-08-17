---
name: Electric Blue Industrial
colors:
  surface: '#121317'
  surface-dim: '#121317'
  surface-bright: '#38393e'
  surface-container-lowest: '#0d0e12'
  surface-container-low: '#1a1b20'
  surface-container: '#1f1f24'
  surface-container-high: '#292a2e'
  surface-container-highest: '#343439'
  on-surface: '#e3e2e8'
  on-surface-variant: '#c4c5d9'
  inverse-surface: '#e3e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#8e90a2'
  outline-variant: '#434656'
  surface-tint: '#b8c3ff'
  primary: '#b8c3ff'
  on-primary: '#002388'
  primary-container: '#2e5bff'
  on-primary-container: '#efefff'
  inverse-primary: '#124af0'
  secondary: '#d3fbff'
  on-secondary: '#00363a'
  secondary-container: '#00eefc'
  on-secondary-container: '#00686f'
  tertiary: '#c4c6ce'
  on-tertiary: '#2d3037'
  tertiary-container: '#6a6d74'
  on-tertiary-container: '#eef0f8'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c3ff'
  on-primary-fixed: '#001356'
  on-primary-fixed-variant: '#0035be'
  secondary-fixed: '#7df4ff'
  secondary-fixed-dim: '#00dbe9'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#e1e2ea'
  tertiary-fixed-dim: '#c4c6ce'
  on-tertiary-fixed: '#191c22'
  on-tertiary-fixed-variant: '#44474d'
  background: '#121317'
  on-background: '#e3e2e8'
  surface-variant: '#343439'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
This design system is built for high-performance industrial interfaces, merging the raw utility of **Brutalism** with the high-tech glow of **Cyberpunk** aesthetics. The target audience includes developers, engineers, and data analysts who require high legibility in low-light environments. 

The emotional response is one of precision, energy, and unwavering reliability. Visuals are characterized by heavy structural lines, high-contrast interactive elements, and "glowing" accents that simulate an energized electrical circuit against a dark, machined substrate.

## Colors
The palette is anchored by a deep, monochromatic base to allow the "Electric Blue" to dominate the visual hierarchy.

- **Primary (#2E5BFF):** A high-saturation electric blue used for primary actions and "energized" states.
- **Secondary (#00F0FF):** A cyan-leaning bright blue for high-contrast accents, data visualization, and hover states to enhance the "glow" effect.
- **Surface-Dark:** The foundation layer, utilizing deep blacks and charcoal grays to provide maximum contrast.
- **Surface-Bright:** Interactive surfaces utilize a semi-transparent overlay of the primary blue to create a sense of internal illumination.
- **Outlines:** All structural borders use a dimmed version of the primary blue, increasing in brightness during interaction to simulate a closed circuit.

## Typography
The typographic system emphasizes technical precision. **Space Grotesk** provides a futuristic, geometric feel for headings. **Geist** handles body text with a clean, developer-centric clarity. **JetBrains Mono** is utilized for labels, metadata, and status indicators to reinforce the industrial, code-like nature of the interface. 

All headings should be set in sentence case to maintain a modern, functional tone. Labels should be uppercase when paired with icons or used in navigation headers to enhance scannability.

## Layout & Spacing
The layout follows a **Fluid Grid** model based on a 4px baseline rhythm. 

- **Desktop:** 12-column grid with 24px gutters. Content is contained within a max-width of 1440px.
- **Tablet:** 8-column grid with 16px gutters.
- **Mobile:** 4-column grid with 16px gutters and 16px side margins.

Alignment is strictly modular. Components should snap to the grid to maintain the "Industrial" feel. Use generous padding within cards (`24px`) to balance the heavy borders and bright accents, preventing the UI from feeling cluttered.

## Elevation & Depth
In this dark, industrial theme, elevation is expressed through **Tonal Layers** and **Outer Glows** rather than traditional shadows.

1.  **Base (Level 0):** The deepest background color (#0B0C10).
2.  **Surface (Level 1):** Raised containers use a slightly lighter charcoal with a 1px solid primary-blue border at 20% opacity.
3.  **Glow (Level 2):** Active or hovered elements emit a soft, 8px-12px diffused outer glow using the primary electric blue color at 30% opacity.
4.  **Interactive Outlines:** Use crisp, high-contrast 1px or 2px borders. "Inactive" states are dim; "Active" states are full-brightness electric blue.

## Shapes
This design system utilizes **Sharp** (0px) corners for all structural elements including buttons, cards, and input fields. This choice reinforces the brutalist, industrial aesthetic and suggests a rigourous, engineered environment. Occasionally, a 45-degree "clipped corner" can be used for decorative elements or primary action buttons to emphasize the high-tech, futuristic theme.

## Components
- **Buttons:** Primary buttons are solid Electric Blue (#2E5BFF) with black text. Secondary buttons have a 1px Electric Blue border and no fill. Both use sharp corners and a subtle glow on hover.
- **Input Fields:** Dark backgrounds with a 1px dimmed blue border. Upon focus, the border brightens to 100% saturation and the label (in JetBrains Mono) shifts to the primary blue.
- **Chips/Status Indicators:** High-contrast tags with monospaced text. Success states use Cyan (#00F0FF); Error states use a high-saturation Magenta to contrast against the blue.
- **Cards:** Defined by a 1px border. No drop shadows. Use a subtle background gradient (top-to-bottom) from a dark gray to the base black to create a sense of verticality.
- **Data Grids:** Heavy horizontal lines. Row highlights use a 10% opacity blue tint with a 2px "power bar" indicator on the far left of the active row.