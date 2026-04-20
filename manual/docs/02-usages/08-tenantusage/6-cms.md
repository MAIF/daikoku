# Exploring the CMS

Daikoku provides a way to create a website in front of the backoffice. 

:::warning
This feature is only available for public tenants.   
:::

The first step is to set your tenant's visibility to `public`:

1. Navigate to your `tenant administration` form
2. In the `security` section, disable the `private tenant` button
3. Save the configuration
4. Navigate to the `customization` section
5. At the bottom of the page, under the `Pages` section, you can switch on the `Home page visibility` button and save the configuration

Well done! To create contents on your CMS, we need to use the CLI. 

You can find all information about the installation [here](https://maif.github.io/daikoku/docs/cli/#installation).

## Selecting pages from Tenant Administration

Once you have created pages using the Daikoku CLI and pushed them, you can choose which pages will be used to the:

- home page : this is the first page displayed to the client
- 404 page : no need to explain this
- authenticated page : you can choose which pages will be displayed when an unauthenticated user navigates to a page requiring authentication
- cacheTTL : duration used by the manager to delay re-rendering of a page

## Dashboard description block

You can customize the description block displayed at the top of the consumer dashboard using a CMS page. This lets you tailor the content per language and use Handlebars directives to inject dynamic tenant values.

### How it works

Daikoku looks for a CMS page at the following path, depending on the user's display language:

- `/customization/dashboard/description/fr` — for French
- `/customization/dashboard/description/en` — for English

If no page is found for the current language, the default tenant description (title, name, description) is displayed instead.

### Creating the page

In your CLI project, create the file at the matching path:

```
src/pages/customization/dashboard/description/fr/page.html
src/pages/customization/dashboard/description/en/page.html
```

Push your project with the CLI:

```bash
daikoku push
```

### Handlebars directives

You can use Handlebars directives inside the page to access tenant data. For example:

```html
<div class="dashboard-description">
  <img src="{{tenant.logo}}" alt="{{tenant.name}}" />
  <h1>{{tenant.title}}</h1>
  <p>{{tenant.description}}</p>
</div>
```

### Styling

The rendered block has a maximum height of `10rem`. You can use the `dashboard-description` CSS class in your `style.css` CMS page to avoid layout issues:

```css
.dashboard-description {
  display: flex;
  align-items: center;
  gap: 1rem;
}
```

## All CMS and CLI information

You can find the complete documentation for the Daikoku CLI to manage your CMS [here](https://maif.github.io/daikoku/docs/cli)


