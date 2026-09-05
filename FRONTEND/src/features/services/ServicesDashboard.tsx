import { DepartmentScope } from '@/components/layout/DepartmentScope';
import { PageHeader } from '@/components/ui/PageHeader';

export default function ServicesDashboard() {
  return (
    <DepartmentScope
      department="services"
      className="bg-services-background text-services-on-surface min-h-full p-6 lg:p-8"
    >
      <PageHeader title="Services" description="Dispatch, equipment and recurring problems by dealership." />
    </DepartmentScope>
  );
}
