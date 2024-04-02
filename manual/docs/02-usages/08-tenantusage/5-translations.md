# Translate mail content and front office

Daikoku supports two languages : French and English (If your language is missing, you can contribute, do not hesitate). All translations can be override when navigating on the `internationalization` page from a tenant settings page (the full route is `https://<your-domain-name>/settings/internationalization/mail`).

On this page, you have 3 tabs : `Mail`, `Mail Template` and `Front office`.

### Mail

The mail tab manages all the translations of the mails content. For each translation, you have a list of `required variables` which will be replaced by Daikoku when an email is send
> Beware of surround your variable with square brackets if you want it to be replaced.

For example, the message 
```
Your apikey for api [apiName] and plan [planName] have been updated.
```

Has by default two variable `apiName` and `planName` which will be replace by the name of the API and the name of the plan respectively. 

```
Your apikey for api My First API and plan My first plan have been updated. 
```

Each translation has one field by language. Once a translation is overloaded, a reset button will appear to retrieve the original translation.

### Mail template 

All sent mails are composed of the subject of the mail as body, incorporate in a template. This template can be change and translate in the supported languages.

When you want to change one of these fields, we have to include one `required variable` which is the `email` variable. That variable is replaced by Daikoku, depending on the subject of the email. 

If we take the previous example, without any changes, you should have for an update of API :

```
Your apikey for api My First API and plan My first plan have been updated. 
```

Now if you want to add a header and a footer to your email, you have to write in the first field `Default mail template`

```
Hello,

{{email}}

Send from Daikoku.
```

The mail will be sent with the following content:

```
Hello,

Your apikey for api My First API and plan My first plan have been updated. 

Send from Daikoku.
```

### Front office

Daikoku is a fully customizable user interface that includes the ability to translate the front office (which represents a list of one thousand words).

To change one expression: 

1. Search the expression to change.
2. Replace the value for your current language.
3. Click on the save button on your right.
4. Refresh your page (Daikoku is caching the translations to avoid fetching the translations in the back office each time they are needed).

:::warning
Some expressions are used in different pages, beware of breaking changes.
:::

