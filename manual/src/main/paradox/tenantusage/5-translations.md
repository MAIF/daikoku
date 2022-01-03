# Translate mail content and front office

Daikoku supports two languages : french and english (If your language is missing, you can contribute, do not hesitate). All translations can be override when navigating on the `internationalization` page from a tenant settings page (the full route is `https://<your-domain-name>/settings/internationalization/mail`).

On this page, you have 3 tabs : `Mail`, `Mail Template` and `Front office`.

### Mail

The mail tab manage all the translations of the mails content. For each translation, you have a list of `required variables` which will be replaced by Daikoku when an email is send
> Beware of surroound your variable by square brackets if you wants it to be replaced .

For example, the message 
```
Your apikey for api [apiName] and plan [planName] have been updated.
```

has by default two variable `apiName` and `planName` which will be replace by the name of the api and the name of the plan respectively. 

```
Your apikey for api My First API and plan My first plan have been updated. 
```

Each translation has one field by language. Once a translation is overloaded, a reset button will appear to retrieve the original translation.

### Mail template 

All sent mails are composed of the subject of the mail as body, incorporate in a template. This template can be change and translate in the supported langauges.

When you want to change one of these fields, we have to include one `required variable` which is the `email` variable. That variable are replaced by Daikoku, depending on the subject of the email. 

If we take the previous example, without any changes, you should have for an update of api :

```
Your apikey for api My First API and plan My first plan have been updated. 
```

Now if you want to add a header and a footer at your mail, you have to write in the first field `Default mail template`

```
Hello,

{{email}}

Send from Daikoku.
```

The mail will be send with the following content :

```
Hello,

Your apikey for api My First API and plan My first plan have been updated. 

Send from Daikoku.
```

### Front office

Daikoku is a fully customizable user interface that includes the ability to translate the front office (which represents a list of one thousand words).

To change one expression.

1. Search the expression to change.
2. Replace the value for your current language.
3. Click on the save button on your right.
4. Refresh your page (Daikoku is caching the translations to avoid to fetch the translations in back office each time that needed).

@@@warning
some expressions are use in different pages, beware of breaking changes.
@@@

