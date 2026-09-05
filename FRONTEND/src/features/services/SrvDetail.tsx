import { useParams } from 'react-router-dom';
import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';

export default function SrvDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8"
    >
      <PageHeader title="SRV ticket" description={id} />
    </DepartmentScope>
  );
}
