import type { BookingStatus, LoadStatus } from '@rampflow/shared/modules/booking/values';

function Badge(props: { status: BookingStatus; load?: LoadStatus }): JSX.Element {
  return <span>{props.status}</span>;
}

export function View(): JSX.Element {
  return (
    <Badge
      status="checked_in" // → BookingStatus.checked_in
      load="loading" // → LoadStatus.loading
    />
  );
}
