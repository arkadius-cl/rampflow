import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { SignupForm } from '@/modules/core/signup-form';

// RG-01: a company registers itself. Public; nothing exists until the emailed link is used.

export const Route = createFileRoute('/signup/')({
  component: SignupPage,
});

function SignupPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout
      title={t(($) => $.signup.form.title)}
      description={t(($) => $.signup.form.description)}
    >
      <SignupForm />
    </AuthLayout>
  );
}
