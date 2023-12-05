# About Daikoku

While [Otoroshi](https://maif.github.io/otoroshi/) is the perfect tool to manage your webapps in a technical point of view it lacked of business perspective. This is not the case anymore whith **Daikoku**.

While **Otoroshi** is a standalone, Daikoku is a developer portal which stands in front of **Otoroshi** and provides some business feature.

Whether you want to use **Daikoku** for your public APIs you want to monetize or with your private APIs to provide some documentation, facilitation and self-service feature, it will be the perfect portal for **Otoroshi**.

## Philosophy 

Every OSS product build at <a href="https://www.maif.fr/" target="_blank">MAIF</a> like <a href="https://maif.github.io/otoroshi/" target="_blank">Otoroshi</a> or <a href="https://maif.github.io/izanami/" target="_blank">Izanami</a> follow a common philosophy. 

* the services or API provided should be technology agnostic.
* http first: http is the right answer to the previous quote   
* api First: The UI is just another client of the api. 
* secured: The services exposed need authentication for both humans or machines  
* event based: The services should expose a way to get notified of what happened inside. 

## Rights and Permissions in Daikoku

In Daikoku, users' rights and permissions are managed within a hierarchical structure that includes multiple nested entities, as illustrated in the following simplified diagram:

Daikoku -> Tenants -> Teams -> APIs


> Users in Daikoku have a multi-tenant context, which allows them to access multiple tenants without the need for multiple accounts. 

The highest level of access is granted to the Super Admin, who has full control over the entire system. From there, rights and permissions are managed at the team level.

Here are the different levels of permissions within a team:

- **Super Admin**: Users with this role have both Read (R) and Write (W) permissions, granting them complete control over all entities in the system, including tenants.

- **Administrator**: Administrators have Read (R) permissions across the entire team, allowing them to view all entities, but they can only Write (W) to specific elements within the team. They cannot modify tenant-related settings.

- **API Editor**: Users with this role have Read (R) permissions for all entities within the team, but they can only Write (W) to APIs. They cannot modify tenant settings or perform actions on subscriptions.

- **User**: Users with this role have Read (R) permissions, which enable them to access certain functionalities like requesting subscriptions, viewing APIs, and checking their subscription details. However, they do not have Write (W) permissions and are restricted from performing any modifications.

Please note that the "API keys visibility" option of the team (by default set to "User") restricts the visibility of API keys to specific levels of authorization within the team.

> During the creation of a tenant, a special administrative team is automatically created, granting additional rights and permissions specific to managing the tenant itself, such as configuration, access to messaging, or management of CMS pages, for example.

For a more visual representation, you can refer to the following matrix:

|            | Super Admin | Administrator | API Editor | User  |
|------------|-------------|---------------|------------|-------|
| Tenant     |      RW     |      R        |     R      |   R   |
| Team       |      RW     |      RW       |     R      |   R   |
| API        |      RW     |      RW       |     RW     |   R   |
| Subscription |    RW     |      RW       |     -      |   R   |

---
