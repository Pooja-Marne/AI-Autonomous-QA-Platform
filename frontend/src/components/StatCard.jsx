import clsx from 'clsx';

export default function StatCard({ label, value, sub, icon: Icon, color = 'blue', trend }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-green-400 bg-green-500/10',
    red: 'text-red-400 bg-red-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
  };

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value ?? '—'}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          {trend !== undefined && (
            <p className={clsx('text-xs mt-1 font-medium', trend >= 0 ? 'text-green-400' : 'text-red-400')}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last run
            </p>
          )}
        </div>
        {Icon && (
          <div className={clsx('p-2.5 rounded-lg', colors[color])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
