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

## All CMS and CLI information

You can find the complete documentation for the Daikoku CLI to manage your CMS [here](https://maif.github.io/daikoku/docs/cli)


