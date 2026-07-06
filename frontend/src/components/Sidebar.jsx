import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlayCircle, BarChart3, Wrench, Calendar, Trello, Zap, Bell, ShieldCheck, Sparkles } from 'lucide-react';
import clsx from 'clsx';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/runs', label: 'Test Runs', icon: PlayCircle },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/healing', label: 'AI Healing', icon: Wrench },
  { to: '/demo', label: 'AI Healing Demo', icon: Sparkles },
  { to: '/coverage', label: 'Coverage Intelligence', icon: ShieldCheck },
  { to: '/triggers', label: 'Jira Triggers', icon: Bell },
  { to: '/jira', label: 'Jira Issues', icon: Trello },
  { to: '/scheduler', label: 'Scheduler', icon: Calendar },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-950 border-r border-gray-800 flex flex-col z-30">
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">AI QA Platform</p>
            <p className="text-xs text-gray-500">Autonomous Testing</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="glass-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">System Online</span>
          </div>
          <p className="text-xs text-gray-500">AI Healing Active</p>
        </div>
      </div>
    </aside>
  );
}
