export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSeen: string;
  avatarUrl: string;
  labels: string[]; // Array of label IDs
  phone?: string;
  address?: string;
  notes?: string;
}

export interface CustomList {
  id: string;
  name: string;
  customerIds: string[];
}
