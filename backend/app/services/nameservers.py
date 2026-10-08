"""Deterministic mock delegation sets.

Real Route 53 delegation sets use four servers, one per TLD, numbered 0-2047:
.com uses 0-511, .net 512-1023, .org 1024-1535 and .co.uk 1536-2047, and the
awsdns-NN shard is the server number within its block divided by 8.
"""

import hashlib

_TLDS = ("com", "net", "org", "co.uk")

NS_TTL = 172800
SOA_TTL = 900


def name_servers_for(zone_id: str) -> list[str]:
    digest = hashlib.sha256(zone_id.encode()).digest()
    servers = []
    for i, tld in enumerate(_TLDS):
        within_block = int.from_bytes(digest[i * 2 : i * 2 + 2], "big") % 512
        number = i * 512 + within_block
        shard = within_block // 8
        servers.append(f"ns-{number}.awsdns-{shard:02d}.{tld}.")
    return servers


def soa_value(name_servers: list[str]) -> str:
    return f"{name_servers[0]} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"
