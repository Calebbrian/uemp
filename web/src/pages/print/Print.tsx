import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { formatLongDate, fullName, gpaText } from '../../lib/format';
import type { Band, Me, Semester, Transcript } from '../../lib/types';
import { Button, ButtonLink, Spinner } from '../../components/ui/primitives';

function Sheet({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const now = new Date();
  useEffect(() => {
    document.title = `${title} · UEMP`;
  }, [title]);
  return (
    <div className="min-h-dvh bg-surface print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 md:px-8">
        <ButtonLink to="/student" variant="ghost" icon={ArrowLeft}>
          Back to dashboard
        </ButtonLink>
        <Button icon={Printer} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>
      <div className="overflow-x-auto px-4 py-6 print:p-0">
        <article className="mx-auto flex min-h-[1123px] w-[794px] flex-col gap-6 bg-white px-[60px] py-14 font-sans text-black shadow-overlay print:min-h-0 print:w-auto print:p-0 print:shadow-none">
          <header className="flex items-center gap-4 border-b-2 border-black pb-4">
            <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[10px] border-2 border-black">
              <GraduationCap className="size-7" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-xl font-bold tracking-[0.02em]">UEMP</span>
              <span className="text-sm">University Education Management Portal</span>
            </div>
            <div className="flex flex-col gap-0.5 text-right">
              <span className="text-lg font-bold">{title}</span>
              <span className="text-sm">{subtitle}</span>
            </div>
          </header>
          {children}
          <footer className="num mt-auto flex justify-between gap-4 border-t border-black pt-3 text-[13px]">
            <span>
              Generated on {formatLongDate(now)}, {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · UEMP
            </span>
            {footer}
          </footer>
        </article>
      </div>
    </div>
  );
}

function StudentBlock({ user, extra }: { user: Me; extra: [string, ReactNode] }) {
  const s = user.student!;
  const items: [string, ReactNode][] = [
    ['Name', fullName(user)],
    ['Matric no.', s.matricNo],
    ['Level', `${s.level} Level`],
    ['Programme', s.program.name],
    ['Department', user.department?.name ?? '—'],
    extra,
  ];
  return (
    <section aria-label="Student details" className="grid grid-cols-3 gap-x-5 gap-y-4 border-[1.5px] border-black px-[18px] py-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="text-[13px] font-semibold tracking-[0.05em] text-[#333] uppercase">{k}</div>
          <div className="num mt-0.5 text-base font-semibold">{v}</div>
        </div>
      ))}
    </section>
  );
}

const pth = 'border-y-[1.5px] border-black px-2.5 py-2 text-left text-[13px] font-bold tracking-[0.04em] uppercase';
const ptd = 'border-b border-[#999] px-2.5 py-2';

type RegistrationOverview = {
  semester: Semester | null;
  maxUnits: number;
  registered: { enrollmentId: string; code: string; title: string; units: number; isCore: boolean }[];
  registeredUnits: number;
};

export function PrintRegistrationPage() {
  const user = useUser();
  const { data, isPending } = useQuery({
    queryKey: ['student', 'registration'],
    queryFn: () => api.get<RegistrationOverview>('/student/registration'),
  });
  if (isPending || !data) return <Spinner label="Preparing registration slip" />;
  const semester = data.semester;
  const ref = semester
    ? `REG-${semester.session.name.replace(/(\d{2})(\d{2})\/\d{2}(\d{2})/, '$2$3')}-${semester.term === 'FIRST' ? 1 : 2}-${user.student!.matricNo.replace(/\//g, '')}`
    : '';

  return (
    <Sheet
      title="Course Registration Slip"
      subtitle={semester ? `${semester.session.name} Session · ${semester.term === 'FIRST' ? 'First' : 'Second'} Semester` : ''}
      footer={<span>Ref: {ref} · Page 1 of 1</span>}
    >
      <StudentBlock user={user} extra={['Faculty', user.department?.faculty.name.replace('Faculty of ', '') ?? '—']} />
      <section aria-label="Registered courses">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr>
              <th className={`${pth} w-10`}>S/N</th>
              <th className={pth}>Code</th>
              <th className={pth}>Title</th>
              <th className={pth}>Type</th>
              <th className={`${pth} text-right`}>Units</th>
            </tr>
          </thead>
          <tbody className="num">
            {data.registered.map((r, i) => (
              <tr key={r.enrollmentId}>
                <td className={ptd}>{i + 1}</td>
                <td className={`${ptd} font-semibold`}>{r.code}</td>
                <td className={ptd}>{r.title}</td>
                <td className={ptd}>{r.isCore ? 'Core' : 'Elective'}</td>
                <td className={`${ptd} text-right`}>{r.units}</td>
              </tr>
            ))}
            {data.registered.length === 0 && (
              <tr>
                <td colSpan={5} className={ptd}>
                  No courses registered.
                </td>
              </tr>
            )}
            <tr className="font-bold">
              <td colSpan={4} className="border-y-[1.5px] border-black px-2.5 py-2">
                Total units registered (maximum {data.maxUnits})
              </td>
              <td className="border-y-[1.5px] border-black px-2.5 py-2 text-right">{data.registeredUnits}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <p className="m-0 text-sm leading-[21px]">I confirm that the courses listed above are the courses I have registered for this semester.</p>
      <section aria-label="Signatures" className="mt-10 grid grid-cols-3 gap-7">
        {['Student', 'Level Adviser', 'Head of Department'].map((who) => (
          <div key={who} className="flex flex-col gap-1.5">
            <span className="border-t-[1.5px] border-black pt-2 text-sm font-semibold">{who}</span>
            <span className="text-[13px]">Date: ____________</span>
          </div>
        ))}
      </section>
    </Sheet>
  );
}

export function PrintResultsPage() {
  const user = useUser();
  const transcript = useQuery({ queryKey: ['student', 'results'], queryFn: () => api.get<Transcript>('/student/results') });
  const scale = useQuery({ queryKey: ['grading-scale'], queryFn: () => api.get<{ bands: Band[] }>('/meta/grading-scale') });
  if (transcript.isPending || !transcript.data) return <Spinner label="Preparing result statement" />;

  const t = transcript.data;
  const semesters = [...t.semesters].reverse().filter((s) => s.courses.length > 0);
  const pending = t.semesters.filter((s) => s.pending > 0).map((s) => s.semester.label);
  const bands = scale.data?.bands.map((b) => `${b.grade} ${b.minScore}–${b.maxScore} (${b.point})`).join(', ');

  return (
    <Sheet title="Statement of Results" subtitle="Approved results only" footer={<span>Not valid without signatures</span>}>
      <StudentBlock user={user} extra={['Entry year', user.student!.entryYear]} />
      {semesters.map((s) => (
        <section key={s.semester.id} aria-label={s.semester.label} className="flex break-inside-avoid flex-col gap-1.5">
          <h2 className="m-0 text-[15px] font-bold">{s.semester.label}</h2>
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[13%]" />
              <col />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead>
              <tr>
                {['Code', 'Title', 'Units', 'CA', 'Exam', 'Total', 'Grade', 'GP'].map((h, i) => (
                  <th key={h} className={`${pth} px-2 py-1.5 text-xs ${[2, 3, 4, 5, 7].includes(i) ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num">
              {s.courses.map((c) => (
                <tr key={c.code}>
                  <td className="border-b border-[#999] px-2 py-1.5 font-semibold">{c.code}</td>
                  <td className="border-b border-[#999] px-2 py-1.5">{c.title}</td>
                  <td className="border-b border-[#999] px-2 py-1.5 text-right">{c.units}</td>
                  <td className="border-b border-[#999] px-2 py-1.5 text-right">{c.caScore}</td>
                  <td className="border-b border-[#999] px-2 py-1.5 text-right">{c.examScore}</td>
                  <td className="border-b border-[#999] px-2 py-1.5 text-right">{c.totalScore}</td>
                  <td className="border-b border-[#999] px-2 py-1.5 font-bold">{c.grade}</td>
                  <td className="border-b border-[#999] px-2 py-1.5 text-right">{c.gradePoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="num flex gap-6 px-2 py-0.5 text-sm font-semibold">
            <span>Units: {s.units}</span>
            <span>Semester GPA: {gpaText(s.gpa)}</span>
            <span>Cumulative GPA: {gpaText(s.cgpa)}</span>
          </div>
        </section>
      ))}
      {semesters.length === 0 && <p className="m-0 text-sm">No approved results yet.</p>}
      <section aria-label="Summary" className="num flex flex-wrap gap-8 border-[1.5px] border-black px-4 py-3 text-[15px]">
        <span>
          CGPA: <strong>{gpaText(t.cgpa)}</strong>
        </span>
        <span>
          Total units passed: <strong>{t.unitsPassed}</strong>
        </span>
        <span>
          Class of degree (to date): <strong>{t.classOfDegree ?? '—'}</strong>
        </span>
      </section>
      <p className="m-0 text-xs leading-[18px]">
        GPA = Σ(units × grade point) ÷ Σ units.{bands ? ` Grades: ${bands}.` : ''}
        {pending.length ? ` Results not yet approved (${pending.join('; ')}) are not shown.` : ''}
      </p>
      <section aria-label="Signatures" className="mt-6 grid grid-cols-2 gap-10">
        <span className="border-t-[1.5px] border-black pt-2 text-sm font-semibold">Examinations Officer</span>
        <span className="border-t-[1.5px] border-black pt-2 text-sm font-semibold">Head of Department</span>
      </section>
    </Sheet>
  );
}
