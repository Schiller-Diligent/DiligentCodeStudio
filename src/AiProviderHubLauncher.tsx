import { useEffect, useState } from 'react';
import AiProviderHubPanel from './AiProviderHubPanel';

export const DCS_OPEN_AI_PROVIDER_HUB_EVENT = 'dcs-open-ai-provider-hub';

export default function AiProviderHubLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openHub = () => setOpen(true);
    window.addEventListener(DCS_OPEN_AI_PROVIDER_HUB_EVENT, openHub);
    return () => window.removeEventListener(DCS_OPEN_AI_PROVIDER_HUB_EVENT, openHub);
  }, []);

  return <AiProviderHubPanel open={open} onClose={() => setOpen(false)} />;
}