"""BIND zone file import / export (PLAN §6, bonus)."""

from __future__ import annotations

from typing import Any

import dns.exception
import dns.name
import dns.rdatatype
import dns.zone

from app.errors import invalid_input
from app.models import RECORD_TYPES, HostedZone, RecordSet
from app.schemas.records import RecordSetIn
from app.services.validation import escape_name


def parse_zone_file(text: str, origin: str) -> tuple[list[RecordSetIn], list[str]]:
    """Parse BIND text into record sets. SOA and apex NS are skipped, as the console does."""
    if not text.strip():
        raise invalid_input("Paste the contents of a zone file or choose a file to upload.", "zone_file")
    try:
        zone = dns.zone.from_text(text, origin=origin, relativize=False, check_origin=False)
    except dns.exception.DNSException as e:
        raise invalid_input(f"The zone file couldn't be parsed: {e}", "zone_file") from None
    except Exception as e:  # dnspython raises KeyError/ValueError for some malformed inputs
        raise invalid_input(f"The zone file couldn't be parsed: {e}", "zone_file") from None

    apex = dns.name.from_text(origin)
    record_sets: list[RecordSetIn] = []
    skipped: list[str] = []
    for name, rdataset in zone.iterate_rdatasets():
        rtype = dns.rdatatype.to_text(rdataset.rdtype)
        fqdn = name.to_text()
        if rtype == "SOA":
            skipped.append(f"{fqdn} SOA (Route 53 manages the SOA record)")
            continue
        if rtype == "NS" and name == apex:
            skipped.append(f"{fqdn} NS (Route 53 manages the apex NS record)")
            continue
        if rtype not in RECORD_TYPES:
            skipped.append(f"{fqdn} {rtype} (record type not supported)")
            continue
        record_sets.append(
            RecordSetIn(
                name=fqdn,
                type=rtype,
                ttl=rdataset.ttl,
                values=[rd.to_text() for rd in rdataset],
            )
        )
    record_sets.sort(key=lambda r: (r.name != origin, r.name, r.type))
    return record_sets, skipped


def export_bind(zone: HostedZone, rows: list[RecordSet]) -> str:
    lines = [
        f"; Zone file for {zone.name}",
        f"; Exported from Route 53 hosted zone {zone.id}",
        f"$ORIGIN {zone.name}",
        "$TTL 300",
        "",
    ]
    for row in rows:
        owner = row.name
        if row.alias_target:
            target = row.alias_target.get("dns_name", "")
            lines.append(f"; {owner} {row.type} ALIAS {target} (alias records can't be expressed in BIND format)")
            continue
        policy = "" if row.routing_policy == "SIMPLE" else f" ; {row.routing_policy} {row.set_identifier}"
        for value in row.values:
            lines.append(f"{owner}\t{row.ttl}\tIN\t{row.type}\t{value}{policy}")
    return "\n".join(lines) + "\n"


def export_zones_json(zones: list[tuple[HostedZone, list[RecordSet]]]) -> dict[str, Any]:
    """Several hosted zones with their record sets, shaped like ListHostedZones + ListResourceRecordSets."""
    return {
        "HostedZones": [
            {
                "Id": f"/hostedzone/{zone.id}",
                "Name": zone.name,
                "CallerReference": zone.caller_reference,
                "Config": {"Comment": zone.comment or "", "PrivateZone": zone.is_private},
                "ResourceRecordSetCount": zone.record_count,
                "DelegationSet": {"NameServers": list(zone.name_servers)},
                "VPCs": [{"VPCId": v.vpc_id, "VPCRegion": v.vpc_region} for v in zone.vpcs],
                "Tags": [{"Key": t.key, "Value": t.value} for t in zone.tags],
                "ResourceRecordSets": export_json(rows)["ResourceRecordSets"],
            }
            for zone, rows in zones
        ]
    }


def export_zones_bind(zones: list[tuple[HostedZone, list[RecordSet]]]) -> str:
    return "\n".join(export_bind(zone, rows) for zone, rows in zones)


def export_json(rows: list[RecordSet]) -> dict[str, Any]:
    """Shaped like the ListResourceRecordSets API response."""
    sets: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {"Name": escape_name(row.name), "Type": row.type}
        if row.set_identifier:
            item["SetIdentifier"] = row.set_identifier
        if row.weight is not None:
            item["Weight"] = row.weight
        if row.region:
            item["Region"] = row.region
        if row.failover:
            item["Failover"] = row.failover
        if row.geo_location:
            item["GeoLocation"] = {k[:1].upper() + k[1:] + "Code": v for k, v in row.geo_location.items()}
        if row.multivalue:
            item["MultiValueAnswer"] = True
        if row.cidr_routing:
            item["CidrRoutingConfig"] = {
                "CollectionId": row.cidr_routing.get("collection_id"),
                "LocationName": row.cidr_routing.get("location_name"),
            }
        if row.health_check_id:
            item["HealthCheckId"] = row.health_check_id
        if row.alias_target:
            item["AliasTarget"] = {
                "HostedZoneId": row.alias_target.get("hosted_zone_id", ""),
                "DNSName": row.alias_target.get("dns_name", ""),
                "EvaluateTargetHealth": bool(row.alias_target.get("evaluate_target_health")),
            }
        else:
            item["TTL"] = row.ttl
            item["ResourceRecords"] = [{"Value": v} for v in row.values]
        sets.append(item)
    return {"ResourceRecordSets": sets, "IsTruncated": False, "MaxItems": str(max(len(sets), 300))}
