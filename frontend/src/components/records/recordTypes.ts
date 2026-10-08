import type { RecordType, RoutingPolicy } from '@/lib/types';
import { ROUTING_POLICY_LABELS } from '@/lib/format';

export interface RecordTypeInfo {
  type: RecordType;
  description: string;
  placeholder: string;
  /** Shown in the quick-create type list; SOA can only be edited. */
  creatable: boolean;
  aliasable: boolean;
}

export const RECORD_TYPE_INFO: RecordTypeInfo[] = [
  { type: 'A', description: 'Routes traffic to an IPv4 address and some AWS resources', placeholder: '192.0.2.235', creatable: true, aliasable: true },
  { type: 'AAAA', description: 'Routes traffic to an IPv6 address and some AWS resources', placeholder: '2001:0db8:85a3:0:0:8a2e:0370:7334', creatable: true, aliasable: true },
  { type: 'CAA', description: 'Restricts CAs that can create SSL/TLS certifications for the domain', placeholder: '0 issue "amazon.com"', creatable: true, aliasable: true },
  { type: 'CNAME', description: 'Routes traffic to another domain name and to some AWS resources', placeholder: 'www.example.com', creatable: true, aliasable: true },
  { type: 'DS', description: 'Delegation signer, used to establish a chain of trust for DNSSEC', placeholder: '12345 13 2 1F987CC6583E92DF0890718C42', creatable: true, aliasable: false },
  { type: 'MX', description: 'Specifies mail servers', placeholder: '10 mail.example.com', creatable: true, aliasable: true },
  { type: 'NAPTR', description: 'Is used by DDDS applications', placeholder: '100 100 "U" "E2U+sip" "!^.*$!sip:info@example.com!" .', creatable: true, aliasable: true },
  { type: 'NS', description: 'Name servers for a hosted zone', placeholder: 'ns-1.awsdns-01.org', creatable: true, aliasable: false },
  { type: 'PTR', description: 'Maps an IP address to a domain name', placeholder: 'hostname.example.com', creatable: true, aliasable: true },
  { type: 'SOA', description: 'Start of authority record', placeholder: 'ns-2048.awsdns-64.net. hostmaster.example.com. 1 7200 900 1209600 86400', creatable: false, aliasable: false },
  { type: 'SPF', description: 'Not recommended', placeholder: '"v=spf1 ip4:192.168.0.1/16 -all"', creatable: true, aliasable: true },
  { type: 'SRV', description: 'Application-specific values that identify servers', placeholder: '1 10 5269 xmpp-server.example.com', creatable: true, aliasable: true },
  { type: 'TXT', description: 'Used to verify email senders and for application-specific values', placeholder: '"v=spf1 include:_spf.example.com ~all"', creatable: true, aliasable: true },
];

export const typeInfo = (t: RecordType): RecordTypeInfo => RECORD_TYPE_INFO.find(i => i.type === t)!;

export const recordTypeOptions = (includeSoa = false) =>
  RECORD_TYPE_INFO.filter(i => i.creatable || includeSoa).map(i => ({
    value: i.type,
    label: `${i.type} – ${i.description}`,
  }));

export const ROUTING_POLICY_OPTIONS = (Object.keys(ROUTING_POLICY_LABELS) as RoutingPolicy[]).map(p => ({
  value: p,
  label: p === 'SIMPLE' ? 'Simple routing' : ROUTING_POLICY_LABELS[p],
}));

export const ROUTING_POLICY_DESCRIPTIONS: Record<RoutingPolicy, string> = {
  SIMPLE: 'Use for a single resource that performs a given function for your domain.',
  WEIGHTED: 'Use to route traffic to multiple resources in proportions that you specify.',
  GEOLOCATION: 'Use when you want to route traffic based on the location of your users.',
  LATENCY: 'Use when you have resources in multiple AWS Regions and you want to route traffic to the Region that provides the best latency.',
  FAILOVER: 'Use when you want to configure active-passive failover.',
  MULTIVALUE: 'Use when you want Route 53 to respond to DNS queries with up to eight healthy records selected at random.',
  IP_BASED: 'Use when you want to route traffic based on the location of your users, and have the IP addresses that the traffic originates from.',
  GEOPROXIMITY: 'Use when you want to route traffic based on the location of your resources and, optionally, shift traffic from resources in one location to resources in another.',
};

export interface AliasEndpoint {
  value: string;
  label: string;
  hostedZoneId: string;
  needsRegion: boolean;
  placeholder: string;
}

export const ALIAS_ENDPOINTS: AliasEndpoint[] = [
  { value: 'apigateway', label: 'Alias to API Gateway API', hostedZoneId: 'Z1UJRXOUMOOFQ8', needsRegion: true, placeholder: 'd-abcde12345.execute-api.us-east-1.amazonaws.com' },
  { value: 'vpce', label: 'Alias to VPC endpoint', hostedZoneId: 'Z7HUB22UULQXV', needsRegion: true, placeholder: 'vpce-0123456789abcdef0-abcdefgh.vpce-svc-0123456789abcdef0.us-east-1.vpce.amazonaws.com' },
  { value: 'cloudfront', label: 'Alias to CloudFront distribution', hostedZoneId: 'Z2FDTNDATAQYW2', needsRegion: false, placeholder: 'd111111abcdef8.cloudfront.net' },
  { value: 'elasticbeanstalk', label: 'Alias to Elastic Beanstalk environment', hostedZoneId: 'Z117KPS5GTRQ2G', needsRegion: true, placeholder: 'my-env.us-east-1.elasticbeanstalk.com' },
  { value: 'alb', label: 'Alias to Application and Classic Load Balancer', hostedZoneId: 'Z35SXDOTRQ7X7K', needsRegion: true, placeholder: 'dualstack.my-alb-1234567890.us-east-1.elb.amazonaws.com' },
  { value: 'nlb', label: 'Alias to Network Load Balancer', hostedZoneId: 'Z26RNL4JYFTOTI', needsRegion: true, placeholder: 'my-nlb-1234567890abcdef.elb.us-east-1.amazonaws.com' },
  { value: 'apprunner', label: 'Alias to App Runner application', hostedZoneId: 'Z01915732ZBZKC8D32TPT', needsRegion: true, placeholder: 'abcdefgh.us-east-1.awsapprunner.com' },
  { value: 's3', label: 'Alias to S3 website endpoint', hostedZoneId: 'Z3AQBSTGFYJSTF', needsRegion: true, placeholder: 's3-website-us-east-1.amazonaws.com' },
  { value: 'record', label: 'Alias to another record in this hosted zone', hostedZoneId: '', needsRegion: false, placeholder: 'www.example.com' },
];

export const aliasEndpoint = (value: string | null | undefined): AliasEndpoint | undefined =>
  ALIAS_ENDPOINTS.find(e => e.value === value);

export const AWS_REGIONS: { value: string; label: string }[] = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'af-south-1', label: 'Africa (Cape Town)' },
  { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ca-central-1', label: 'Canada (Central)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-west-3', label: 'Europe (Paris)' },
  { value: 'eu-north-1', label: 'Europe (Stockholm)' },
  { value: 'me-south-1', label: 'Middle East (Bahrain)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

export const regionOptions = AWS_REGIONS.map(r => ({ value: r.value, label: `${r.label}`, description: r.value }));

export const GEO_LOCATIONS: { value: string; label: string; kind: 'continent' | 'country' | 'default' }[] = [
  { value: '*', label: 'Default', kind: 'default' },
  { value: 'AF', label: 'Africa', kind: 'continent' },
  { value: 'AN', label: 'Antarctica', kind: 'continent' },
  { value: 'AS', label: 'Asia', kind: 'continent' },
  { value: 'EU', label: 'Europe', kind: 'continent' },
  { value: 'NA', label: 'North America', kind: 'continent' },
  { value: 'OC', label: 'Oceania', kind: 'continent' },
  { value: 'SA', label: 'South America', kind: 'continent' },
  { value: 'AU', label: 'Australia', kind: 'country' },
  { value: 'BR', label: 'Brazil', kind: 'country' },
  { value: 'CA', label: 'Canada', kind: 'country' },
  { value: 'DE', label: 'Germany', kind: 'country' },
  { value: 'FR', label: 'France', kind: 'country' },
  { value: 'GB', label: 'United Kingdom', kind: 'country' },
  { value: 'IN', label: 'India', kind: 'country' },
  { value: 'JP', label: 'Japan', kind: 'country' },
  { value: 'SG', label: 'Singapore', kind: 'country' },
  { value: 'US', label: 'United States', kind: 'country' },
];

export const MOCK_CIDR_COLLECTIONS = [
  { value: 'c-office-ranges', label: 'office-ranges', locations: ['headquarters', 'branch-office'] },
  { value: 'c-isp-ranges', label: 'isp-ranges', locations: ['isp-east', 'isp-west'] },
];
