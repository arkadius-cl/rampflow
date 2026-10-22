import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { PrototypeDriverStep } from '@rampflow/shared/modules/driver/values';
import { UiSize } from '@rampflow/shared/values';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  HourglassIcon,
  LogOutIcon,
  MapPinIcon,
  MegaphoneIcon,
  PhoneIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  VibrateIcon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { QrPlaceholder } from '@/components/qr-placeholder';
import { DriverShell, PhoneFrame } from '@/components/shells/driver-shell';
import { SiteTimeRange } from '@/components/site-time';
import { BookingStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { bookings, briefingBlocks, quiz, sites } from './-mock';

const STEPS: PrototypeDriverStep[] = [
  PrototypeDriverStep.booking,
  PrototypeDriverStep.briefing,
  PrototypeDriverStep.quiz,
  PrototypeDriverStep.waiting,
  PrototypeDriverStep.called,
  PrototypeDriverStep.done,
];

export const Route = createFileRoute('/design/driver')({
  validateSearch: (search: Record<string, unknown>): { step: PrototypeDriverStep } => {
    const step = search.step;
    return {
      step: STEPS.includes(step as PrototypeDriverStep)
        ? (step as PrototypeDriverStep)
        : PrototypeDriverStep.booking,
    };
  },
  component: DriverScreen,
});

const booking = bookings[3];
const site = sites[0];

function DriverScreen() {
  const { step } = Route.useSearch();
  if (!booking || !site) return null;
  const next = STEPS[STEPS.indexOf(step) + 1];
  return (
    <PhoneFrame>
      <DriverShell
        tenantName="Acme Logistics"
        locale="pl"
        machineTranslated={step === PrototypeDriverStep.briefing}
        offlineSince={step === PrototypeDriverStep.waiting ? '10:31' : undefined}
        footer={
          next ? (
            <Button
              size="lg"
              className="w-full"
              nativeButton={false}
              render={<Link to="/design/driver" search={{ step: next }} />}
            >
              {footerLabel[step]}
              <ChevronRightIcon />
            </Button>
          ) : undefined
        }
      >
        {step === PrototypeDriverStep.booking ? <BookingView /> : null}
        {step === PrototypeDriverStep.briefing ? <BriefingView /> : null}
        {step === PrototypeDriverStep.quiz ? <QuizView /> : null}
        {step === PrototypeDriverStep.waiting ? <WaitingView /> : null}
        {step === PrototypeDriverStep.called ? <CalledView /> : null}
        {step === PrototypeDriverStep.done ? <DoneView /> : null}
      </DriverShell>
    </PhoneFrame>
  );
}

const footerLabel: Record<PrototypeDriverStep, string> = {
  booking: 'Start safety briefing',
  briefing: 'I have read this. Go to the quiz',
  quiz: 'Check answers',
  waiting: 'Simulate call (prototype)',
  called: 'Simulate done (prototype)',
  done: '',
};

function BookingView() {
  if (!booking || !site) return null;
  return (
    <>
      <section className="rounded-xl border bg-card p-4">
        <div className="text-sm text-muted-foreground">Your slot</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">
          <SiteTimeRange start={booking.start} end={booking.end} zone={site.zoneLabel} />
        </div>
        <div className="mt-1 text-lg">Mon 19 Oct 2026</div>
        <div className="mt-3 flex items-start gap-2 text-sm">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="font-medium">{site.name}</div>
            <div className="text-muted-foreground">{site.address}</div>
            <a
              href="#map"
              className="mt-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              Open in maps <ExternalLinkIcon className="size-3.5" />
            </a>
          </div>
        </div>
      </section>

      <section className="flex items-center gap-4 rounded-xl border bg-card p-4">
        <QrPlaceholder code={booking.code} size={112} className="border" />
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">Show at the gate</div>
          <div className="font-mono text-2xl font-semibold tracking-wide">{booking.code}</div>
          <BookingStatusBadge status={BookingStatus.confirmed} size={UiSize.lg} className="mt-2" />
        </div>
      </section>

      <section className="rounded-xl border border-tone-onsite-border bg-tone-onsite-bg p-4">
        <div className="flex items-center gap-2 font-semibold text-tone-onsite">
          <ShieldAlertIcon className="size-5" />
          Safety briefing required
        </div>
        <p className="mt-1 text-sm">
          Read the site rules and answer 3 questions before you arrive. Takes about 3 minutes.
          Without it the gate cannot let you in.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        This page shows no personal data. Your name is stored only with the safety acknowledgement.{' '}
        <a href="#privacy" className="underline underline-offset-4">
          Privacy notice
        </a>
      </p>
    </>
  );
}

function BriefingView() {
  const [index, setIndex] = useState(0);
  const block = briefingBlocks[index];
  const last = index === briefingBlocks.length - 1;
  if (!block) return null;
  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Site rules</span>
        <span className="text-muted-foreground tabular-nums">
          {index + 1} / {briefingBlocks.length}
        </span>
      </div>
      <Progress
        value={((index + 1) / briefingBlocks.length) * 100}
        aria-label="Briefing progress"
      />
      <section className="flex flex-1 flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-tone-onsite-bg">
          <Pictogram kind={block.pictogram} />
        </div>
        <h2 className="text-2xl font-semibold leading-tight">{block.title}</h2>
        <p className="text-lg leading-snug">{block.body}</p>
      </section>
      {last ? (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <Field>
            <FieldLabel htmlFor="driver-name">Your name</FieldLabel>
            <Input id="driver-name" placeholder="First and last name" />
          </Field>
          <label htmlFor="ack" className="flex items-start gap-3 text-base">
            <Checkbox id="ack" className="mt-1" />
            <span>I have read and understood the site rules of Acme Logistics, Hamburg DC.</span>
          </label>
        </section>
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Back
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          disabled={last}
          onClick={() => setIndex(index + 1)}
        >
          Next rule
        </Button>
      </div>
    </>
  );
}

function Pictogram({ kind }: { kind: string }) {
  const label: Record<string, string> = {
    speed: '10',
    vest: 'VEST',
    chocks: 'STOP',
    cab: 'WAIT',
  };
  return (
    <div className="flex size-32 items-center justify-center rounded-full border-8 border-tone-danger bg-white text-3xl font-black text-foreground">
      {label[kind] ?? '!'}
    </div>
  );
}

function QuizView() {
  const [answers, setAnswers] = useState<Record<string, string>>({ q1: '0', q2: '0' });
  const [checked] = useState(true);
  return (
    <>
      <div className="text-sm">
        <div className="font-medium">Quick check</div>
        <div className="text-muted-foreground">All answers must be correct. You can retry.</div>
      </div>
      {quiz.map((q, i) => {
        const chosen = answers[q.id];
        const wrong = checked && chosen !== undefined && Number(chosen) !== q.correct;
        const right = checked && chosen !== undefined && Number(chosen) === q.correct;
        return (
          <fieldset
            key={q.id}
            className={cn(
              'rounded-xl border bg-card p-4',
              wrong && 'border-tone-danger-border',
              right && 'border-tone-success-border',
            )}
          >
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="mb-3 flex items-start gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {i + 1}
              </span>
              <span className="text-lg font-medium leading-snug">{q.question}</span>
            </div>
            <RadioGroup
              value={chosen}
              onValueChange={(v) => setAnswers({ ...answers, [q.id]: String(v) })}
            >
              {q.options.map((opt, j) => (
                <label
                  key={opt}
                  htmlFor={`${q.id}-${j}`}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-lg border px-3 text-base has-data-checked:border-primary has-data-checked:bg-accent',
                  )}
                >
                  <RadioGroupItem id={`${q.id}-${j}`} value={String(j)} className="size-6" />
                  <span className="flex-1">{opt}</span>
                </label>
              ))}
            </RadioGroup>
            {wrong ? (
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-tone-danger">
                <XIcon className="size-4" /> Not correct. Read rule {i + 1} again and retry.
              </div>
            ) : null}
            {right ? (
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-tone-success">
                <CheckIcon className="size-4" /> Correct
              </div>
            ) : null}
          </fieldset>
        );
      })}
    </>
  );
}

function WaitingView() {
  if (!booking || !site) return null;
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border bg-card p-6 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-tone-onsite-bg text-tone-onsite">
          <HourglassIcon className="size-12" />
        </div>
        <h2 className="text-3xl font-semibold">Please wait</h2>
        <p className="text-lg text-muted-foreground">
          You are checked in. We will call you to a dock on this page. Keep it open.
        </p>
        <BookingStatusBadge status={BookingStatus.checked_in} size={UiSize.xl} />
        <dl className="mt-2 grid w-full grid-cols-2 gap-3 text-left text-sm">
          <div className="rounded-lg bg-muted p-3">
            <dt className="text-muted-foreground">Checked in</dt>
            <dd className="text-lg font-semibold tabular-nums">
              10:18{' '}
              <span className="text-sm font-medium text-muted-foreground">{site.zoneLabel}</span>
            </dd>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <dt className="text-muted-foreground">Waiting</dt>
            <dd className="text-lg font-semibold tabular-nums">24 min</dd>
          </div>
        </dl>
      </section>
      <div className="flex items-center justify-center gap-2 rounded-lg bg-tone-success-bg px-3 py-2 text-sm text-tone-success">
        <ShieldCheckIcon className="size-4" /> Safety briefing valid until 19 Oct 2027
      </div>
      <Button
        variant="outline"
        className="w-full"
        nativeButton={false}
        render={<a href="tel:+494012345678" />}
      >
        <PhoneIcon /> Call the site
      </Button>
    </>
  );
}

function CalledView() {
  if (!booking || !site) return null;
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-status-called-solid p-6 text-center text-background">
        <div className="flex items-center gap-2 text-lg font-semibold uppercase tracking-wide">
          <MegaphoneIcon className="size-6" /> Go to dock
        </div>
        <div className="text-[96px] font-black leading-none tabular-nums tracking-tight">A-03</div>
        <div className="text-2xl font-semibold">Hall A</div>
        <div className="mt-2 flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-sm font-medium">
          <ClockIcon className="size-4" /> Called 10:38 {site.zoneLabel}
        </div>
      </section>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <VibrateIcon className="size-4 shrink-0" />
        Your phone vibrated. The dock lights are on the left when you enter the yard.
      </div>
      <Button
        variant="outline"
        className="w-full"
        nativeButton={false}
        render={<a href="tel:+494012345678" />}
      >
        <PhoneIcon /> Call the dock
      </Button>
    </>
  );
}

function DoneView() {
  if (!site) return null;
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border bg-card p-6 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-tone-success-bg text-tone-success">
          <CircleCheckIcon className="size-12" />
        </div>
        <h2 className="text-3xl font-semibold">Loading done</h2>
        <p className="text-lg text-muted-foreground">
          Please drive to the gate. The gate records your departure.
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LogOutIcon className="size-4" /> Gate out: follow the yellow lane
        </div>
      </section>
      <p className="text-center text-xs text-muted-foreground">
        This link stops working 24 hours after departure.
      </p>
    </>
  );
}
