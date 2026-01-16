
export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export enum Category {
  RENT = 'Thuê đất/xưởng',
  WATER = 'Nước sạch',
  WASTEWATER = 'Xử lý nước thải',
  TELECOM_PHONE = 'Viễn thông - Điện thoại',
  TELECOM_INTERNET = 'Viễn thông - Internet',
  TELECOM_OTHER = 'Viễn thông - Khác',
  BTS = 'Thuê đất trạm BTS',
  MAINTENANCE = 'Bảo trì',
  SALARY = 'Lương',
  OTHER = 'Khác'
}

export enum PaymentStatus {
  PAID = 'PAID',
  UNPAID = 'UNPAID',
  OVERDUE = 'OVERDUE'
}

export interface WaterMeter {
  id: string;
  tenantId: string;
  name: string; // Tên đồng hồ
  provider: string; // Nhà cung cấp (NCC)
  serialNumber: string;
}

export interface WaterReading {
  id: string;
  tenantId: string;
  meterId: string;
  date: string; // Ngày ghi
  billingMonth: string; // Tháng chốt phí (YYYY-MM)
  prevIndex: number;
  currIndex: number;
  usage: number;
  unitPrice: number;
  waterAmount: number;
  wastewaterRatio: number; // e.g., 0.8
  wastewaterAmount: number;
  totalAmount: number;
}

export interface SystemConfig {
  waterUnitPrice: number;
  wastewaterRatio: number; // e.g., 0.8 (80%)
  telecomRevenueRatio: number; 
  incomeCategories: string[];
}

export interface IndustrialZone {
  id: string;
  name: string;
  location: string;
  description: string;
}

export interface Tenant {
  id: string;
  izId: string;
  name: string;
  lotNumber: string;
  industry: string;
  status: 'ACTIVE' | 'INACTIVE';
  lastWaterIndex: number;
  btsFee: number;
  lastUpdateDate?: string;
  services: {
    water: boolean;
    wastewater: boolean;
    telecom: boolean;
    bts: boolean;
  };
}

export interface Transaction {
  id: string;
  izId: string;
  date: string;
  billingMonth?: string;
  amount: number;
  type: TransactionType;
  category: Category;
  tenantId: string;
  tenantName: string;
  description: string;
  status: PaymentStatus;
  details?: any;
}
