
import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
  color: string;
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, trend, color, icon }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 transition-all hover:shadow-md">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-500 text-sm font-medium">{title}</p>
          <h3 className="text-2xl font-bold mt-1 text-slate-800">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-center space-x-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          trend === 'up' ? 'bg-green-100 text-green-700' : 
          trend === 'down' ? 'bg-red-100 text-red-700' : 
          'bg-slate-100 text-slate-700'
        }`}>
          {trend === 'up' ? '↑ +12%' : trend === 'down' ? '↓ -5%' : '0%'}
        </span>
        <span className="text-slate-400 text-xs">so với tháng trước</span>
      </div>
    </div>
  );
};

export default StatCard;
