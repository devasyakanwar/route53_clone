from pydantic import BaseModel


class DashboardSummary(BaseModel):
    hosted_zones: int
    public_hosted_zones: int
    private_hosted_zones: int
    record_sets: int
    # Sections that are "Coming soon" report zero.
    traffic_policies: int = 0
    policy_records: int = 0
    registered_domains: int = 0
    pending_domain_requests: int = 0
