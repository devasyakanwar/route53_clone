/**
 * Client-side validation. Mirrors backend/app/services/validation.py (same rules, same messages),
 * so inline errors match what the API would return.
 */
import type { RecordType } from './types';

export const MAX_DOMAIN_LENGTH = 253;
export const MAX_TTL = 2147483647;
const MAX_TXT_STRING = 255;
const MAX_TXT_TOTAL = 4000;

const LABEL_RE = /^[a-z0-9_-]{1,63}$/;
const VALUE_LABEL_RE = /^(?!-)[A-Za-z0-9_-]{1,63}(?<!-)$/;
const CAA_RE = /^(\d+)\s+([A-Za-z0-9]+)\s+("(?:[^"\\]|\\.)*")$/;
const CAA_TAGS = ['issue', 'issuewild', 'iodef', 'issuemail', 'issuevmc'];
const HEX_RE = /^[0-9A-Fa-f]+$/;
const NAPTR_RE = /^(\d+)\s+(\d+)\s+"([A-Za-z0-9]*)"\s+"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"\s+(\S+)$/;

// ------------------------------------------------------------------ names

export function validateZoneName(raw: string): string | null {
  let name = raw.trim().toLowerCase();
  if (!name) return 'Enter a domain name.';
  if (name.endsWith('.')) name = name.slice(0, -1);
  if (!name) return "The domain name can't be only a dot.";
  if (name.length > MAX_DOMAIN_LENGTH) return `The domain name can have up to ${MAX_DOMAIN_LENGTH} characters.`;
  for (const label of name.split('.')) {
    if (!label) return "The domain name can't contain empty labels (two dots in a row).";
    if (label.length > 63) return 'Each label in the domain name can have up to 63 characters.';
    if (!LABEL_RE.test(label))
      return 'The domain name can contain only the characters a-z, 0-9, - (hyphen), _ (underscore) and . (period).';
  }
  return null;
}

/** Validates the subdomain part typed in front of the zone suffix. */
export function validateRecordName(subdomain: string, zoneName: string): string | null {
  const sub = subdomain.trim().toLowerCase().replace(/\.$/, '');
  if (!sub) return null;
  const full = `${sub}.${zoneName.replace(/\.$/, '')}`;
  if (full.length > MAX_DOMAIN_LENGTH) return `The record name can have up to ${MAX_DOMAIN_LENGTH} characters.`;
  const labels = sub.split('.');
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label === '*' && i === 0) continue;
    if (!label) return "The record name can't contain empty labels (two dots in a row).";
    if (label.includes('*'))
      return 'A wildcard (*) can only be used as the leftmost label, for example *.example.com.';
    if (label.length > 63) return 'Each label in the record name can have up to 63 characters.';
    if (!LABEL_RE.test(label))
      return 'The record name can contain only the characters a-z, 0-9, - (hyphen), _ (underscore), * (wildcard) and . (period).';
  }
  return null;
}

export function isDomainValue(value: string, allowRoot = false): boolean {
  const v = value.endsWith('.') ? value.slice(0, -1) : value;
  if (!v) return allowRoot && value === '.';
  if (v.length > MAX_DOMAIN_LENGTH) return false;
  return v.split('.').every((label, i) => (label === '*' && i === 0) || VALUE_LABEL_RE.test(label));
}

// ------------------------------------------------------------------ values

const intIn = (token: string | undefined, lo: number, hi: number) =>
  token !== undefined && /^\d+$/.test(token) && Number(token) >= lo && Number(token) <= hi;

function isIPv4(v: string): boolean {
  const parts = v.split('.');
  return (
    parts.length === 4 &&
    parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p === '0' || !p.startsWith('0')))
  );
}

function isIPv6(v: string): boolean {
  if (!/^[0-9A-Fa-f:.]+$/.test(v)) return false;
  let groups = v;
  let extra = 0;
  const lastColon = v.lastIndexOf(':');
  if (v.includes('.')) {
    if (!isIPv4(v.slice(lastColon + 1))) return false;
    groups = v.slice(0, lastColon + 1) + '0:0';
    extra = 0;
  }
  const doubleColon = groups.split('::');
  if (doubleColon.length > 2) return false;
  const hexOk = (g: string) => /^[0-9A-Fa-f]{1,4}$/.test(g);
  if (doubleColon.length === 2) {
    const head = doubleColon[0] ? doubleColon[0].split(':') : [];
    const tail = doubleColon[1] ? doubleColon[1].split(':') : [];
    return head.length + tail.length + extra < 8 && [...head, ...tail].every(hexOk);
  }
  const all = groups.split(':');
  return all.length === 8 && all.every(hexOk);
}

function stringLength(content: string): number {
  return content.replace(/\\(\d{3}|.)/g, 'x').length;
}

export function parseCharacterStrings(value: string): string[] | null {
  const s = value.trim();
  const out: string[] = [];
  let pos = 0;
  const token = /"((?:[^"\\]|\\.)*)"/y;
  while (pos < s.length) {
    token.lastIndex = pos;
    const m = token.exec(s);
    if (!m) return null;
    out.push(m[1]);
    pos = token.lastIndex;
    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++;
  }
  return out.length ? out : null;
}

const TXT_QUOTES = 'Enter the value in quotation marks, for example "v=spf1 -all".';

function validateValue(type: RecordType, v: string): string | null {
  const parts = v.split(/\s+/);
  switch (type) {
    case 'A':
      return isIPv4(v) ? null : `${v} is not a valid IPv4 address. Use the format 192.0.2.235.`;
    case 'AAAA':
      return isIPv6(v) ? null : `${v} is not a valid IPv6 address. Use the format 2001:0db8:85a3:0:0:8a2e:0370:7334.`;
    case 'CNAME':
    case 'NS':
    case 'PTR':
      return isDomainValue(v) ? null : `${v} is not a valid domain name.`;
    case 'TXT':
    case 'SPF': {
      const strings = parseCharacterStrings(v);
      if (!strings) return TXT_QUOTES;
      if (strings.some(s => stringLength(s) > MAX_TXT_STRING))
        return `Each string in a TXT value can have up to ${MAX_TXT_STRING} characters. Split longer values into multiple quoted strings: "part1" "part2".`;
      return null;
    }
    case 'MX':
      return parts.length === 2 && intIn(parts[0], 0, 65535) && isDomainValue(parts[1])
        ? null
        : 'Enter the value in the format priority mailserver, for example 10 mail.example.com. Priority must be 0-65535.';
    case 'SRV':
      return parts.length === 4 && parts.slice(0, 3).every(p => intIn(p, 0, 65535)) && isDomainValue(parts[3], true)
        ? null
        : 'Enter the value in the format priority weight port target, for example 1 10 5269 xmpp-server.example.com. Priority, weight and port must be 0-65535.';
    case 'CAA': {
      const m = CAA_RE.exec(v);
      return m && intIn(m[1], 0, 255) && CAA_TAGS.includes(m[2].toLowerCase())
        ? null
        : 'Enter the value in the format flags tag "value", for example 0 issue "amazon.com". Flags must be 0-255 and tag must be one of issue, issuewild, iodef, issuemail or issuevmc.';
    }
    case 'SOA':
      return parts.length === 7 &&
        isDomainValue(parts[0]) &&
        isDomainValue(parts[1]) &&
        parts.slice(2).every(p => intIn(p, 0, 4294967295))
        ? null
        : 'Enter the value in the format mname rname serial refresh retry expire minimum, for example ns-2048.awsdns-64.net. hostmaster.example.com. 1 7200 900 1209600 86400.';
    case 'DS':
      return parts.length === 4 &&
        intIn(parts[0], 0, 65535) &&
        intIn(parts[1], 0, 255) &&
        intIn(parts[2], 0, 255) &&
        HEX_RE.test(parts[3])
        ? null
        : 'Enter the value in the format key-tag algorithm digest-type digest, for example 12345 13 2 1F987CC6583E92DF0890718C42.';
    case 'NAPTR': {
      const m = NAPTR_RE.exec(v);
      return m && intIn(m[1], 0, 65535) && intIn(m[2], 0, 65535) && isDomainValue(m[6], true)
        ? null
        : 'Enter the value in the format order preference "flags" "services" "regexp" replacement, for example 100 100 "U" "" "!^.*$!sip:info@example.com!" .';
    }
  }
}

/** Validates the Value textarea (one value per line). Returns a single message, prefixed with the line number. */
export function validateValues(type: RecordType, text: string): string | null {
  const lines = text.split('\n').map(l => l.trim());
  const values = lines.filter(Boolean);
  if (!values.length) return 'Enter at least one value.';
  if ((type === 'CNAME' || type === 'SOA') && values.length > 1)
    return `A ${type} record can contain only one value. Enter ${type === 'CNAME' ? 'a domain name' : 'an SOA value'} on a single line.`;
  for (let i = 0; i < values.length; i++) {
    const error = validateValue(type, values[i]);
    if (error) return values.length > 1 ? `Line ${lines.indexOf(values[i]) + 1}: ${error}` : error;
  }
  if ((type === 'TXT' || type === 'SPF') && values.reduce((n, v) => n + v.length, 0) > MAX_TXT_TOTAL)
    return `The total length of all values can be up to ${MAX_TXT_TOTAL} characters.`;
  if (new Set(values).size !== values.length) return "Duplicate values aren't allowed in the same record.";
  return null;
}

export function validateTtl(raw: string): string | null {
  if (!raw.trim()) return 'Enter a TTL.';
  if (!/^\d+$/.test(raw.trim())) return 'TTL must be a whole number of seconds.';
  const n = Number(raw);
  return n < 0 || n > MAX_TTL ? `TTL must be between 0 and ${MAX_TTL} seconds.` : null;
}

export const VPC_ID_RE = /^vpc-[0-9a-f]{8,17}$/;
