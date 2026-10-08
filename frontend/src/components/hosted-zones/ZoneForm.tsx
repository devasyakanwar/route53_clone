'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { TagEditorProps } from '@cloudscape-design/components/tag-editor';
import Textarea from '@cloudscape-design/components/textarea';
import Tiles from '@cloudscape-design/components/tiles';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { InfoLink } from '@/components/common/InfoLink';
import { fromEditorTags, TagEditorField, toEditorTags } from '@/components/common/TagEditorField';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { regionOptions } from '@/components/records/recordTypes';
import { useZones } from '@/hooks/useZones';
import { api, ApiError, errorMessage } from '@/lib/api';
import { displayName } from '@/lib/format';
import type { HostedZoneDetail } from '@/lib/types';
import { validateZoneName, VPC_ID_RE } from '@/lib/validators';
import { mockVpcsFor } from './mockVpcs';

interface VpcRow {
  region: string;
  vpcId: string;
}

interface Errors {
  name?: string;
  comment?: string;
  vpcs?: string;
  vpcRows?: Record<number, { region?: string; vpcId?: string }>;
  tags?: string;
  form?: string;
}

const MAX_COMMENT = 256;

function scrollToFirstError() {
  requestAnimationFrame(() => {
    const el = document.querySelector('[data-has-error="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  });
}

export function ZoneForm({ mode, zone }: { mode: 'create' | 'edit'; zone?: HostedZoneDetail }) {
  const router = useRouter();
  const notify = useNotify();
  const { zones, mutate: mutateZones } = useZones();
  const [name, setName] = useState(zone ? displayName(zone.name) : '');
  const [comment, setComment] = useState(zone?.comment ?? '');
  const [type, setType] = useState<'public' | 'private'>(zone?.private_zone ? 'private' : 'public');
  const [vpcs, setVpcs] = useState<VpcRow[]>([{ region: 'us-east-1', vpcId: '' }]);
  const [tags, setTags] = useState<ReadonlyArray<TagEditorProps.Tag>>(zone ? toEditorTags(zone.tags) : []);
  const [tagsValid, setTagsValid] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const isEdit = mode === 'edit';
  const normalized = name.trim().toLowerCase().replace(/\.$/, '');
  const duplicate =
    !isEdit && normalized && zones?.some(z => displayName(z.name) === normalized && z.private_zone === (type === 'private'));
  const cancelHref = isEdit && zone ? `/route53/v2/hostedzones/${zone.id}` : '/route53/v2/hostedzones';

  const validate = (): Errors => {
    const e: Errors = {};
    if (!isEdit) {
      const nameError = validateZoneName(name);
      if (nameError) e.name = nameError;
    }
    if (comment.length > MAX_COMMENT) e.comment = `The description can have up to ${MAX_COMMENT} characters.`;
    if (!isEdit && type === 'private') {
      const rows: Errors['vpcRows'] = {};
      vpcs.forEach((v, i) => {
        if (!v.region) rows[i] = { ...rows[i], region: 'Choose a Region.' };
        if (!v.vpcId) rows[i] = { ...rows[i], vpcId: 'Choose a VPC.' };
        else if (!VPC_ID_RE.test(v.vpcId)) rows[i] = { ...rows[i], vpcId: `${v.vpcId} is not a valid VPC ID.` };
      });
      const keys = vpcs.map(v => `${v.region}/${v.vpcId}`);
      keys.forEach((k, i) => {
        if (vpcs[i].vpcId && keys.indexOf(k) !== i) rows[i] = { ...rows[i], vpcId: 'Each VPC can be associated only once.' };
      });
      if (!vpcs.length) e.vpcs = 'A private hosted zone must be associated with at least one VPC.';
      if (Object.keys(rows).length) e.vpcRows = rows;
    }
    if (!tagsValid) e.tags = 'Fix the errors in the tags.';
    return e;
  };

  const applyServerError = (err: unknown) => {
    if (err instanceof ApiError && err.field) {
      const field = err.field;
      if (field === 'name') return setErrors({ name: err.message });
      if (field === 'comment') return setErrors({ comment: err.message });
      if (field.startsWith('vpcs')) {
        const m = /^vpcs\[(\d+)\]/.exec(field);
        return setErrors(m ? { vpcRows: { [Number(m[1])]: { vpcId: err.message } } } : { vpcs: err.message });
      }
      if (field.startsWith('tags')) return setErrors({ tags: err.message });
    }
    setErrors({ form: errorMessage(err) });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      scrollToFirstError();
      return;
    }
    setBusy(true);
    try {
      if (isEdit && zone) {
        await api.updateZone(zone.id, comment.trim() || null);
        await api.replaceTags(zone.id, fromEditorTags(tags));
        notify.success({ header: `${displayName(zone.name)} was successfully updated.`, timeout: 8000 });
        await mutateZones();
        router.push(`/route53/v2/hostedzones/${zone.id}`);
      } else {
        const res = await api.createZone({
          name: name.trim(),
          comment: comment.trim() || null,
          private_zone: type === 'private',
          vpcs: type === 'private' ? vpcs.map(v => ({ vpc_id: v.vpcId, vpc_region: v.region })) : [],
          tags: fromEditorTags(tags),
        });
        const created = res.hosted_zone;
        const href = `/route53/v2/hostedzones/${created.id}`;
        notify.success({
          header: `${displayName(created.name)} was successfully created.`,
          content:
            'Now you can create records in the hosted zone to specify how you want Route 53 to route traffic for your domain.',
          action: <Button onClick={() => router.push(href)}>View details</Button>,
        });
        notify.trackChange(res.change_info);
        await mutateZones();
        router.push(href);
      }
    } catch (err) {
      applyServerError(err);
      scrollToFirstError();
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Form
        header={
          <Header
            variant="h1"
            info={<InfoLink topic={isEdit ? 'editHostedZone' : 'createHostedZone'} />}
            description={
              isEdit
                ? 'You can change the description and tags of the hosted zone.'
                : 'A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains.'
            }
          >
            {isEdit ? 'Edit hosted zone' : 'Create hosted zone'}
          </Header>
        }
        errorText={errors.form}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" formAction="none" onClick={() => router.push(cancelHref)}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={busy}>
              {isEdit ? 'Save changes' : 'Create hosted zone'}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
            <SpaceBetween size="l">
              <div data-has-error={!!errors.name}>
                <FormField
                  label="Domain name"
                  info={<InfoLink topic="createHostedZone" />}
                  description="This is the name of the domain that you want to route traffic for."
                  constraintText={isEdit ? "You can't change the domain name." : 'Valid characters: a-z, 0-9, - (hyphen), _ (underscore) and . (period). Up to 253 characters.'}
                  errorText={errors.name}
                >
                  <Input
                    value={name}
                    onChange={e => setName(e.detail.value)}
                    placeholder="example.com"
                    disabled={isEdit}
                    autoFocus={!isEdit}
                    spellcheck={false}
                  />
                </FormField>
              </div>
              {!!duplicate && (
                <Alert type="info" header="A hosted zone with this name already exists">
                  Route 53 lets you create more than one hosted zone with the same name, but only one of them can be
                  authoritative for the domain. Use the description to tell them apart.
                </Alert>
              )}
              <div data-has-error={!!errors.comment}>
                <FormField
                  label={
                    <span>
                      Description <i>- optional</i>
                    </span>
                  }
                  description="This value lets you distinguish hosted zones that have the same name."
                  constraintText={`The description can have up to ${MAX_COMMENT} characters. ${comment.length}/${MAX_COMMENT}`}
                  errorText={errors.comment}
                >
                  <Textarea
                    value={comment}
                    onChange={e => setComment(e.detail.value)}
                    placeholder="The hosted zone is used for..."
                    rows={2}
                  />
                </FormField>
              </div>
              <FormField label="Type" info={<InfoLink topic="zoneType" />} description="The type indicates whether you want to route traffic on the internet or in an Amazon VPC.">
                <Tiles
                  value={type}
                  onChange={e => setType(e.detail.value as 'public' | 'private')}
                  columns={2}
                  items={[
                    {
                      value: 'public',
                      label: 'Public hosted zone',
                      description: 'A public hosted zone determines how traffic is routed on the internet.',
                      disabled: isEdit,
                    },
                    {
                      value: 'private',
                      label: 'Private hosted zone',
                      description: 'A private hosted zone determines how traffic is routed within an Amazon VPC.',
                      disabled: isEdit,
                    },
                  ]}
                />
              </FormField>
            </SpaceBetween>
          </Container>

          {!isEdit && type === 'private' && (
            <Container
              header={
                <Header
                  variant="h2"
                  description="To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs. To associate a VPC with a hosted zone when the VPC was created using a different AWS account, you must use a programmatic method, such as the AWS CLI."
                >
                  VPCs to associate with the hosted zone
                </Header>
              }
            >
              <SpaceBetween size="m">
                {errors.vpcs && <Alert type="error">{errors.vpcs}</Alert>}
                {vpcs.map((row, i) => {
                  const rowErrors = errors.vpcRows?.[i];
                  return (
                    <div key={i} data-has-error={!!rowErrors}>
                      <ColumnLayout columns={3}>
                        <FormField label={i === 0 ? 'Region' : undefined} errorText={rowErrors?.region}>
                          <Select
                            selectedOption={regionOptions.find(o => o.value === row.region) ?? null}
                            onChange={e =>
                              setVpcs(vpcs.map((v, j) => (j === i ? { region: e.detail.selectedOption.value ?? '', vpcId: '' } : v)))
                            }
                            options={regionOptions}
                            placeholder="Choose Region"
                            filteringType="auto"
                            ariaLabel={`Region for VPC ${i + 1}`}
                          />
                        </FormField>
                        <FormField label={i === 0 ? 'VPC ID' : undefined} errorText={rowErrors?.vpcId}>
                          <Select
                            selectedOption={mockVpcsFor(row.region).find(o => o.value === row.vpcId) ?? null}
                            onChange={e =>
                              setVpcs(vpcs.map((v, j) => (j === i ? { ...v, vpcId: e.detail.selectedOption.value ?? '' } : v)))
                            }
                            options={mockVpcsFor(row.region)}
                            placeholder="Choose VPC"
                            empty="Choose a Region first"
                            ariaLabel={`VPC ID ${i + 1}`}
                          />
                        </FormField>
                        <Box padding={{ top: i === 0 ? 'xl' : 'n' }}>
                          <Button
                            formAction="none"
                            disabled={vpcs.length === 1}
                            onClick={() => setVpcs(vpcs.filter((_, j) => j !== i))}
                          >
                            Remove VPC
                          </Button>
                        </Box>
                      </ColumnLayout>
                    </div>
                  );
                })}
                <Button formAction="none" onClick={() => setVpcs([...vpcs, { region: 'us-east-1', vpcId: '' }])}>
                  Add VPC
                </Button>
              </SpaceBetween>
            </Container>
          )}

          <div data-has-error={!!errors.tags}>
            <Container
              header={
                <Header variant="h2" description="Apply tags to hosted zones to help organize and identify them.">
                  Tags
                </Header>
              }
            >
              <SpaceBetween size="s">
                {errors.tags && <Alert type="error">{errors.tags}</Alert>}
                <TagEditorField
                  tags={tags}
                  onChange={(t, valid) => {
                    setTags(t);
                    setTagsValid(valid);
                  }}
                />
              </SpaceBetween>
            </Container>
          </div>
        </SpaceBetween>
      </Form>
    </form>
  );
}
