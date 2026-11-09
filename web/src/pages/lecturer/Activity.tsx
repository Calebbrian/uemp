import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { HistoryEntry } from '../../lib/types';
import { Banner, PageHeader, Spinner } from '../../components/ui/primitives';
import { SheetHistory } from '../../components/results';

export function LecturerActivityPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['lecturer', 'activity'],
    queryFn: () => api.get<{ items: HistoryEntry[] }>('/lecturer/activity'),
  });
  return (
    <>
      <PageHeader title="Activity" description="Your score entries and submissions, and the department’s reviews of your result sheets." />
      {isPending ? (
        <Spinner label="Loading activity" />
      ) : error ? (
        <Banner kind="error" title="We couldn’t load your activity.">{error.message}</Banner>
      ) : (
        <SheetHistory history={data.items} />
      )}
    </>
  );
}
