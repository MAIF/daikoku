# Jobs

Daikoku includes several background jobs designed to ensure data consistency and the smooth operation of the platform. These tasks run automatically at regular intervals and can be partially customized through configuration. Key jobs include:

    - Synchronization with Otoroshi, to keep API data and usage statistics up to date.

    - Audit trail cleanup, to automatically purge old audit logs and limit storage usage.

    - Notification purge, to remove obsolete or unhandled notifications.

    - Anonymous reporting, which periodically sends anonymized usage statistics to help us improve the tool.

These jobs play a critical role in maintaining Daikoku’s stability, performance, and data hygiene over time.

## Notifications Purge Job

The `NotificationsPurgeJob` is an automated job responsible for periodically deleting obsolete notifications in the Daikoku system. It helps maintain database cleanliness by removing old notifications based on specific criteria.


### Job startup

The job starts automatically when the application launches if the `daikoku.notifications.purge.cron` configuration is enabled. It runs periodically according to the interval configured in `daikoku.notifications.purge.interval`.


### Job lifecycle

The job runs continuously until the application is shut down. It cannot be stopped individually - it only stops when the entire application terminates.

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

| Parameter                                       | Description                                            | Default Value |
| ----------------------------------------------- | ------------------------------------------------------ | ------------- |
| `daikoku.notifications.purge.cron`              | Enables/disables automatic job execution               | `true`        |
| `daikoku.notifications.purge.interval`          | Interval between each job execution                    | `1 hours`     |
| `daikoku.notifications.purge.max.date`          | Retention period for basic notifications               | `30 days`     |
| `daikoku.notifications.purge.max.to.treat.date` | Retention period for notifications requiring treatment | `180 days`    |
