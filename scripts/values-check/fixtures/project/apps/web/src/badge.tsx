import type { BookingStatus } from '@rampflow/shared/modules/booking/values';

function Badge(props: { status: BookingStatus }): JSX.Element {
  return <span>{props.status}</span>;
}

export function View(): JSX.Element {
  return (
    <Badge
      status="checked_in" // → BookingStatus.checked_in
    />
  );
}
