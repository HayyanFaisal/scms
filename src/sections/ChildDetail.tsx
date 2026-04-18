import { ArrowLeft, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChildWithDetails } from '@/hooks/useDatabase';
import { formatChildDisplayName } from '@/lib/utils';

interface ChildDetailProps {
  childId: number;
  onBack: () => void;
}

const categoryColors: Record<string, string> = {
  A: 'bg-red-100 text-red-800 border-red-200',
  B: 'bg-amber-100 text-amber-800 border-amber-200',
  C: 'bg-green-100 text-green-800 border-green-200'
};

export function ChildDetail({ childId, onBack }: ChildDetailProps) {
  const { child } = useChildWithDetails(childId || null);

  if (!child) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <p className="text-slate-500">Child record not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{formatChildDisplayName(child.Child_Name, child.parent?.Parent_Name, child.P_No_O_No)}</h1>
          <p className="text-slate-500">Dependent Child Profile</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Child Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-slate-500">Parent P/No</p>
            <p className="font-medium">{child.P_No_O_No}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Parent Name</p>
            <p className="font-medium">{child.parent?.Parent_Name || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Age</p>
            <p className="font-medium">{child.Age}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">CNIC/B-Form</p>
            <p className="font-medium">{child.CNIC_BForm_No}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Disability Category</p>
            <Badge variant="outline" className={categoryColors[child.Disability_Category] || categoryColors.A}>
              {child.Disability_Category}
            </Badge>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm text-slate-500">Disease/Disability</p>
            <p className="font-medium">{child.Disease_Disability}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm text-slate-500">School</p>
            <p className="font-medium">{child.School}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
