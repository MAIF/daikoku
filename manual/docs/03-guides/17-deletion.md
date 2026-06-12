---
id: deletion-flows
title: Deletion Flows
sidebar_position: 10.5
description: How each base object (subscription, api, plan, team, user, tenant) is deleted, what cascades, and what runs synchronously vs asynchronously through the operation queue.
---

# Deletion Flows

An overview of the deletion flows for each base object (subscription, api, plan, team, user, tenant):
what gets deleted in cascade, and whether it runs synchronously or asynchronously (through the `Operation` queue).

Sources: `DeletionService`, `QueueJob`, `TenantController`.

## Legend

- 🟢 `SYNC` = executed in the HTTP request thread (the front waits for it)
- 🔵 `ASYNC` = deferred through the `Operation` queue (`QueueJob`, processed one at a time, a single `InProgress` at any moment)
- `logical` = `_deleted = true` / `physical` = row actually removed

---

## 1. Subscription — `deleteSubscriptions` (the base building block)

```
deleteSubscriptions(subs, api, tenant)                         🟢 SYNC (all inline)
├─ Phase 0  promote orphan children (parent re-election)        DB
├─ Phase 1  enabled = false                                    DB
├─ Phase 2  Otoroshi: run (surviving parents) / runForDeletion (HTTP, //)
├─ Phase 3b delete pending notifs (action.subscription)        DB physical
├─ Phase 3  save "ApiKeyDeletionInformationV2" notif           DB
│           └─ if paid plan → enqueue Operation ThirdPartySubscription ────┐
└─ Phase 4  delete subscriptions                               DB physical │
                                                                            ▼
   🔵 ASYNC QueueJob.deleteThirdPartySubscription → Stripe cancellation
```

> ⚠️ Subscription deletion (Otoroshi + DB) is **fully SYNC**. Only the payment cancellation is queued.
> The `QueueJob.deleteSubscription` handler (`Operation Subscription/Delete`) still exists but is **dead code** (nothing enqueues it anymore).

---

## 2. API — `deleteApiByQueue`

```
deleteApiByQueue(apiId)                                        🟢 SYNC
├─ find subs(api) → deleteSubscriptions(...)                   🟢 (see §1)
└─ deleteApis([api])
   ├─ api → deleteLogically                                    DB logical
   ├─ (paid plans) → enqueue Operation ThirdPartyProduct ─────────┐
   └─ enqueue Operation Api/Delete ─────────────────────────────┐ │
                                                                 ▼ ▼
   🔵 ASYNC QueueJob.deleteApi:                               🔵 deleteThirdPartyProduct
        posts, issues, doc pages, usage plans (physical),       (Stripe)
        api notifs, demands + step_validators
        → api delete (physical)
```

---

## 3. Usage plan — `deleteUsagePlanByQueue`

```
deleteUsagePlanByQueue(planId, apiId)                         🟢 SYNC
├─ find subs(api, plan) → deleteSubscriptions(...)            🟢 (see §1)
├─ api.possibleUsagePlans -= plan  (save api)                 DB
├─ plan → deleteByIdLogically                                 DB logical
├─ (paid plan) → enqueue Operation ThirdPartyProduct ──────────┐
└─ enqueue Operation UsagePlan/Delete ───────────────────────┐ │
                                                              ▼ ▼
   🔵 ASYNC QueueJob.deleteUsagePlan:                      🔵 deleteThirdPartyProduct
        plan doc pages, demands + step_validators,            (Stripe)
        notifs (action.plan)
        → plan delete (physical)
```

---

## 4. Team — `deleteTeamByQueue`

```
deleteTeamByQueue(teamId)                                     🟢 SYNC
├─ apis = apis owned by the team
├─ subs = subs of the team OR on its apis
├─ for each owned api: deleteSubscriptions(...)               🟢 (see §1)   [sequential mapAsync(1)]
├─ "consumer" subs (team subscribed to external apis): deleteSubscriptions(...) 🟢
├─ deleteApis(apis)  →  N × (api logical + enqueue Api/Delete) 🔵 (see §2)
└─ deleteTeam → team logical + enqueue Operation Team/Delete ──┐
                                                               ▼
   🔵 ASYNC QueueJob.deleteTeam: team notifs → team delete (physical)
   🔵 ASYNC QueueJob.deleteApi : (one per api, see §2)
```

---

## 5. User — `deleteUserByQueue` (current tenant) / `deleteCompleteUserByQueue` (all tenants)

```
deleteUserByQueue(userId, tenant)                            🟢 SYNC
├─ user's personalTeam (in the tenant)
├─ deleteTeamByQueue(personalTeam)                           🟢 (see §4, + enqueues)
├─ if the user has a personal team ONLY in this tenant:
│     deleteUser → user logical + enqueue Operation User/Delete ──┐
│  else: keep the user (exists in another tenant)                 │
├─ deleteUserFromAllTeams   (SQL: remove user from teams.users)   │
├─ deleteUserNotifications  (SQL: notifs + demands + validators)  │
├─ deleteChat               (SQL: messages)                       │
└─ delete userSessions      (SQL)                                 ▼
   🔵 ASYNC QueueJob.deleteUser: TeamInvitation notifs, messages
                                 → user delete (physical)
   🔵 ASYNC QueueJob.deleteTeam: personal team (see §4)

deleteCompleteUserByQueue: same but over ALL personal teams (all tenants),
                           deleteUser always called, SQL cleanups without tenant filter.
```

---

## 6. Tenant — `deleteTenant` (TenantController) ⚠️ special case

```
deleteTenant(id)                                             🟢 SYNC (no queue)
├─ apiRepo.deleteAll()                  (all tenant apis)         DB physical
├─ apiSubscriptionRepo.deleteAll()      (all subs)              DB physical
├─ apiDocumentationPageRepo.deleteAll()                          DB physical
├─ notificationRepo.deleteAll()                                  DB physical
├─ teamRepo.deleteAll()                                          DB physical
├─ tenant.copy(deleted = true)          (ITSELF: logical)        DB logical
└─ users.lastTenant = null                                       DB
```

> ⚠️ Two notable singularities:
> 1. **No Otoroshi cleanup** (the `deleteAll` calls don't remove the keys on the Otoroshi side → orphan keys).
> 2. **100% SYNC, no queue** → it's the worst timeout candidate on a large tenant, and it doesn't even use `DeletionService`.

---

## Summary

| Object | Entity itself | Subs cascade | Otoroshi | Rest of the cleanup |
|---|---|---|---|---|
| Subscription | 🟢 physical | — | 🟢 SYNC | 🔵 payment |
| API | 🟢 logical → 🔵 physical | 🟢 SYNC | 🟢 SYNC | 🔵 (posts/issues/docs/plans/demands) |
| Plan | 🟢 logical → 🔵 physical | 🟢 SYNC | 🟢 SYNC | 🔵 (docs/demands/notifs) |
| Team | 🟢 logical → 🔵 physical | 🟢 SYNC | 🟢 SYNC | 🔵 (notifs) + APIs cascade |
| User | 🟢 logical → 🔵 physical | 🟢 SYNC (via team) | 🟢 SYNC | 🟢 SQL (teams/notifs/chat/sessions) + 🔵 |
| **Tenant** | 🟢 logical | 🟢 deleteAll | ❌ **none** | 🟢 deleteAll (all SYNC, no queue) |

The general pattern: **the entity is logically deleted right away (SYNC) so it disappears from the front, and an `Operation` finalizes the physical deletion + peripheral cleanup in the background (ASYNC)**.
**Subscriptions and Otoroshi are the exception** (fully SYNC) — that's where the timeout risk lies — and the **tenant is entirely outside this model**.
