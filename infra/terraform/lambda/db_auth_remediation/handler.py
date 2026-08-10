"""Self-heal the #198 stale-password failure.

Triggered (via SNS) when the `empress-backend-db-auth-failure` CloudWatch alarm
enters ALARM: the backend logged `password authentication failed` because ECS
tasks still hold the pre-rotation RDS master password. Force a new deployment so
ECS re-pulls the current secret at container start.

Keyed off our own log-metric alarm (ground truth: auth is actually failing)
rather than a CloudTrail RotationSucceeded event pattern, which silently no-ops
if it drifts. A per-service cooldown prevents a redeploy storm while a fix rolls
out.
"""

import json
import os
import time

import boto3

ecs = boto3.client("ecs")

CLUSTER = os.environ["CLUSTER"]
SERVICES = [s.strip() for s in os.environ["SERVICES"].split(",") if s.strip()]
COOLDOWN_SECONDS = int(os.environ.get("COOLDOWN_SECONDS", "900"))


def _recently_deployed(service):
    """True if the service's primary deployment started within the cooldown."""
    resp = ecs.describe_services(cluster=CLUSTER, services=[service])
    services = resp.get("services", [])
    if not services:
        return False
    now = time.time()
    for dep in services[0].get("deployments", []):
        if dep.get("status") == "PRIMARY":
            created = dep.get("createdAt")
            if created and (now - created.timestamp()) < COOLDOWN_SECONDS:
                return True
    return False


def handler(event, context):
    results = {}
    for service in SERVICES:
        if _recently_deployed(service):
            results[service] = "skipped: deployment within cooldown"
            continue
        ecs.update_service(cluster=CLUSTER, service=service, forceNewDeployment=True)
        results[service] = "force-new-deployment triggered"
    print(json.dumps({"cluster": CLUSTER, "results": results}))
    return results
