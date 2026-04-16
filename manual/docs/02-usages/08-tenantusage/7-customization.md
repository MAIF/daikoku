# Tenant customization

Daikoku lets you customize several parts of the portal UI using CMS pages managed via the CLI. This allows you to tailor the look and content of your tenant without touching the source code.

For all CMS-based customizations, you create and push pages using the [Daikoku CLI](https://maif.github.io/daikoku/docs/cli).

## Dashboard description

The top section of the consumer dashboard can be replaced by a custom CMS page, with per-language support.

Daikoku looks for a page at:

- `/customization/dashboard/description/fr` — displayed for French users
- `/customization/dashboard/description/en` — displayed for English users

If no page is found for the current language, the default tenant description (title, name, description field) is displayed instead.

>the top section is height limited to `10rem`. To avoid css issues dedicated classname is avalaible `organisation_header_wrapper` for warrper compoennt and `organisation__logo` for the logo

**CLI project structure:**

```
src/pages/customization/dashboard/description/fr/page.html
src/pages/customization/dashboard/description/en/page.html
```

You can use Handlebars directives to inject tenant values:

```html
<div class="dashboard-description">
  <img src="{{tenant.logo}}" alt="{{tenant.name}}" />
  <h1>{{tenant.title}}</h1>
  <p>{{tenant.description}}</p>
</div>
```

The block has a maximum height of `10rem`. Use the `dashboard-description` CSS class in your `style.css` CMS page to control layout.

See the [CMS documentation](./6-cms.md) for more details on Handlebars directives and how to push pages.

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
