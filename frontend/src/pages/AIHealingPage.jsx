import { Wrench } from 'lucide-react';
import LiveHealingView from './healing/LiveHealingView';

export default function AIHealingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wrench className="w-6 h-6 text-purple-400" />
          AI Healing
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Real regression execution and self-healing, live</p>
      </div>

      <LiveHealingView />
    </div>
  );
}
