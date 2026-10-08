'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tiles from '@cloudscape-design/components/tiles';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, errorMessage } from '@/lib/api';
import styles from './login.module.css';

type UserType = 'root' | 'iam';

function safeNext(next: string | null): string {
  return next && next.startsWith('/route53') ? next : '/route53/v2/hostedzones';
}

function SignInForm() {
  const params = useSearchParams();
  const [step, setStep] = useState<'identify' | 'password'>('identify');
  const [userType, setUserType] = useState<UserType>('root');
  const [email, setEmail] = useState('');
  const [accountId, setAccountId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const next = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (userType === 'root') {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setFieldError('Enter a valid email address.');
        return;
      }
    } else if (!accountId.trim()) {
      setFieldError('Enter your account ID or account alias.');
      return;
    }
    setFieldError('');
    setStep('password');
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || (userType === 'iam' && !username.trim())) {
      setError(userType === 'iam' ? 'Enter your IAM user name and password.' : 'Enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.login(
        userType === 'root'
          ? { email: email.trim(), password }
          : { account_id: accountId.trim(), username: username.trim(), password },
      );
      window.location.href = safeNext(params.get('next'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
      setBusy(false);
    }
  };

  const mock = (what: string) => () => setInfo(`${what} isn't available in this demo. Use demo@example.com / demo.`);

  return (
    <div className={styles.page}>
      <div className={styles.logo}>
        <img src="/aws-logo-dark.svg" alt="Amazon Web Services" width={96} height={58} />
      </div>
      <div className={styles.panels}>
        <div className={styles.card}>
          <Container>
            {step === 'identify' ? (
              <form onSubmit={next} noValidate>
                <Form
                  header={<Header variant="h1">Sign in</Header>}
                  actions={
                    <Button variant="primary" formAction="submit" fullWidth>
                      Next
                    </Button>
                  }
                >
                  <SpaceBetween size="l">
                    <Tiles
                      value={userType}
                      onChange={e => {
                        setUserType(e.detail.value as UserType);
                        setFieldError('');
                      }}
                      columns={1}
                      items={[
                        {
                          value: 'root',
                          label: 'Root user',
                          description: 'Account owner that performs tasks requiring unrestricted access.',
                        },
                        {
                          value: 'iam',
                          label: 'IAM user',
                          description: 'User within an account that performs daily tasks.',
                        },
                      ]}
                      ariaLabel="User type"
                    />
                    {userType === 'root' ? (
                      <FormField label="Root user email address" errorText={fieldError}>
                        <Input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.detail.value)}
                          placeholder="demo@example.com"
                          autoFocus
                          autoComplete="username"
                        />
                      </FormField>
                    ) : (
                      <FormField label="Account ID (12 digits) or account alias" errorText={fieldError}>
                        <Input
                          value={accountId}
                          onChange={e => setAccountId(e.detail.value)}
                          placeholder="1234-5678-9012"
                          autoFocus
                        />
                      </FormField>
                    )}
                    <Box variant="small" color="text-body-secondary">
                      By continuing, you agree to the AWS Customer Agreement or other agreement for AWS services, and
                      the Privacy Notice. This site uses essential cookies.
                    </Box>
                  </SpaceBetween>
                </Form>
              </form>
            ) : (
              <form onSubmit={signIn} noValidate>
                <Form
                  header={
                    <Header
                      variant="h1"
                      description={userType === 'root' ? `Email: ${email}` : `Account ID: ${accountId}`}
                    >
                      {userType === 'root' ? 'Root user sign in' : 'IAM user sign in'}
                    </Header>
                  }
                  actions={
                    <SpaceBetween size="s">
                      <Button variant="primary" formAction="submit" fullWidth loading={busy}>
                        Sign in
                      </Button>
                      <Button
                        variant="link"
                        formAction="none"
                        onClick={() => {
                          setStep('identify');
                          setError('');
                          setPassword('');
                        }}
                      >
                        Sign in to a different account
                      </Button>
                    </SpaceBetween>
                  }
                >
                  <SpaceBetween size="l">
                    {error && (
                      <Alert type="error" header="Sign-in failed">
                        {error}
                      </Alert>
                    )}
                    {userType === 'iam' && (
                      <FormField label="IAM user name">
                        <Input
                          value={username}
                          onChange={e => setUsername(e.detail.value)}
                          placeholder="demo-user"
                          autoFocus
                          autoComplete="username"
                        />
                      </FormField>
                    )}
                    <FormField
                      label="Password"
                      secondaryControl={
                        <Link variant="secondary" fontSize="body-s" onFollow={mock('Password reset')}>
                          Forgot password?
                        </Link>
                      }
                      constraintText="Demo password: demo"
                    >
                      <Input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.detail.value)}
                        autoFocus={userType === 'root'}
                        autoComplete="current-password"
                      />
                    </FormField>
                  </SpaceBetween>
                </Form>
              </form>
            )}
            <Box padding={{ top: 'l' }} textAlign="center">
              <SpaceBetween size="s">
                {info && (
                  <Alert type="info" dismissible onDismiss={() => setInfo('')}>
                    {info}
                  </Alert>
                )}
                <Box variant="small" color="text-body-secondary">
                  New to AWS?
                </Box>
                <Button onClick={mock('Account creation')} fullWidth>
                  Create a new AWS account
                </Button>
              </SpaceBetween>
            </Box>
          </Container>
        </div>
        <aside className={styles.promo} aria-label="Promotion">
          <SpaceBetween size="m">
            <h2>Route traffic with confidence</h2>
            <p>
              Amazon Route 53 is a highly available and scalable DNS web service. Manage hosted zones and records,
              and route users to your applications with simple, weighted, latency, failover and geolocation routing.
            </p>
          </SpaceBetween>
          <a
            className={styles.promoButton}
            href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html"
            target="_blank"
            rel="noreferrer"
          >
            Learn more
          </a>
        </aside>
      </div>
      <div className={styles.footer}>
        <Box variant="small" color="text-body-secondary">
          © 2026, Amazon Web Services, Inc. or its affiliates. All rights reserved. · Demo credentials:{' '}
          <b>demo@example.com</b> / <b>demo</b>
        </Box>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
