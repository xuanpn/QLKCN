
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Transaction, TransactionType, Category, Tenant, PaymentStatus, 
  IndustrialZone, SystemConfig, WaterMeter, WaterReading 
} from './types';
import { MOCK_TRANSACTIONS, MOCK_TENANTS, MOCK_IZS, ICONS } from './constants';
import StatCard from './components/StatCard';
import { analyzeFinances } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'water' | 'transactions' | 'tenants' | 'zones' | 'ai' | 'settings'>('dashboard');
  const [izs, setIzs] = useState<IndustrialZone[]>(MOCK_IZS);
  const [tenants, setTenants] = useState<Tenant[]>(MOCK_TENANTS);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [meters, setMeters] = useState<WaterMeter[]>([
    { id: 'M1', tenantId: 'T1', name: 'Đồng hồ khu A', provider: 'Biwase', serialNumber: 'SN-001' },
    { id: 'M2', tenantId: 'T2', name: 'Đồng hồ xưởng B', provider: 'Sowatco', serialNumber: 'SN-002' }
  ]);
  const [waterReadings, setWaterReadings] = useState<WaterReading[]>([]);
  const [selectedIzId, setSelectedIzId] = useState<string>('ALL');
  
  // System Config
  const [sysConfig, setSysConfig] = useState<SystemConfig>({
    waterUnitPrice: 16800,
    wastewaterRatio: 0.8,
    telecomRevenueRatio: 0.2,
    incomeCategories: ['Nước sạch', 'Nước thải', 'Viễn thông (Điện thoại)', 'Viễn thông (Internet)', 'Viễn thông (Khác)', 'BTS']
  });

  // Modal states
  const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
  const [editingReading, setEditingReading] = useState<WaterReading | null>(null);
  const [isMeterModalOpen, setIsMeterModalOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<WaterMeter | null>(null);

  // Form local states for calculation
  const [selectedReadingTenantId, setSelectedReadingTenantId] = useState('');
  const [selectedReadingMeterId, setSelectedReadingMeterId] = useState('');
  const [currentUsageCalc, setCurrentUsageCalc] = useState({ prev: 0, curr: 0 });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  const filteredTenants = useMemo(() => 
    selectedIzId === 'ALL' ? tenants : tenants.filter(t => t.izId === selectedIzId), 
    [tenants, selectedIzId]
  );

  const filteredReadings = useMemo(() => {
    const tenantIds = filteredTenants.map(t => t.id);
    return waterReadings.filter(r => tenantIds.includes(r.tenantId));
  }, [waterReadings, filteredTenants]);

  const stats = useMemo(() => {
    const totalIncome = transactions.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0);
    return { totalIncome, balance };
  }, [transactions]);

  const saveReading = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const tenantId = formData.get('tenantId') as string;
    const meterId = formData.get('meterId') as string;
    const prev = Number(formData.get('prevIndex'));
    const curr = Number(formData.get('currIndex'));
    const ratio = Number(formData.get('wastewaterRatio')) / 100;
    const usage = curr - prev;
    const waterAmt = usage * sysConfig.waterUnitPrice;
    const wasteAmt = waterAmt * ratio;

    const newReading: WaterReading = {
      id: editingReading?.id || `R${Date.now()}`,
      tenantId,
      meterId,
      date: new Date().toISOString().split('T')[0],
      billingMonth: formData.get('billingMonth') as string,
      prevIndex: prev,
      currIndex: curr,
      usage,
      unitPrice: sysConfig.waterUnitPrice,
      waterAmount: waterAmt,
      wastewaterRatio: ratio,
      wastewaterAmount: wasteAmt,
      totalAmount: waterAmt + wasteAmt
    };

    if (editingReading) {
      setWaterReadings(waterReadings.map(r => r.id === editingReading.id ? newReading : r));
    } else {
      setWaterReadings([newReading, ...waterReadings]);
    }

    const tenant = tenants.find(t => t.id === tenantId);
    if (tenant) {
      const trans: Transaction = {
        id: `TX-W-${newReading.id}`,
        izId: tenant.izId,
        date: newReading.date,
        billingMonth: newReading.billingMonth,
        amount: newReading.totalAmount,
        type: TransactionType.INCOME,
        category: Category.WATER,
        tenantId: tenant.id,
        tenantName: tenant.name,
        description: `Chốt số nước tháng ${newReading.billingMonth} - ${usage}m3`,
        status: PaymentStatus.UNPAID
      };
      setTransactions([trans, ...transactions.filter(t => t.id !== `TX-W-${newReading.id}`)]);
      setTenants(tenants.map(t => t.id === tenant.id ? { ...t, lastWaterIndex: curr } : t));
    }

    setIsReadingModalOpen(false);
    setEditingReading(null);
  };

  const deleteReading = (id: string) => {
    if (confirm('Xóa bản ghi này? Giao dịch thu tiền liên quan cũng sẽ bị xóa.')) {
      setWaterReadings(waterReadings.filter(r => r.id !== id));
      setTransactions(transactions.filter(t => t.id !== `TX-W-${id}`));
    }
  };

  useEffect(() => {
    if (isReadingModalOpen && selectedReadingTenantId && selectedReadingMeterId) {
      const lastR = waterReadings
        .filter(r => r.tenantId === selectedReadingTenantId && r.meterId === selectedReadingMeterId)
        .sort((a,b) => b.billingMonth.localeCompare(a.billingMonth))[0];
      
      const defaultPrev = lastR ? lastR.currIndex : (tenants.find(t => t.id === selectedReadingTenantId)?.lastWaterIndex || 0);
      setCurrentUsageCalc(prev => ({ ...prev, prev: defaultPrev }));
    }
  }, [selectedReadingTenantId, selectedReadingMeterId, isReadingModalOpen, waterReadings]);

  const navItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: <ICONS.Dashboard /> },
    { id: 'water', label: 'Chỉ số nước', icon: <ICONS.Calculator /> },
    { id: 'tenants', label: 'Doanh nghiệp', icon: <ICONS.Tenants /> },
    { id: 'transactions', label: 'Sổ thu chi', icon: <ICONS.Transactions /> },
    { id: 'settings', label: 'Hệ thống', icon: <ICONS.Settings /> },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans flex-col md:flex-row">
      {/* Sidebar - Desktop Only */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col shrink-0">
        <div className="p-8 border-b border-slate-800 flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg">IZ</div>
          <span className="font-bold text-lg tracking-tight">Finance Pro</span>
        </div>
        
        <div className="p-4">
          <label className="text-[10px] font-bold text-slate-500 uppercase px-4 block mb-2">Chọn khu vực</label>
          <select value={selectedIzId} onChange={(e) => setSelectedIzId(e.target.value)} className="w-full bg-slate-800 border-none text-sm font-bold rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
            <option value="ALL">🌎 Tất cả các khu</option>
            {izs.map(iz => <option key={iz.id} value={iz.id}>{iz.name}</option>)}
          </select>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-indigo-600 shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
              {item.icon} <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 sticky top-0 z-40">
        <div className="flex items-center space-x-3">
           <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm">IZ</div>
           <h2 className="text-sm font-bold text-slate-800 truncate uppercase tracking-tighter">
            {navItems.find(i => i.id === activeTab)?.label}
          </h2>
        </div>
        <select 
          value={selectedIzId} 
          onChange={(e) => setSelectedIzId(e.target.value)} 
          className="bg-slate-100 border-none text-[10px] font-bold rounded-lg py-1.5 px-2 outline-none max-w-[120px]"
        >
          <option value="ALL">Tất cả khu</option>
          {izs.map(iz => <option key={iz.id} value={iz.id}>{iz.name}</option>)}
        </select>
      </header>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 px-2 py-1 flex justify-around shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        {navItems.map(item => (
          <button 
            key={item.id} 
            onClick={() => setActiveTab(item.id as any)} 
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === item.id ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <div className={`p-1 rounded-lg ${activeTab === item.id ? 'bg-indigo-50' : ''}`}>{item.icon}</div>
            <span className="text-[9px] font-bold mt-0.5">{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden pb-16 md:pb-0">
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 items-center justify-between px-8 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">
            {navItems.find(i => i.id === activeTab)?.label}
          </h2>
          <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
             {selectedIzId === 'ALL' ? 'Tổng hợp hệ thống' : izs.find(i => i.id === selectedIzId)?.name}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth bg-slate-50">
          {activeTab === 'dashboard' && (
            <div className="space-y-4 md:space-y-8 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <StatCard title="Tổng Thu nhập" value={formatCurrency(stats.totalIncome)} trend="up" color="bg-blue-600" icon={<ICONS.Check />} />
                <StatCard title="Số dư hiện tại" value={formatCurrency(stats.balance)} trend="up" color="bg-green-500" icon={<ICONS.Check />} />
              </div>
              <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-8">
                <h3 className="font-bold text-sm md:text-lg mb-4 md:mb-6 uppercase tracking-wider text-slate-400">Sản lượng nước (m3)</h3>
                <div className="h-48 md:h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waterReadings.slice(-6)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="billingMonth" tick={{fontSize: 10}} />
                      <YAxis tick={{fontSize: 10}} />
                      <Tooltip />
                      <Bar dataKey="usage" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'water' && (
            <div className="space-y-6 animate-fadeIn pb-12">
               {/* Meters Management (Danh mục đồng hồ) */}
               <div className="bg-white rounded-2xl md:rounded-[32px] p-5 md:p-8 border border-slate-200 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                     <div>
                        <h3 className="text-base md:text-lg font-black text-slate-800 uppercase tracking-widest">Danh mục Đồng hồ</h3>
                        <p className="text-[10px] md:text-xs text-slate-400 italic">Quản lý và đăng ký đồng hồ đo đếm</p>
                     </div>
                     <button onClick={() => { setEditingMeter(null); setIsMeterModalOpen(true); }} className="w-full sm:w-auto px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all text-xs">
                        + ĐĂNG KÝ ĐỒNG HỒ MỚI
                     </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                     {meters.length === 0 && <p className="text-slate-300 text-xs italic">Chưa có đồng hồ nào...</p>}
                     {meters.map(m => (
                        <div key={m.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group shadow-sm">
                           <div className="min-w-0 pr-2">
                              <p className="font-bold text-slate-800 text-sm truncate">{m.name}</p>
                              <p className="text-[9px] text-slate-400 font-black uppercase truncate">NCC: {m.provider} • SN: {m.serialNumber}</p>
                              <div className="text-[10px] text-indigo-500 font-bold mt-1.5 truncate bg-indigo-50 px-2 py-0.5 rounded-full inline-block">
                                Khách: {tenants.find(t => t.id === m.tenantId)?.name}
                              </div>
                           </div>
                           <div className="flex space-x-1 shrink-0">
                              <button onClick={() => { setEditingMeter(m); setIsMeterModalOpen(true); }} className="p-2 text-slate-400 bg-white rounded-lg shadow-sm hover:text-indigo-600 active:scale-90 transition-all"><ICONS.Settings /></button>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               {/* Water Readings (Bảng chốt số) */}
               <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="font-black text-slate-800 text-sm md:text-lg uppercase tracking-widest">Lịch sử chốt chỉ số</h3>
                    <button onClick={() => { 
                       setEditingReading(null); 
                       setSelectedReadingTenantId('');
                       setSelectedReadingMeterId('');
                       setIsReadingModalOpen(true); 
                    }} className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 active:scale-95 transition-all text-sm md:text-base border-b-4 border-indigo-800">
                       + GHI CHỈ SỐ THÁNG MỚI
                    </button>
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden lg:block bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-5">Doanh nghiệp</th>
                          <th className="px-6 py-5">Tên đồng hồ</th>
                          <th className="px-6 py-5">Kỳ phí</th>
                          <th className="px-6 py-5 text-right">Chỉ số đầu</th>
                          <th className="px-6 py-5 text-right">Chỉ số cuối</th>
                          <th className="px-6 py-5 text-right">Sử dụng</th>
                          <th className="px-6 py-5 text-right">Tổng tiền</th>
                          <th className="px-6 py-5 text-center">Xử lý</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredReadings.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-5">
                               <p className="font-bold text-slate-800 text-sm">{tenants.find(t => t.id === r.tenantId)?.name}</p>
                               <p className="text-[10px] text-slate-400 font-bold uppercase">Lô {tenants.find(t => t.id === r.tenantId)?.lotNumber}</p>
                            </td>
                            <td className="px-6 py-5 text-[10px] font-medium text-slate-500">
                               {meters.find(m => m.id === r.meterId)?.name}
                            </td>
                            <td className="px-6 py-5 text-xs font-black text-indigo-600">{r.billingMonth}</td>
                            <td className="px-6 py-5 text-xs text-right font-mono">{r.prevIndex}</td>
                            <td className="px-6 py-5 text-xs text-right font-mono font-bold text-slate-800">{r.currIndex}</td>
                            <td className="px-6 py-5 text-xs text-right font-black text-blue-600">{r.usage} m3</td>
                            <td className="px-6 py-5 text-xs text-right font-bold">
                               <div className="text-slate-900">{formatCurrency(r.totalAmount)}</div>
                               <div className="text-amber-600 text-[9px] font-black uppercase">Phí thải: {formatCurrency(r.wastewaterAmount)}</div>
                            </td>
                            <td className="px-6 py-5 text-center">
                               <div className="flex justify-center space-x-2">
                                  <button onClick={() => { setEditingReading(r); setIsReadingModalOpen(true); }} className="p-2 text-slate-300 hover:text-indigo-600"><ICONS.Settings /></button>
                                  <button onClick={() => deleteReading(r.id)} className="p-2 text-slate-300 hover:text-red-500"><ICONS.Trash /></button>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card-based List */}
                  <div className="lg:hidden space-y-4">
                    {filteredReadings.length === 0 && <p className="text-center py-10 text-slate-300 italic text-sm font-medium">Chưa có dữ liệu chốt số.</p>}
                    {filteredReadings.map(r => (
                      <div key={r.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden transition-all active:bg-slate-50 border-l-4 border-l-indigo-500">
                        <div className="flex justify-between items-start mb-3">
                          <div className="min-w-0 pr-10">
                            <p className="font-bold text-slate-800 text-sm truncate">{tenants.find(t => t.id === r.tenantId)?.name}</p>
                            <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mt-0.5">{r.billingMonth} • {meters.find(m => m.id === r.meterId)?.name}</p>
                          </div>
                          <div className="flex absolute top-3 right-3 space-x-1">
                            <button onClick={() => { setEditingReading(r); setIsReadingModalOpen(true); }} className="p-2 text-slate-400 bg-slate-50 rounded-lg shadow-sm"><ICONS.Settings /></button>
                            <button onClick={() => deleteReading(r.id)} className="p-2 text-red-500 bg-red-50 rounded-lg shadow-sm"><ICONS.Trash /></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                           <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 text-center">
                              <p className="text-[9px] font-black text-blue-400 uppercase">Tiêu thụ (m3)</p>
                              <p className="font-black text-blue-600 text-xl">{r.usage}</p>
                           </div>
                           <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50 text-center">
                              <p className="text-[9px] font-black text-indigo-400 uppercase">Thành tiền</p>
                              <p className="font-black text-indigo-600 text-lg leading-tight truncate">{formatCurrency(r.totalAmount)}</p>
                           </div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-100">
                           <span className="font-bold text-slate-500">Chỉ số: <span className="font-black text-slate-700">{r.prevIndex} → {r.currIndex}</span></span>
                           <span className="font-black text-amber-600 uppercase">Thải: {formatCurrency(r.wastewaterAmount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn pb-12">
               <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[40px] border border-slate-200 shadow-sm">
                  <h3 className="text-xl md:text-2xl font-black mb-6 md:mb-8 text-slate-800 tracking-tight">Cấu hình Hệ thống</h3>
                  <div className="space-y-6">
                     <div className="space-y-2">
                        <label className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Đơn giá nước sạch (VNĐ/m3)</label>
                        <input type="number" inputMode="numeric" value={sysConfig.waterUnitPrice} onChange={e => setSysConfig({...sysConfig, waterUnitPrice: Number(e.target.value)})} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-xl md:text-3xl outline-none ring-2 ring-transparent focus:ring-indigo-500 transition-all text-indigo-600" />
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Phí thải mặc định (%)</label>
                        <input type="number" inputMode="numeric" value={sysConfig.wastewaterRatio * 100} onChange={e => setSysConfig({...sysConfig, wastewaterRatio: Number(e.target.value)/100})} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-xl md:text-3xl outline-none ring-2 ring-transparent focus:ring-indigo-500 transition-all text-indigo-600" />
                     </div>
                     
                     <div className="p-5 bg-slate-50 rounded-2xl mt-4 border border-slate-100">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Các khoản thu đang quản lý</h4>
                        <div className="flex flex-wrap gap-2">
                           {sysConfig.incomeCategories.map((cat, idx) => (
                              <div key={idx} className="bg-white px-3 py-2 rounded-lg border border-slate-100 text-[11px] font-bold text-slate-600 shadow-sm flex items-center space-x-2">
                                 <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                 <span>{cat}</span>
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* Fallback tabs UI */}
          {!['dashboard', 'water', 'settings'].includes(activeTab) && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300">
               <div className="p-8 bg-slate-100 rounded-full mb-6 border-4 border-white shadow-sm">
                <ICONS.Alert />
               </div>
               <p className="font-black uppercase text-xs tracking-[0.2em] text-slate-400">Đang cập nhật...</p>
               <p className="text-[10px] mt-2 text-slate-300 font-bold">Vui lòng quay lại sau</p>
            </div>
          )}
        </div>
      </main>

      {/* READING MODAL (Add/Edit) - Full Screen on Mobile */}
      {isReadingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 md:backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
           <div className="bg-white rounded-t-[32px] md:rounded-[40px] w-full h-[95vh] md:h-auto md:max-w-2xl shadow-2xl animate-slideUp overflow-hidden flex flex-col">
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/20 shrink-0">
                 <div>
                    <h3 className="text-xl md:text-2xl font-black text-indigo-900 tracking-tight">
                      {editingReading ? 'Sửa chốt số' : 'Ghi chỉ số mới'}
                    </h3>
                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Đồng hồ nước & Phí thải</p>
                 </div>
                 <button onClick={() => setIsReadingModalOpen(false)} className="bg-white p-2.5 rounded-full shadow-md text-slate-400 hover:text-red-500 active:scale-75 transition-all">✕</button>
              </div>
              <form onSubmit={saveReading} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 pb-20 md:pb-8">
                 <div className="space-y-5">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Khách hàng thuê</label>
                       <select name="tenantId" required value={selectedReadingTenantId} onChange={e => setSelectedReadingTenantId(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-50 border-none outline-none font-bold text-base md:text-lg appearance-none ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer">
                          <option value="">-- Chọn doanh nghiệp --</option>
                          {filteredTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Chọn Đồng hồ (NCC)</label>
                       <select name="meterId" required value={selectedReadingMeterId} onChange={e => setSelectedReadingMeterId(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-50 border-none outline-none font-bold text-base md:text-lg appearance-none ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer">
                          <option value="">-- Chọn đồng hồ của DN --</option>
                          {meters.filter(m => m.tenantId === selectedReadingTenantId).map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                          ))}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Tháng chốt phí</label>
                       <input type="month" name="billingMonth" required defaultValue={editingReading?.billingMonth || new Date().toISOString().slice(0, 7)} className="w-full p-4 rounded-2xl bg-slate-50 border-none outline-none font-bold text-base ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-500 transition-all" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Phí thải (%)</label>
                       <input type="number" inputMode="numeric" step="1" name="wastewaterRatio" defaultValue={(editingReading?.wastewaterRatio || sysConfig.wastewaterRatio) * 100} className="w-full p-4 rounded-2xl bg-slate-50 border-none outline-none font-bold text-base text-indigo-600 ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-500 transition-all" />
                    </div>
                 </div>

                 <div className="p-6 md:p-8 bg-blue-50/50 rounded-3xl border border-blue-100/50 space-y-6 shadow-inner">
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest text-center block">Chỉ số đầu</label>
                          <input type="number" inputMode="numeric" name="prevIndex" value={editingReading ? editingReading.prevIndex : currentUsageCalc.prev} onChange={e => setCurrentUsageCalc({...currentUsageCalc, prev: Number(e.target.value)})} className="w-full p-5 rounded-2xl bg-white border-2 border-blue-100/50 outline-none font-black text-2xl text-center shadow-sm focus:border-blue-400 transition-all" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest text-center block">Chỉ số cuối</label>
                          <input type="number" inputMode="numeric" name="currIndex" defaultValue={editingReading?.currIndex} onChange={e => setCurrentUsageCalc({...currentUsageCalc, curr: Number(e.target.value)})} required className="w-full p-5 rounded-2xl bg-white border-2 border-blue-500 outline-none font-black text-2xl text-center shadow-md focus:ring-2 focus:ring-blue-500 transition-all" />
                        </div>
                    </div>
                    
                    <div className="bg-blue-600 rounded-[24px] p-5 shadow-xl flex items-center justify-between text-white border-b-4 border-blue-800">
                        <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Số m3 tiêu thụ</p>
                          <p className="text-4xl font-black leading-none">
                            {editingReading ? editingReading.usage : (currentUsageCalc.curr - currentUsageCalc.prev > 0 ? currentUsageCalc.curr - currentUsageCalc.prev : 0)}
                            <span className="text-base font-bold ml-2 opacity-80 uppercase">m3</span>
                          </p>
                        </div>
                        <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md border border-white/20">
                          <ICONS.Calculator />
                        </div>
                    </div>
                 </div>

                 <button type="submit" className="w-full py-5 md:py-6 bg-indigo-600 text-white rounded-2xl md:rounded-[24px] font-black text-lg md:text-xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all sticky bottom-0 border-b-4 border-indigo-900">
                    LƯU CHỈ SỐ & TẠO PHIẾU THU
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* METER MODAL - Full Screen on Mobile */}
      {isMeterModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 md:backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
           <div className="bg-white rounded-t-[32px] md:rounded-[40px] w-full h-[85vh] md:h-auto md:max-w-lg shadow-2xl animate-slideUp flex flex-col overflow-hidden">
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                 <div>
                    <h3 className="text-lg md:text-2xl font-black text-slate-800 tracking-tight">
                        {editingMeter ? 'Cập nhật Đồng hồ' : 'Đăng ký Đồng hồ'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Khai báo thiết bị đo đếm</p>
                 </div>
                 <button onClick={() => setIsMeterModalOpen(false)} className="bg-white p-2.5 rounded-full shadow-md text-slate-400 active:scale-90 transition-all">✕</button>
              </div>
              <form onSubmit={(e) => {
                 e.preventDefault();
                 const fd = new FormData(e.currentTarget);
                 const newM: WaterMeter = {
                    id: editingMeter?.id || `M${Date.now()}`,
                    tenantId: fd.get('tenantId') as string,
                    name: fd.get('name') as string,
                    provider: fd.get('provider') as string,
                    serialNumber: fd.get('serialNumber') as string,
                 };
                 if (editingMeter) setMeters(meters.map(m => m.id === editingMeter.id ? newM : m));
                 else setMeters([...meters, newM]);
                 setIsMeterModalOpen(false);
              }} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5 pb-12">
                 <div className="space-y-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Doanh nghiệp khách hàng</label>
                      <select name="tenantId" required defaultValue={editingMeter?.tenantId || ''} className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-base appearance-none ring-1 ring-slate-200">
                         <option value="">-- Chọn doanh nghiệp --</option>
                         {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tên đồng hồ</label>
                      <input name="name" required defaultValue={editingMeter?.name} placeholder="VD: Đồng hồ khu A" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500" />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Đơn vị cung cấp (NCC)</label>
                      <input name="provider" required defaultValue={editingMeter?.provider} placeholder="VD: Biwase" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500" />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Số Seri / Mã thiết bị</label>
                      <input name="serialNumber" required defaultValue={editingMeter?.serialNumber} placeholder="VD: SN-123456" className="w-full p-4 rounded-xl bg-slate-50 border-none outline-none font-bold text-base ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500" />
                   </div>
                 </div>
                 <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all border-b-4 border-indigo-900">
                    XÁC NHẬN LƯU ĐỒNG HỒ
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
