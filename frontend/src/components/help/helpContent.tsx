import Box from '@cloudscape-design/components/box';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Link from '@cloudscape-design/components/link';
import type { ReactNode } from 'react';

const DOCS = 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide';

function LearnMore({ links }: { links: [string, string][] }) {
  return (
    <div>
      <h3>Learn more</h3>
      <ul>
        {links.map(([text, href]) => (
          <li key={href}>
            <Link external href={href}>
              {text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const panel = (header: string, body: ReactNode, links: [string, string][] = []) => (
  <HelpPanel header={<h2>{header}</h2>} footer={links.length ? <LearnMore links={links} /> : undefined}>
    {body}
  </HelpPanel>
);

export type HelpKey =
  | 'hostedZones'
  | 'createHostedZone'
  | 'editHostedZone'
  | 'hostedZoneDetails'
  | 'records'
  | 'createRecord'
  | 'editRecord'
  | 'recordName'
  | 'recordTypes'
  | 'value'
  | 'ttl'
  | 'routingPolicy'
  | 'alias'
  | 'nameServers'
  | 'zoneType'
  | 'dashboard'
  | 'healthChecks'
  | 'createHealthCheck'
  | 'whatToMonitor'
  | 'healthCheckAdvanced'
  | 'healthCheckNotification'
  | 'comingSoon';

export const HELP: Record<HelpKey, ReactNode> = {
  hostedZones: panel(
    'Hosted zones',
    <>
      <p>
        A hosted zone is a container for records, and records contain information about how you want to route
        traffic for a specific domain, such as example.com, and its subdomains (acme.example.com, zenith.example.com).
        A hosted zone and the corresponding domain have the same name.
      </p>
      <p>There are two types of hosted zones:</p>
      <ul>
        <li>
          <b>Public hosted zones</b> contain records that specify how you want to route traffic on the internet.
        </li>
        <li>
          <b>Private hosted zones</b> contain records that specify how you want to route traffic in an Amazon VPC.
        </li>
      </ul>
    </>,
    [['Working with hosted zones', `${DOCS}/hosted-zones-working-with.html`]],
  ),
  createHostedZone: panel(
    'Create hosted zone',
    <>
      <p>
        When you create a hosted zone, Route 53 automatically creates a name server (NS) record and a start of
        authority (SOA) record for the zone. The NS record identifies the four name servers that you give to your
        registrar or your DNS resolver so that queries are routed to Route 53 name servers.
      </p>
      <h3>Domain name</h3>
      <p>
        Enter the name of the domain that you want to route traffic for. You can use the characters a-z, 0-9, - and _.
        Specify a fully qualified domain name, for example <b>www.example.com</b>. The trailing dot is optional.
      </p>
      <h3>Description</h3>
      <p>Optional. Lets you distinguish hosted zones that have the same name.</p>
    </>,
    [['Creating a public hosted zone', `${DOCS}/CreatingHostedZone.html`]],
  ),
  editHostedZone: panel(
    'Edit hosted zone',
    <p>
      You can change the description and tags of a hosted zone. You can&apos;t change the domain name or the type of
      a hosted zone; to do that, create a new hosted zone and migrate the records.
    </p>,
    [['Working with hosted zones', `${DOCS}/hosted-zones-working-with.html`]],
  ),
  hostedZoneDetails: panel(
    'Hosted zone details',
    <>
      <p>
        This page shows the settings of a hosted zone and the records in it. Choose a record to see its details in
        the split panel.
      </p>
      <p>
        <b>Name servers</b>: To route traffic for your domain to Route 53, update the name server records with your
        domain registrar to use these four name servers.
      </p>
    </>,
    [['NS and SOA records that Route 53 creates', `${DOCS}/SOA-NSrecords.html`]],
  ),
  records: panel(
    'Records',
    <>
      <p>
        Records define how you want to route traffic for a domain. Each record includes the name of a domain or a
        subdomain, a record type, and other information applicable to the record type.
      </p>
      <p>
        You can&apos;t delete the NS and SOA records that Route 53 created for the hosted zone, but you can edit
        them.
      </p>
    </>,
    [
      ['Working with records', `${DOCS}/rrsets-working-with.html`],
      ['Supported DNS record types', `${DOCS}/ResourceRecordTypes.html`],
    ],
  ),
  createRecord: panel(
    'Quick create record',
    <>
      <p>
        Specify the settings for one or more records. To create several records at once, choose{' '}
        <b>Add another record</b>. Route 53 creates all of them in a single change batch: either all records are
        created or none are.
      </p>
      <p>
        Choose <b>Switch to wizard</b> for a step-by-step flow that helps you choose a routing policy.
      </p>
    </>,
    [['Creating records by using the console', `${DOCS}/resource-record-sets-creating.html`]],
  ),
  editRecord: panel(
    'Edit record',
    <p>
      You can change the values, TTL and routing settings of a record. You can&apos;t change the record name or type;
      to rename a record, delete it and create a new one.
    </p>,
    [['Editing records', `${DOCS}/resource-record-sets-editing.html`]],
  ),
  recordName: panel(
    'Record name',
    <>
      <p>
        Enter the name of the domain or subdomain that you want to route traffic for. Keep blank to create a record
        for the root domain.
      </p>
      <p>
        You can use an asterisk (*) as the leftmost label to create a wildcard record, for example{' '}
        <b>*.example.com</b>.
      </p>
    </>,
    [['Domain name format', `${DOCS}/DomainNameFormat.html`]],
  ),
  recordTypes: panel(
    'Record types',
    <>
      <p>The record type determines the kind of information you store in the record:</p>
      <ul>
        <li><b>A</b> – IPv4 address, for example 192.0.2.235</li>
        <li><b>AAAA</b> – IPv6 address</li>
        <li><b>CAA</b> – which certificate authorities can issue certificates</li>
        <li><b>CNAME</b> – another domain name; not allowed at the zone apex</li>
        <li><b>MX</b> – mail servers, with priority</li>
        <li><b>NS</b> – name servers for a subdomain delegation</li>
        <li><b>PTR</b> – maps an IP address to a domain name</li>
        <li><b>SRV</b> – priority, weight, port and target of a service</li>
        <li><b>TXT</b> – text strings in quotation marks</li>
      </ul>
    </>,
    [['Supported DNS record types', `${DOCS}/ResourceRecordTypes.html`]],
  ),
  value: panel(
    'Value',
    <p>
      Enter the values for the record. The format depends on the record type. To enter multiple values, put each
      value on a separate line.
    </p>,
    [['Values for records', `${DOCS}/resource-record-sets-values.html`]],
  ),
  ttl: panel(
    'TTL (seconds)',
    <>
      <p>
        The amount of time, in seconds, that you want DNS recursive resolvers to cache information about this record.
        If you specify a longer value (for example, 172800 seconds, or two days), you pay less for Route 53 because
        recursive resolvers send requests to Route 53 less often. However, it takes longer for changes to the record
        to take effect.
      </p>
      <p>Recommended values: 60 to 172800 (two days).</p>
    </>,
  ),
  routingPolicy: panel(
    'Routing policy',
    <>
      <p>The routing policy determines how Route 53 responds to queries:</p>
      <ul>
        <li><b>Simple</b> – a single resource</li>
        <li><b>Weighted</b> – multiple resources in proportions that you specify</li>
        <li><b>Geolocation</b> – based on the location of users</li>
        <li><b>Latency</b> – the Region with the best latency</li>
        <li><b>Failover</b> – active-passive failover</li>
        <li><b>Multivalue answer</b> – up to eight healthy records selected at random</li>
        <li><b>IP-based</b> – based on the IP addresses that queries originate from</li>
        <li><b>Geoproximity</b> – based on the location of your resources</li>
      </ul>
      <p>
        For every policy except simple, enter a <b>Record ID</b> that is unique among records with the same name and
        type. In this clone the routing settings are stored but not evaluated.
      </p>
    </>,
    [['Choosing a routing policy', `${DOCS}/routing-policy.html`]],
  ),
  alias: panel(
    'Alias',
    <p>
      Alias records let you route traffic to selected AWS resources, such as CloudFront distributions and Amazon S3
      buckets, or to another record in the same hosted zone. Alias records don&apos;t have a TTL; Route 53 uses the TTL
      of the target.
    </p>,
    [['Choosing between alias and non-alias records', `${DOCS}/resource-record-sets-choosing-alias-non-alias.html`]],
  ),
  nameServers: panel(
    'Name servers',
    <p>
      The four name servers in the delegation set for this hosted zone. To make Route 53 the DNS service for your
      domain, update the name servers with your registrar to use these values.
    </p>,
  ),
  zoneType: panel(
    'Type',
    <p>
      A public hosted zone determines how traffic is routed on the internet. A private hosted zone determines how
      traffic is routed within an Amazon VPC; you must associate at least one VPC.
    </p>,
  ),
  dashboard: panel(
    'Route 53 dashboard',
    <>
      <p>
        The dashboard summarizes the Route 53 resources in your account: hosted zones for DNS management, traffic
        policies, health checks for availability monitoring, and registered domains.
      </p>
      <p>Choose a resource count to go to that resource, or use the buttons to create new resources.</p>
    </>,
    [['What is Amazon Route 53?', `${DOCS}/Welcome.html`]],
  ),
  healthChecks: panel(
    'Health checks',
    <>
      <p>Route 53 health checks monitor the health and performance of your resources. A health check can monitor:</p>
      <ul>
        <li>
          <b>An endpoint</b>, such as a web server, specified by IP address or domain name
        </li>
        <li>
          <b>The status of other health checks</b> (a calculated health check)
        </li>
        <li>
          <b>The state of a CloudWatch alarm</b>
        </li>
      </ul>
      <p>
        You can associate a health check with records to use DNS failover, and configure an alarm to be notified
        when the health check status changes. In this clone, statuses are simulated: endpoints in 203.0.113.0/24 or
        with a host name that starts with &quot;down.&quot; are reported as unhealthy.
      </p>
    </>,
    [['Creating Route 53 health checks', `${DOCS}/health-checks-creating.html`]],
  ),
  createHealthCheck: panel(
    'Configure health check',
    <>
      <p>
        Specify a name and what you want the health check to monitor. Health checkers in several AWS Regions send
        requests to the endpoint; the endpoint is considered healthy if more than 18% of health checkers report it
        healthy.
      </p>
    </>,
    [['Values that you specify when you create a health check', `${DOCS}/health-checks-creating-values.html`]],
  ),
  whatToMonitor: panel(
    'What to monitor',
    <ul>
      <li>
        <b>Endpoint</b> – Route 53 sends HTTP, HTTPS or TCP requests to an IP address or domain name.
      </li>
      <li>
        <b>Status of other health checks (calculated health check)</b> – healthy when a minimum number of the
        selected health checks are healthy.
      </li>
      <li>
        <b>State of CloudWatch alarm</b> – based on the data stream of a CloudWatch alarm.
      </li>
    </ul>,
  ),
  healthCheckAdvanced: panel(
    'Advanced configuration',
    <>
      <p>
        <b>Request interval</b>: the number of seconds between health checks (30 for standard, 10 for fast). You
        can&apos;t change it after you create the health check.
      </p>
      <p>
        <b>Failure threshold</b>: the number of consecutive checks that an endpoint must pass or fail to change its
        status.
      </p>
      <p>
        <b>String matching</b>: Route 53 searches the first 5,120 bytes of the response body for the string.
      </p>
      <p>
        <b>Invert health check status</b> reports healthy endpoints as unhealthy and vice versa.{' '}
        <b>Disable health check</b> stops checks; Route 53 considers a disabled health check to be healthy.
      </p>
    </>,
  ),
  healthCheckNotification: panel(
    'Get notified when health check fails',
    <p>
      Route 53 can create a CloudWatch alarm that sends a notification through Amazon SNS when the health check
      status is unhealthy. In this clone, the alarm and topic are stored but no email is sent.
    </p>,
    [['Monitoring health check status and getting notifications', `${DOCS}/health-checks-monitor-view-status.html`]],
  ),
  comingSoon: panel(
    'Route 53',
    <Box variant="p">This feature is coming soon to this Route 53 clone. Only hosted zones and records are implemented.</Box>,
  ),
};
