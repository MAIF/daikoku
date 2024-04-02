# Using a Content Management System

Daikoku provides a way to create a website in front of the backoffice. 

:::warning
This feature is only available for public tenants.   
:::

## Enable the CMS on your tenant

By default, the CMS is disabled on a private tenant. To turn on the CMS:

1. **Navigate** to your `tenant administration` form
2. In the `security` section, **disable** the `private tenant` button
3. **Scroll down** and **enable** the `CMS` in the `Custom home page` section

Once done, navigate to the domain of your tenant. You have two possibilities :

- You already had a `unlogged home page` on your tenant, so Daikoku automatically created a home page with your previously entered content.
- You have just started Daikoku, so Daikoku displays an 404 page not found error

In both cases, you can read the next sections to create your first page and the customize the 404 page.

## Create your first page

In your tenant administration, **navigate** to the `Pages` tab (visible on the sidebar or available on `https://<your-domain>/settings/pages`)

Let's start by creating the home page.

1. **Click** on the `new page` button
2. On your left, **tap** the new name of your page (in our example, it will just be `My home page`)
3. We want to create a page and not a block (read the next section to go deeper into the details). So, let's the `Is a block?` switch disabled
4. On the `path` field, indicates the path where the page will be showed (in our case, it will be `/`)
5. On the `Draft` tab, at your center of the screen, edit the `title` and the `h1` of your home page. Add the following tag in the head section `<title>My home page</title>` and rename the content of the `h1` with `My home title page`
6. Confirm your modifications by **clicking** on the `Publish this version` button (at the right top of your screen).

The page is created but not already set on your tenant as the home page. **Navigate** to your tenant administration form, to the `Custom home page` and choose your created page in the `Home page` selector.

Once done, navigate to your domain of your tenant and see your home page appear.

## Customize the 404 page

When the CMS cannot find a page for a specific path, it displays a simple Daikoku page error. In many cases, you want to customize and personalize this page with your company's graphic charter.

1. Navigate to the `https://<your-domain>/settings/pages`
2. Create a new page with a name, a path and the desired content 
3. **Publish** the page
4. Navigate to your tenant administration page
5. Scroll to the `Custom home page` section
6. Select the created page in the `404 page` selector
7. Save your tenant and try to call an invalid CMS page : `https://<your-domain>/_/unknown-page`

## Define and use a block

As a classical CMS, you can create an infinity number of pages but also reusable blocks. A block is composed of the same attributes than a page, except for the path field. Indeed, a block cannot be displayed on a specific route but can be included in the others CMS pages.

1. **Create** a new page from the `https://<your-domain>/settings/pages` page
2. **Activate** the `Is a block?` button
3. **Publish** your block
4. **Return** to the list of pages
5. **Edit** your home page
6. On the top of the main input, **click** on the `Add an element` button
7. **select** in the list `Render a block` item, **select** the concerned block and **click** on the `insert` button
8. **Click** on the `Viewed draft page`
9. If everything works, the block appears
10. **Return** to the draft tab and **Publish** your version

## Add a link to the back office page

In your pages and blocks, you can add a link to the back and frontoffice of Daikoku. 

Once on a page, on the top of the main, input **click** on the `Add an element` button . In the appeared modal, **choose** `Choose a link to the back office` and **click** on the `insert` button.

The following text `{{daikoku-links-<name-of-the-link>}}` has been added at to your cursor position. This Handlebars instruction will be modified, during the rendering process, by the URL to the page. To use this link, you must wrap it in a link HTML tag, as in the following example:

```
<a href="{{daikoku-links-notifications}}">My notifications</a>
```

## Navigate between the CMS page

You can navigate between your created pages using the `{{daikoku-page-url "id-of-the-page"}}` instruction. To simply add a link to a page, you can get back to the `Add an element` list, **select** `Insert a link to a cms page` item and **click** on the `insert` button.

```
<a href="{{daikoku-page-url "61fbaa95320100dbfca04d11"}}">See my apis</a>
```

## Custom path with path params

For some pages, you may want to use a path param in your page to adapt the content. Daikoku only supports path params at the end of the matching path. Examples:

* The path set on the page is : `/foo`. 
* The call is `/foo/bar/second-param`
  
The path params will be `bar` and `second-param`. To use the path params, Daikoku provides the `{{daikoku-path-param '<n>'}}` instructions, with the `n` parameter corresponding to the nth path param of the route. Example:

* The path set on the page is : /foo
* The call is `/foo/bar/second-param`
* use `{{daikoku-path-param '0'}}` and `{{daikoku-path-param '1'}}` to respectively retrieve the first and the second parameter

See the following example to create a page to display a Daikoku API:

```html
<div class="api-block">
    {{#daikoku-api "{{daikoku-path-param '0'}}" }}
    <div class="api-name"></div>
    <span>{{api.name}}</span>
    <div class="api-description">
        <h3>Description de l'API</h3>
        <div> {{api.description}} </div>
    </div>
    {{/daikoku-api}}
</div>
```

## A complete example

In this example, we will build the pages corresponding to the following template:

```
The Layout (page)

head tag with a css and js script

- body
    header (block)

    List of APIS (block)

footer (block)
```

:::warning
Don't forget to replace each parameter `<id-of...>` in each page
:::

1. Create a new block with `navbar` as title and the content of the `navbar.html` tab
2. Create a new block with `footer` as title and the content of the `footer.html` tab
3. Create a new block with `api` as title and the content of the `api.html` tab (we will replace the `<id-of-the-layout-page>` parameter after the creation of the layout)
4. Create a new block with `apis` as title and the content of the `apis.html` tab. Replace the `<id-of-the-api-page>` using the button at the top of the main input.
5. Create a new block with `main` as title and the content of the `main.css` tab
6. Create a new block with `script` as title and the content of the `script.js` tab
7. Create the last page with `layout` as title and the content of the `layout.html` tab. Replace the `<id-of-the-css-page>` and `<id-of-the-js-page>` by the ID of your created block (using the button at the top of the main input). 
8. Return to the `api` block and replace the `<id-of-the-layout-page>` by the ID of the layout page.

<!-- navbar.html
:   @@snip [navbar.html](./snippets/navbar.html) 

footer.html
:   @@snip [footer.html](./snippets/footer.html) 

api.html
:   @@snip [api.html](./snippets/api.html) 

apis.html
:   @@snip [apis.html](./snippets/apis.html) 

main.css
:   @@snip [main.css](./snippets/main.css) 

script.js
:   @@snip [script.js](./snippets/script.js)

layout.html
:   @@snip [layout.html](./snippets/layout.html) -->



