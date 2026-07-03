# Tenant customization

Daikoku lets you customize several parts of the portal UI using CMS pages managed via the CLI. This allows you to tailor the look and content of your tenant without touching the source code.

For all CMS-based customizations, you create and push pages using the [Daikoku CLI](https://maif.github.io/daikoku/docs/cli).


## Color theme

Every tenant has a **color theme**: a set of [CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*) (CSS variables) declared on `:root` that drive the colors of the whole portal — buttons, sidebar, cards, forms, status messages, etc.

### How it works

The color theme is stored as a CMS page (path `/customization/color-theme.css`) and served as a stylesheet at `/_/customization/color-theme.css`. It is injected in the `<head>` of the page, **before** the application loads, so the variables are available as soon as the UI renders.

The application's stylesheets never hardcode colors. Instead they read these variables, which are organized in three layers:

1. **Primitives** (`--primitive-*`) — the raw color palette, organized as scales. These are plain color literals and are the single source of truth for the palette.

   ```css
   --primitive-primary-600: #29438d;
   --primitive-neutral-500: #828282;
   --primitive-danger-500:  #95090f;
   ```

2. **Semantic tokens** — meaningful, reusable colors that *reference* the primitives. This is the layer you usually want to tweak to rebrand the portal.

   ```css
   --primary-color:   var(--primitive-primary-600);
   --danger-color:    var(--primitive-danger-500);
   --neutral-color:   var(--primitive-neutral-500);
   ```

3. **Component & layout tokens** — colors scoped to specific parts of the UI (`--sidebar-*`, `--menu-*`, `--card_*`, `--btn-*`, `--form-*`, `--badge-tags-*`, `--level1/2/3_*`).

   ```css
   --sidebar-bg-color: #29438d;
   --btn-text-color:   #495057;
   ```

> **Graceful fallbacks** — internally the app resolves each color through a fallback chain: `var(--semantic, var(--primitive, <literal>))`. If a variable is missing from your theme, the UI falls back to the corresponding primitive, and ultimately to a built-in literal. Your portal therefore never ends up without colors, even if a variable is forgotten.

### Dark mode

Dark mode is handled with a second block scoped to `:root[data-theme="DARK"]`, which overrides the variables that need a different value in dark mode. Daikoku toggles the `data-theme` attribute on `<html>` when the user switches theme.

```css
:root[data-theme="DARK"] {
  --level1_bg-color: #000;
  --primary-color: orange;
  /* ... */
}
```

### The default theme

The default theme shipped with Daikoku is the best reference to see every variable and its expected value. Use it as a starting point for your own theme:

👉 [`daikoku/public/themes/default.css`](https://github.com/MAIF/daikoku/blob/master/daikoku/public/themes/default.css)

### Editing your theme

You have three options:

- **Reset to the default theme** — in the tenant back-office, under **Settings → Customization**, the *Reset theme* action replaces your theme with the latest default one.
- **Edit it through the CLI** — push a `color-theme.css` CMS page:

  ```
  src/pages/customization/color-theme.css
  ```

  ```bash
  daikoku push
  ```
- **Inject an external stylesheet** — you can still override colors with an external CSS URL from the customization form.

### What changed

Older Daikoku versions used a flat, ad-hoc list of variables (e.g. `--body_bg-color`, `--level2_bg-color`, `--error-color`) with no palette scales and no `--primary-color`. Since __v18.12.1__ Daikoku introduces:

- the **primitive scales** (`--primitive-*`) as the single source of the palette,
- **semantic tokens** layered on top (`--primary-color`, `--danger-color`, `--neutral-color`, …),
- the **fallback chain** that keeps the UI usable even with a partial theme.

If your tenant's theme predates this change, every administrator is warned on login (on any page) that the theme is out of date. From that prompt you can either reset to the new default theme, or update your custom theme manually using the CLI. The warning disappears automatically once your theme defines the new variables.


## Footer

The portal footer can be customized per language using CMS pages at:

- `/customization/footer/fr` — displayed for French users
- `/customization/footer/en` — displayed for English users

**CLI project structure:**

```
src/pages/customization/footer/fr/page.html
src/pages/customization/footer/en/page.html
```

You can use Handlebars directives inside the footer as well:

```html
<footer>
  <p>© {{tenant.name}} — <a href="/contact">Contact</a></p>
</footer>
```

Push your pages with the CLI:

```bash
daikoku push
```
