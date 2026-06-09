#!/usr/bin/env python3
"""Migrate a Daikoku test seed (ndjson) from the legacy parent/child api-key
aggregation model to the Keyring model.

Mirrors evolution_1900 :
 - one keyring per ROOT subscription (parent == null), id = root subscription id,
   carrying apiKey / integrationToken / bearerToken / rotation + team + the
   otoroshiSettings binding ({type:Otoroshi,id} when the plan targets an
   otoroshi instance, {type:Internal} otherwise, e.g. the admin api).
 - every subscription gets `keyring` (= own id for a root, = parent id for a
   child) and loses `parent` + the fields that moved to the keyring.
 - subscription_demands / ApiSubscription notifications get their
   parentSubscription(Id) rewritten to the matching keyring id.

Idempotent : a file whose subscriptions already carry `keyring` is left
untouched. Usage: python3 migrate_seed_to_keyring.py <file.ndjson> [...]
"""
import json
import sys

MOVED_TO_KEYRING = ("apiKey", "integrationToken", "bearerToken", "rotation")


def migrate(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            rows.append(json.loads(line))

    plans = {r["payload"]["_id"]: r["payload"]
             for r in rows if r.get("type") == "usage_plans"}
    subs = [r["payload"] for r in rows if r.get("type") == "api_subscriptions"]

    if not subs:
        print(f"  {path}: aucune souscription, ignoré")
        return False
    if all("keyring" in s for s in subs):
        print(f"  {path}: déjà migré (subs ont déjà keyring), ignoré")
        return False

    # sub id -> the keyring id it will reference (root => own id, child => parent)
    keyring_of = {}
    for s in subs:
        keyring_of[s["_id"]] = s["parent"] if s.get("parent") else s["_id"]

    # build one keyring per root subscription
    keyrings = []
    for s in subs:
        if s.get("parent"):
            continue  # children share their parent's keyring
        plan = plans.get(s.get("plan"), {})
        oto = (plan.get("otoroshiTarget") or {}).get("otoroshiSettings")
        binding = ({"type": "Otoroshi", "id": oto} if oto
                   else {"type": "Internal"})
        keyring = {
            "_id": s["_id"],
            "_tenant": s["_tenant"],
            "team": s["team"],
            "_deleted": s.get("_deleted", False),
            "apiKey": s["apiKey"],
            "otoroshiSettings": binding,
            "createdAt": s["createdAt"],
            "rotation": s.get("rotation"),
            "integrationToken": s["integrationToken"],
            "bearerToken": s.get("bearerToken"),
            "thirdPartySubscriptionInformations":
                s.get("thirdPartySubscriptionInformations"),
        }
        keyrings.append({"type": "keyrings", "payload": keyring})

    # mutate subscriptions in place : add keyring, drop parent + moved fields
    for s in subs:
        s["keyring"] = keyring_of[s["_id"]]
        s.pop("parent", None)
        for f in MOVED_TO_KEYRING:
            s.pop(f, None)

    # rewrite demands / notifications still pointing at a parent subscription
    for r in rows:
        if r.get("type") == "subscription_demands":
            p = r["payload"]
            parent = p.pop("parentSubscription", None)
            if parent and "keyring" not in p:
                p["keyring"] = keyring_of.get(parent, parent)
        elif r.get("type") == "notifications":
            action = r["payload"].get("action") or {}
            parent = action.pop("parentSubscriptionId", None)
            if parent and "keyring" not in action:
                action["keyring"] = keyring_of.get(parent, parent)

    # write back : insert the keyrings right before the first api_subscription
    out = []
    inserted = False
    for r in rows:
        if r.get("type") == "api_subscriptions" and not inserted:
            out.extend(keyrings)
            inserted = True
        out.append(r)
    if not inserted:  # safety, should not happen since subs is non-empty
        out.extend(keyrings)

    with open(path, "w", encoding="utf-8") as fh:
        for r in out:
            fh.write(json.dumps(r, separators=(",", ":"), ensure_ascii=False))
            fh.write("\n")

    print(f"  {path}: {len(keyrings)} keyrings créés, {len(subs)} subs migrées")
    return True


if __name__ == "__main__":
    for p in sys.argv[1:]:
        migrate(p)
