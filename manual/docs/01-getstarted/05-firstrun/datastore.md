# Choose your audit trail datastore

Daikoku needs to store its audit trail in a datastore. Daikoku supports multiple datastores. 
It store its in the main database by default but you can add another one besides. If you are afraid of filling your disk space too quickly, a purge mechanism can be activated thanks to an environment variable daikoku.audit.purge.cron

Available datastores for audit trail are the following :

* elastic
* kafka
* webhook

You can manage it in the tenant settings page.
