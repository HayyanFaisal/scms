import { useMemo, useState } from 'react';
import { ArrowLeft, Save, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useChildren, useParents } from '@/hooks/useDatabase';
import type { DisabilityCategory } from '@/types';

interface ChildFormProps {
  pNo?: string | null;
  onSave: (params?: { pNo?: string }) => void;
  onCancel: () => void;
}

export function ChildForm({ pNo, onSave, onCancel }: ChildFormProps) {
  const { create } = useChildren();
  const { parents } = useParents();
  const [errors, setErrors] = useState<string[]>([]);

  const sortedParents = useMemo(() => {
    return [...parents].sort((a, b) => a.Parent_Name.localeCompare(b.Parent_Name));
  }, [parents]);

  const [formData, setFormData] = useState({
    P_No_O_No: pNo || '',
    Child_Name: '',
    Age: '',
    CNIC_BForm_No: '',
    Disease_Disability: '',
    Disability_Category: 'A' as DisabilityCategory,
    School: ''
  });

  const validate = (): boolean => {
    const nextErrors: string[] = [];

    if (!formData.P_No_O_No) nextErrors.push('Please select a parent beneficiary');
    if (!formData.Child_Name.trim()) nextErrors.push('Child name is required');

    const age = Number(formData.Age);
    if (!Number.isFinite(age) || age <= 0) {
      nextErrors.push('Age must be a valid number greater than 0');
    }

    if (!formData.CNIC_BForm_No.trim()) nextErrors.push('CNIC/B-Form number is required');
    if (!formData.Disease_Disability.trim()) nextErrors.push('Disease/Disability is required');
    if (!formData.School.trim()) nextErrors.push('School is required');

    setErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    create({
      P_No_O_No: formData.P_No_O_No,
      Child_Name: formData.Child_Name.trim(),
      Age: Number(formData.Age),
      CNIC_BForm_No: formData.CNIC_BForm_No.trim(),
      Disease_Disability: formData.Disease_Disability.trim(),
      Disability_Category: formData.Disability_Category,
      School: formData.School.trim()
    });

    onSave({ pNo: formData.P_No_O_No });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Add Dependent Child</h1>
          <p className="text-slate-500">Create a new child profile for an existing parent beneficiary</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          Save Child
        </Button>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Child Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Parent Beneficiary</Label>
              <Select
                value={formData.P_No_O_No}
                onValueChange={(value) => setFormData(prev => ({ ...prev, P_No_O_No: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select parent" />
                </SelectTrigger>
                <SelectContent>
                  {sortedParents.map((parent) => (
                    <SelectItem key={parent.P_No_O_No} value={parent.P_No_O_No}>
                      {parent.Parent_Name} ({parent.P_No_O_No})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Child Name</Label>
              <Input
                value={formData.Child_Name}
                onChange={(e) => setFormData(prev => ({ ...prev, Child_Name: e.target.value }))}
                placeholder="Enter child name"
              />
            </div>

            <div className="space-y-2">
              <Label>Age</Label>
              <Input
                type="number"
                min="1"
                step="0.1"
                value={formData.Age}
                onChange={(e) => setFormData(prev => ({ ...prev, Age: e.target.value }))}
                placeholder="Enter age"
              />
            </div>

            <div className="space-y-2">
              <Label>CNIC/B-Form Number</Label>
              <Input
                value={formData.CNIC_BForm_No}
                onChange={(e) => setFormData(prev => ({ ...prev, CNIC_BForm_No: e.target.value }))}
                placeholder="#####-#######-#"
              />
            </div>

            <div className="space-y-2">
              <Label>Disability Category</Label>
              <Select
                value={formData.Disability_Category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, Disability_Category: value as DisabilityCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Category A</SelectItem>
                  <SelectItem value="B">Category B</SelectItem>
                  <SelectItem value="C">Category C</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Disease/Disability</Label>
              <Textarea
                value={formData.Disease_Disability}
                onChange={(e) => setFormData(prev => ({ ...prev, Disease_Disability: e.target.value }))}
                placeholder="Describe the condition"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>School</Label>
              <Input
                value={formData.School}
                onChange={(e) => setFormData(prev => ({ ...prev, School: e.target.value }))}
                placeholder="Enter school name"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
