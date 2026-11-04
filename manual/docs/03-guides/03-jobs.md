# Jobs

Daikoku includes several background jobs designed to ensure data consistency and the smooth operation of the platform. These tasks run automatically at regular intervals and can be partially customized through configuration. Key jobs include:

    - Synchronization with Otoroshi, to keep API data and usage statistics up to date.

    - Audit trail cleanup, to automatically purge old audit logs and limit storage usage.

    - Notification purge, to remove obsolete or unhandled notifications.

    - Anonymous reporting, which periodically sends anonymized usage statistics to help us improve the tool.

These jobs play a critical role in maintaining Daikoku’s stability, performance, and data hygiene over time.

## Otoroshi Synchronizer Job

This job reconciles Daikoku with Otoroshi. For each keyring it recomputes the shared Otoroshi API key
from its **still-active** subscriptions only — a subscription takes part when it is enabled and not
blocked (`enabled && blockedBy` empty). This is how API lifecycle changes take effect on real keys:
when a producer blocks an API (or an individual subscription), the corresponding subscriptions are
flagged as blocked and the synchronizer disables their contribution to the shared key; unblocking
restores it. A keyring whose members are all blocked ends up disabled rather than deleted, so the
change can be rolled back.

## API Key Statistics Collector Job

`ApiKeyStatsJob` collects usage and billing statistics from Otoroshi for each tenant.
It uses the shared job lifecycle: a single-instance claim, heartbeat, persisted cursor,
and audit events reporting processed/succeeded subscriptions and individual failures.

Subscriptions are read in batches of 50, ordered by creation time and ID. Each completed
batch saves a cursor; after a crash or a failed run, collection resumes inclusively at
that creation time, so subscriptions sharing a timestamp are not lost. Individual
subscription failures are reported without stopping other subscriptions, and the cursor
never advances beyond the first failure. A partially completed run is followed by a full
scan on the next scheduled run.

Each run also refreshes today's incomplete statistics; historical days are collected
chronologically so a failed day is retried before later days. The previous downstream
throttle is replaced by bounded subscription parallelism (2 by default).
Existing subscription/API/team consumption endpoints keep returning consumption arrays.

Automatic collection is disabled by default. Enable `daikoku.apikeysStatsJob.enabled`
to start it with the application. An on-demand tenant run is available through
`POST /api/jobs/stats/_sync?access_key=<key>&parallelism=2`.

| Parameter | Environment variable | Default |
| --------- | -------------------- | ------- |
| `daikoku.apikeysStatsJob.enabled` | `DAIKOKU_APIKEYS_STATS_JOB_ENABLED` | `false` |
| `daikoku.apikeysStatsJob.mode` | `DAIKOKU_APIKEYS_STATS_JOB_MODE` | `interval` |
| `daikoku.apikeysStatsJob.key` | `DAIKOKU_APIKEYS_STATS_JOB_ACCESS_KEY` | `secret` |
| `daikoku.apikeysStatsJob.cronExpression` | `DAIKOKU_APIKEYS_STATS_JOB_CRON_EXPRESSION` | -- |
| `daikoku.apikeysStatsJob.interval` | `DAIKOKU_APIKEYS_STATS_JOB_INTERVAL` | `3600000` (milliseconds) |

These settings replace `daikoku.stats.sync.*` and `daikoku.stats.call.interval`.
For cron scheduling, set `mode = "cron"` and supply a cron expression.

## Notifications Purge Job

The `NotificationsPurgeJob` is an automated job responsible for periodically deleting obsolete notifications in the Daikoku system. It helps maintain database cleanliness by removing old notifications based on specific criteria.

### Job startup

The job starts automatically when the application launches if the `daikoku.notificationsPurgeJob.enabled` configuration is equal to `true`. It runs periodically according to the interval configured in `daikoku.notificationsPurgeJob.interval` or the cron expression configured in `daikoku.notificationsPurgeJob.cronExpression`.

### Job lifecycle

The job runs continuously until the application is shut down. It cannot be stopped individually - it only stops when the entire application terminates. It can be run occasionally by calling `/api/jobs/notifications-purge/_sync` with the dedicated key in params.

## Purge criteria

The job deletes notifications based on three main criteria:

### 1. Pending "AcceptOnly" notifications

- **Type**: `NotificationType.AcceptOnly`
- **Status**: `Pending`
- **Condition**: Older than `daikoku.notifications.purge.max.base.date`

These notifications typically correspond to requests that only require acceptance (like basic information) and have been pending for too long.

### 2. Accepted notifications

- **Status**: `Accepted`
- **Condition**: Acceptance date older than `daikoku.notifications.purge.max.base.date`

Once accepted, the notifications can be deleted after a retention period to free up storage space.

### 3. Pending "AcceptOrReject" notifications

- **Type**: `NotificationType.AcceptOrReject`
- **Status**: `Pending`
- **Condition**: Older than `daikoku.notifications.purge.max.to.treat.date`

These notifications require an action (accept or reject) and may have a longer retention period.

## Configuration

The job uses several configuration parameters:

| Parameter                                         | Environment variable                                | Description                                            | Default Value |
| ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ | ------------- |
| `daikoku.notificationsPurgeJob.key`               | `DAIKOKU_NOTIFICATIONS_PURGE_JOB_KEY`               | the key to run job by API call                         | `secret`      |
| `daikoku.notificationsPurgeJob.enabled`           | `DAIKOKU_NOTIFICATIONS_PURGE_JOB_ENABLED`           | Enables/disables automatic job execution               | `false`       |
| `daikoku.notificationsPurgeJob.mode`              | `DAIKOKU_NOTIFICATIONS_PURGE_JOB_MODE`              | The job execution mode (`interval` or `cron`)          | `interval`    |
| `daikoku.notificationsPurgeJob.cronExpression`    | `DAIKOKU_NOTIFICATIONS_PURGE_JOB_CRON_EXPRESSION`   | The cron expression used for job execution             | --            |
| `daikoku.notificationsPurgeJob.interval`          | `DAIKOKU_NOTIFICATIONS_PURGE_JOB_INTERVAL`          | Interval between each job execution                    | `1hour`       |
| `daikoku.notificationsPurgeJob.max.base.date`     | `DAIKOKU_NOTIFICATIONS_PURGE_JOB_MAX_DATE`          | Retention period for basic notifications               | `30days`      |
| `daikoku.notificationsPurgeJob.max.to.treat.date` | `DAIKOKU_NOTIFICATIONS_PURGE_JOB_MAX_TO_TREAT_DATE` | Retention period for notifications requiring treatment | `180days`     |

## Audit Trail Purge Job

like notifications, audit trails can feed your database a little bit too much. To avoid a memory issue, you can enable a job to clean old audit events.

### Job startup

The job starts automatically when the application launches if the `daikoku.auditTrailPurgeJob.enabled` configuration is equal to `true`. It runs periodically according to the interval configured in `daikoku.auditTrailPurgeJob.interval` or the cron expression configured in `daikoku.auditTrailPurgeJob.cronExpression`.

### Job lifecycle

The job runs continuously until the application is shut down. It cannot be stopped individually - it only stops when the entire application terminates. It can be run occasionally by calling `/api/jobs/audit-trail-purge/_sync` with the dedicated key in params.

## Configuration

The job uses several configuration parameters:

| Parameter                                        | Environment variable                            | Description                                   | Default Value |
| ------------------------------------------------ | ----------------------------------------------- | --------------------------------------------- | ------------- |
| `daikoku.auditTrailPurgeJob.key`                 | `DAIKOKU_AUDIT_TRAIL_PURGE_JOB_KEY`             | the key to run job by API call                | `secret`      |
| `daikoku.auditTrailPurgeJob.enabled`             | `DAIKOKU_AUDIT_TRAIL_PURGE_JOB_ENABLED`         | Enables/disables automatic job execution      | `false`       |
| `daikoku.auditTrailPurgeJob.mode`                | `DAIKOKU_AUDIT_TRAIL_PURGE_JOB_MODE`            | The job execution mode (`interval` or `cron`) | `interval`    |
| `daikoku.auditTrailPurgeJob.cronExpression`      | `DAIKOKU_AUDIT_TRAIL_PURGE_JOB_CRON_EXPRESSION` | The cron expression used for job execution    | --            |
| `daikoku.auditTrailPurgeJob.interval`            | `DAIKOKU_AUDIT_TRAIL_PURGE_JOB_INTERVAL`        | Interval between each job execution           | `1hour`       |
| `daikoku.auditTrailPurgeJob.purge.max.base.date` | `DAIKOKU_AUDIT_TRAIL_PURGE_JOB_MAX_DATE`        | Retention period for events                   | `60days`      |
