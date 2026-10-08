'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { TagEditorProps } from '@cloudscape-design/components/tag-editor';
import Wizard from '@cloudscape-design/components/wizard';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useSWRConfig } from 'swr';
import { InfoLink } from '@/components/common/InfoLink';
import { fromEditorTags, TagEditorField, toEditorTags } from '@/components/common/TagEditorField';
import { useNotify } from '@/components/notifications/FlashbarProvider';
import { useShortcuts } from '@/components/shell/ShortcutsProvider';
import { useHealthChecks } from '@/hooks/useHealthChecks';
import { api, ApiError, errorMessage, keys } from '@/lib/api';
import type { HealthCheck } from '@/lib/types';
import {
  emptyForm,
  fromHealthCheck,
  healthCheckType,
  mapServerField,
  STEP1_FIELDS,
  toConfig,
  urlPreview,
  validateStep1,
  validateStep2,
  type HcErrors,
  type HcFormState,
} from './formState';
import { ConfigureHealthCheckFields, NotificationFields } from './HealthCheckFields';

const LIST = '/route53/v2/healthchecks';

function scrollToFirstError() {
  requestAnimationFrame(() => {
    const el = document.querySelector('[data-has-error="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  });
}

function useFormState(initial: HcFormState) {
  const [state, setState] = useState(initial);
  const [errors, setErrors] = useState<HcErrors>({});
  const onChange = (patch: Partial<HcFormState>) => {
    setState(s => ({ ...s, ...patch }));
    // Clear errors for whatever the user just touched.
    if (Object.keys(errors).length) setErrors({});
  };
  return { state, setState, errors, setErrors, onChange };
}

function applyServerError(e: unknown, setErrors: (e: HcErrors) => void, setFormError: (m: string) => void) {
  const field = e instanceof ApiError ? mapServerField(e.field) : null;
  if (field && e instanceof ApiError) {
    setErrors({ [field]: e.message });
    setFormError('');
  } else {
    setFormError(errorMessage(e));
  }
}

/** "Create health check": Configure health check → Get notified when health check fails. */
export function CreateHealthCheckWizard() {
  const router = useRouter();
  const notify = useNotify();
  const { mutate } = useSWRConfig();
  const { healthChecks } = useHealthChecks();
  const { state, errors, setErrors, onChange } = useFormState(emptyForm());
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useShortcuts({ escape: () => router.push(LIST) });

  const submit = async () => {
    const e = { ...validateStep1(state), ...validateStep2(state) };
    setErrors(e);
    if (Object.keys(e).length) {
      if (Object.keys(e).some(k => STEP1_FIELDS.includes(k as keyof HcErrors))) setStep(0);
      scrollToFirstError();
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const created = await api.createHealthCheck(toConfig(state));
      notify.success({
        header: `Health check ${created.name} was successfully created.`,
        content: 'The status is Unknown until health checkers report the first results.',
        timeout: 10000,
      });
      await mutate(keys.healthChecks);
      router.push(LIST);
    } catch (err) {
      applyServerError(err, setErrors, setFormError);
      const field = err instanceof ApiError ? mapServerField(err.field) : null;
      if (field && STEP1_FIELDS.includes(field)) setStep(0);
      scrollToFirstError();
      setBusy(false);
    }
  };

  return (
    <Wizard
      activeStepIndex={step}
      isLoadingNextStep={busy}
      onNavigate={e => {
        if (e.detail.requestedStepIndex > step) {
          const v = validateStep1(state);
          setErrors(v);
          if (Object.keys(v).length) {
            scrollToFirstError();
            return;
          }
        }
        setStep(e.detail.requestedStepIndex);
      }}
      onCancel={() => router.push(LIST)}
      onSubmit={() => void submit()}
      submitButtonText="Create health check"
      i18nStrings={{
        stepNumberLabel: n => `Step ${n}`,
        collapsedStepsLabel: (n, total) => `Step ${n} of ${total}`,
        navigationAriaLabel: 'Steps',
        cancelButton: 'Cancel',
        previousButton: 'Previous',
        nextButton: 'Next',
        optional: 'optional',
      }}
      steps={[
        {
          title: 'Configure health check',
          info: <InfoLink topic="createHealthCheck" />,
          description: 'Route 53 health checks let you track the health status of your resources, such as web servers or mail servers, and take action when an outage occurs.',
          errorText: formError && step === 0 ? formError : undefined,
          content: (
            <ConfigureHealthCheckFields state={state} errors={errors} onChange={onChange} others={healthChecks ?? []} />
          ),
        },
        {
          title: 'Get notified when health check fails',
          info: <InfoLink topic="healthCheckNotification" />,
          errorText: formError && step === 1 ? formError : undefined,
          content: (
            <SpaceBetween size="l">
              <NotificationFields state={state} errors={errors} onChange={onChange} />
              <Container header={<Header variant="h2">Summary</Header>}>
                <KeyValuePairs
                  columns={3}
                  items={[
                    { label: 'Name', value: state.name || '-' },
                    { label: 'Type', value: healthCheckType(state) },
                    { label: 'URL', value: state.monitor === 'endpoint' ? urlPreview(state) : '-' },
                  ]}
                />
              </Container>
            </SpaceBetween>
          ),
        },
      ]}
    />
  );
}

/** "Edit health check": the same settings in one form; type, protocol and request interval are read-only. */
export function EditHealthCheckForm({ healthCheck }: { healthCheck: HealthCheck }) {
  const router = useRouter();
  const notify = useNotify();
  const { mutate } = useSWRConfig();
  const { healthChecks } = useHealthChecks();
  const { state, errors, setErrors, onChange } = useFormState(fromHealthCheck(healthCheck));
  const [tags, setTags] = useState<ReadonlyArray<TagEditorProps.Tag>>(toEditorTags(healthCheck.tags));
  const [tagsValid, setTagsValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useShortcuts({ escape: () => router.push(LIST) });

  // Deep links from the split panel (#notification, #tags) scroll to that section.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = { ...validateStep1(state), ...validateStep2(state) };
    setErrors(e);
    if (Object.keys(e).length || !tagsValid) {
      if (!tagsValid) setFormError('Fix the errors in the tags.');
      scrollToFirstError();
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await api.updateHealthCheck(healthCheck.id, toConfig(state));
      await api.replaceHealthCheckTags(healthCheck.id, fromEditorTags(tags));
      notify.success({ header: `Health check ${state.name.trim()} was successfully updated.`, timeout: 8000 });
      await mutate(keys.healthChecks);
      router.push(LIST);
    } catch (err) {
      applyServerError(err, setErrors, setFormError);
      scrollToFirstError();
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Form
        header={
          <Header variant="h1" info={<InfoLink topic="createHealthCheck" />} description={`Health check ID: ${healthCheck.id}`}>
            Edit health check
          </Header>
        }
        errorText={formError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" formAction="none" onClick={() => router.push(LIST)}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={busy}>
              Save changes
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Alert type="info">
            You can&apos;t change what a health check monitors, its protocol, the request interval or latency graphs. To
            change them, create a new health check.
          </Alert>
          <ConfigureHealthCheckFields
            state={state}
            errors={errors}
            onChange={onChange}
            isEdit
            others={(healthChecks ?? []).filter(h => h.id !== healthCheck.id)}
          />
          <div id="notification">
            <NotificationFields state={state} errors={errors} onChange={onChange} />
          </div>
          <div id="tags">
            <Container header={<Header variant="h2" description="Apply tags to health checks to help organize and identify them.">Tags</Header>}>
              <TagEditorField
                tags={tags}
                onChange={(t, valid) => {
                  setTags(t);
                  setTagsValid(valid);
                }}
              />
            </Container>
          </div>
        </SpaceBetween>
      </Form>
    </form>
  );
}
