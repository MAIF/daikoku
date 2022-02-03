# Using Content Management System

Daikoku provides a way to create a website in front of the backoffice. 

@@@warning
This feature is only available for public tenants.   
@@@

## Enable the CMS on your tenant

By default the CMS is disabled on a private tenant. To turn on the CMS :

1. **Navigate** to your `tenant administration` form
2. In the `security` section, **disable** the `private tenant` button
3. **Scroll down** and **enable** the `CMS` in the `Custom home page` section

Once done, navigate to the domain of your tenant. You have two possiblities :

- you already had a `unlogged home page` on your tenant, so Daikoku automatically created a home page with your previously entered content.
- you have just started Daikoku, so Daikoku displays an 404 page not found error

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

## Custom the 404 page

When the CMS cannot find a page for a specific path, it displays a simple Daikoku page error. In many cases, you want to customize and personalize this page with your compagny's graphic charter.

1. Navigate to the `https://<your-domain>/settings/pages`
2. Create a new page with a name, a path and the desired content 
3. **Publish** the page
4. Navigate to your tenant administration page
5. Scroll to the `Custom home page` section
6. Select the created page in the `404 page` selector
7. Save your tenant and try to call an invalid cms page : `https://<your-domain>/_/unknown-page`

## Define and use a block

As a classical CMS, you can create an infinity number of pages but also reusable blocks. A block is composed of the same attributes than a page, with the exception of the path field. Indeed, a block cannot be displayed on a specific route but can be included in the others cms pages. 

1. **Create** a new page from the `https://<your-domain>/settings/pages` page
2. **Activate** the `Is a block?` button
3. **Publish** your block
4. **Return** to the list of pages
5. **Edit** your home page
6. On the top of the main input, **click** on the `square` button
7. In the appeared modal, **select** the created block (it will be added at your cursor position)
8. **Click** on the `Viewed draft page`
9. If everything works, the block appears
10. **Return** to the draft tab and **Publish** your version

## Add a link to the back office page

In your pages and blocks, you can add a link to the back and frontoffice of Daikoku. 

Once on a page, on the top of the main input **select** the first button (with the link icon). In the appeared modal, **choose** the desired link.

The following text `{{daikoku-links-<name-of-the-link>}}` has beed added at your cursor position. This Handlebars instruction will be modified, during the rendering process, by the url to the page. To use this link, you must wrap it in a link html tag, as in the following example :

```
<a href="{{daikoku-links-notifications}}">My notifications</a>
```

## Navigate between cms page

You can navigate between your created pages using the `{{daikoku-page-url "id-of-the-page"}}` instruction. To simple add a link to a page, you can use the second button at the top of the main input. In the appeared modal, **select** the link page you want to add and wrap it in a link html tag.

```
<a href="{{daikoku-page-url "61fbaa95320100dbfca04d11"}}">See my apis</a>
```

## Custom path with path params

For some page, you may want use a path param in your page to adapt the content. Daikoku only supports path params at the end of the matching path. Examples:

* The path set on the page is : `/foo`. 
* The call is `/foo/bar/second-param`
  
The path params will be `bar` and `second-param`. To use the path params, Daikoku provides the `{{daikoku-path-param '<n>'}}` instructions, with the `n` parameter corresponding to the n-th path param of the route. Example:

* The path set on the page is : /foo
* The call is `/foo/bar/second-param`
* use `{{daikoku-path-param '0'}}` and `{{daikoku-path-param '1'}}` to respectively retrieve the first and the second parameter

See the following example to create a page to display an Daikoku api:

```html
<div class="api-block">
    {{#daikoku-api "{{daikoku-path-param '0'}}" }}
    <div class="api-name"></div>
    <span>{{name}}</span>
    <div class="api-description">
        <h3>Description de l'API</h3>
        <div> {{description}} </div>
    </div>
    {{/daikoku-api}}
</div>
```

## Handlebars instructions

You can include all of these instructions in your pages and blocks.

* `daikoku-asset-url`: link to a tenant asset - `/tenant-assets/<name-of-the-asset>`
* `daikoku-page-url`:  link where the page is rendered - `/_</path>`
* `daikoku-generic-page-url`: generic link to a cms page - `/cms/page/<id-of-the-page>` 
* `daikoku-page-preview-url`: generic link to the draft of a cms page - `/cms/page/<id-of-the-page>?draft=true`
* `daikoku-include-block`: renders the block of id, as a string
* `daikoku-template-wrapper`: wraps a content. This block takes the id of the block as a parameter and supports the `{{children}}` parameter
* `daikoku-query-param`: retrieve the query param of 'id' - `{{daikoku-query-param '<id-of-the-query-param>'}}`
* `daikoku-api`: take a string id of api in parameter and retrieve the `name`, `id`, `description` and `small description` of the api
* `daikoku-apis`: retrieve the list of APIs with `name`, `id`, `description` and the `small description` for each API
* `daikoku-json-api`: retrieve an API in JSON format
* `daikoku-json-apis`: retrieve the list of APIs in JSON format
* `daikoku-path-param`: take the index of the path param and retrieve the value of the path param
* `daikoku-team`: retrieve the `name` and `id` of a team
* `daikoku-teams`: retrieve the list of teams with id and team for each team
* `daikoku-json-team`: retrieve a team in JSON format
* `daikoku-json-teams`: retrieve the list of teams in JSON format
* `daikoku-documentations`: retrieve the documentations pages of an API with `id`, `title`, `content type` and the `content` for each page
* `daikoku-documentations-json`: retrieve a documentation page of an API in JSON format
* `daikoku-documentations-page`: retrieve the documentations pages of an API in JSON format
* `daikoku-documentations-page-id`: retrieve the page of an api of id passed in parameter
* `daikoku-plans`: retrieve the plans of an API 
* `daikoku-plans-json`: retrieve the list of plans of an API in JSON format
* `connected`: true if the user is connected
* `tenant`: get field of the `tenant` : the name
* `admin`: true if the connected user is a tenant administrator
* `user`: get the `name` and the `email` of the connected user
* `request`: get the `path`, `method` and the `headers` of the request

For all of these statements, you can pass named parameters. With the following example, we are passing parameters between the home page and the two information blocks.

```html
<!-- The home page -->
<DOCTYPE html>
<html>
    <head>
      <title>My page</title>
    </head>
    <body>
        <h1>My home page</h1>
        <div>
            <h2>Multiples blocks information</h2>
            {{daikoku-include-block "<id-of-the-information-block>" title="My first block"}}
            {{daikoku-include-block "<id-of-the-information-block>" title="My second block"}}
        </div>
    </body>
</html>
```

```html
<!-- The information block -->
<div>
    <span>The parameter received : {{title}}</span>
</div>
```

## A complete example

In this example, we will build the pages corresponding to the following template.

```
The Layout (page)

head tag with a css and js script

- body
    header (block)

    List of APIS (block)

footer (block)
```

@@@warning
Don't forget to replace each parameter `<id-of...>` in each page
@@@

1. Create a new block with `navbar` as title and the content of the `navbar.html` tab
2. Create a new block with `footer` as title and the content of the `footer.html` tab
3. Create a new block with `api` as title and the content of the `api.html` tab (we will replace the `<id-of-the-layout-page>` parameter after the creation of the layout)
4. Create a new block with `apis` as title and the content of the `apis.html` tab. Replace the `<id-of-the-api-page>` using the button at the top of the main input.
5. Create a new block with `main` as title and the content of the `main.css` tab
6. Create a new block with `script` as title and the content of the `script.js` tab
7. Create the last page with `layout` as title and the content of the `layout.html` tab. Replace the `<id-of-the-css-page>` and `<id-of-the-js-page>` by the id of your created block (using the button at the top of the main input). 
8. Return to the `api` block and replace the `<id-of-the-layout-page>` by the id of the layout page.

navbar.html
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
:   @@snip [layout.html](./snippets/layout.html)



