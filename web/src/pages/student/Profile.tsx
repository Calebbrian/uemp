import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fullName, formatDate } from '../../lib/format';
import type { Me } from '../../lib/types';
import { Banner, Button, DescriptionList, PageHeader, SectionCard, Spinner } from '../../components/ui/primitives';
import { SelectField, TextAreaField, TextField, useForm } from '../../components/ui/form';
import { useToast } from '../../components/ui/toast';

export function StudentProfilePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['student', 'profile'], queryFn: () => api.get<{ user: Me }>('/student/profile') });
  const form = useForm({ phone: '', address: '', gender: '', dateOfBirth: '' });

  const user = profile.data?.user;
  const { setValues } = form;
  useEffect(() => {
    if (!user) return;
    setValues({
      phone: user.phone ?? '',
      address: user.student?.address ?? '',
      gender: user.student?.gender ?? '',
      dateOfBirth: user.student?.dateOfBirth?.slice(0, 10) ?? '',
    });
  }, [user, setValues]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<{ user: Me }>('/student/profile', {
        phone: form.values.phone || null,
        address: form.values.address || null,
        gender: form.values.gender || null,
        dateOfBirth: form.values.dateOfBirth || null,
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(['student', 'profile'], res);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Profile saved');
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t save profile', err.message);
    },
  });

  if (profile.isPending) return <Spinner label="Loading profile" />;
  if (profile.error) return <Banner kind="error" title="We couldn’t load your profile.">{profile.error.message}</Banner>;
  const s = user!.student!;

  return (
    <>
      <PageHeader title="My Profile" description="Your academic record and contact details." />

      <SectionCard title="Academic record">
        <div className="flex flex-col gap-5">
          <DescriptionList
            columns={3}
            items={[
              { label: 'Name', value: fullName(user!) },
              { label: 'Email', value: user!.email },
              { label: 'Matric number', value: <span className="num">{s.matricNo}</span> },
              { label: 'Faculty', value: user!.department?.faculty.name ?? '—' },
              { label: 'Department', value: user!.department?.name ?? '—' },
              { label: 'Programme', value: s.program.name },
              { label: 'Level', value: `${s.level} Level` },
              { label: 'Entry year', value: <span className="num">{s.entryYear}</span> },
              { label: 'Last sign-in', value: formatDate(user!.lastLoginAt) },
            ]}
          />
          <p className="m-0 text-[13px] text-muted">Contact your department to change these details.</p>
        </div>
      </SectionCard>

      <SectionCard title="Contact details">
        <form
          className="flex max-w-[640px] flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          noValidate
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Phone" type="tel" autoComplete="tel" {...form.bind('phone')} />
            <TextField label="Date of birth" type="date" {...form.bind('dateOfBirth')} />
          </div>
          <SelectField label="Gender" {...form.bind('gender')}>
            <option value="">Prefer not to say</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </SelectField>
          <TextAreaField label="Address" autoComplete="street-address" {...form.bind('address')} />
          <div>
            <Button type="submit" loading={save.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </SectionCard>

      <p className="m-0 text-[13px] text-muted">To change your password, open the menu under your name in the top right.</p>
    </>
  );
}
