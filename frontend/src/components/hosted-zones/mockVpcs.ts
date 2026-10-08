import { AWS_REGIONS } from '@/components/records/recordTypes';

/** Mock VPCs per Region for private hosted zone associations (no AWS account involved). */
function hex(seed: string, length: number): string {
  let h = 2166136261;
  let out = '';
  while (out.length < length) {
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
    seed += out.length;
  }
  return out.slice(0, length);
}

export function mockVpcsFor(region: string): { value: string; label: string; description: string }[] {
  if (!AWS_REGIONS.some(r => r.value === region)) return [];
  const base = region === 'us-east-1' ? ['0a1b2c3d'] : [hex(region + 'default', 8)];
  return [
    { value: `vpc-${base[0]}`, label: `vpc-${base[0]} (default)`, description: '172.31.0.0/16' },
    { value: `vpc-0${hex(region + 'prod', 16)}`, label: `vpc-0${hex(region + 'prod', 16)} (prod-vpc)`, description: '10.0.0.0/16' },
    { value: `vpc-0${hex(region + 'stage', 16)}`, label: `vpc-0${hex(region + 'stage', 16)} (staging-vpc)`, description: '10.1.0.0/16' },
  ];
}
