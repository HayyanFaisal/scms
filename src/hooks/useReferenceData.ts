import { useCallback, useEffect, useState } from 'react';
import { configuration, emptyReferenceData, type ReferenceData } from '@/services/configuration';

export function useReferenceData() {
  const [data, setData] = useState<ReferenceData>(emptyReferenceData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await configuration.loadReferenceData());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load configured choices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...data, loading, error, reload };
}
