# Anonymous reporting
The best way of supporting us in Daikoku development is to enable Anonymous reporting.

## Details
When this feature is active, Otoroshi periodically send anonymous information about its configuration.

This information helps us to know how Daikoku is used, it’s a precious hint to prioritise our roadmap.

Below is an example of what is sent by Daikoku. You can also [read the source code](https://github.com/MAIF/daikoku/blob/master/daikoku/app/jobs/AnonymousReportingJob.scala#L80-L147).

```json
{
    "os": {
      "arch": "aarch64",
      "name": "Mac OS X",
      "version": "14.4.1"
    },
    "@id": "d25c3bc2c-647a-47d6-8e8a-ee5b32cc0822",
    "tenants": [
      {
        "AuthRole": "Local",
        "payements": 0,
        "tenantMode": "Default",
        "visibility": "public",
        "displayMode": "default"
      }
    ],
    "entities": {
      "apis": 3,
      "teams": 6,
      "users": 3,
      "cmspages": 0,
      "messages": 0,
      "api_posts": 0,
      "api_issues": 0,
      "evolutions": 0,
      "operations": 0,
      "usage_plans": 0,
      "audit_events": 0,
      "consumptions": 1908,
      "translations": 0,
      "notifications": 2,
      "user_sessions": 0,
      "password_reset": 0,
      "step_validator": 0,
      "account_creation": 0,
      "api_subscription": 2,
      "email_verifications": 0,
      "subscription_demands": 44,
      "api_documentation_pages": 1
    },
    "features": {},
    "timestamp": 1712048893066,
    "java_version": {
      "vendor": "Eclipse Adoptium",
      "version": "11.0.16.1"
    },
    "timestamp_str": "2024-04-02T11:08:13.066+02:00",
    "daikoku_version": "17.2.0-dev",
    "daikoku_cluster_id": "dade842c5-0c2c-4a2d-acec-05db7c1ce36d"
}
```

## Toggling
Anonymous reporting can be toggled any time using :

- the UI (Daikoku settings > Anonymous reporting)
- daikoku.anonymous-reporting.enabled configuration
- DAIKOKU_ANONYMOUS_REPORTING_ENABLED env variable