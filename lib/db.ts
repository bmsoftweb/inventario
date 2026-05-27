import { openDB, IDBPDatabase } from 'idb';

/**
 * Generates a unique 25-character ID in the format:
 * YYYYMMDD + HHMMSSmmm + 8 random digits
 */
export function generateAppId(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const dateStr = `${year}${month}${day}`; // YYYYMMDD
  
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const millis = now.getMilliseconds().toString().padStart(3, '0');
  const timeStr = `${hours}${minutes}${seconds}${millis}`; // HHMMSSmmm
  
  const randomStr = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  
  return `${dateStr}${timeStr}${randomStr}`;
}

const DB_NAME = 'estoque_db';
const DB_VERSION = 2;

export interface Product {
  id_app: string;
  date_update: string;
  id_bm: number;
  id_bm_produtosprincipal?: number;
  referencia: string;
  descricao: string;
  marca: string;
  foto?: string | null;
  ativo?: string;
}

export interface Inventory {
  id_app: string;
  date_update: string;
  data: string;
  datahora_abertura?: string | null;
  datahora_fechamento?: string | null;
  obs?: string;
  status?: string;
  ativo?: string;
}

export interface InventoryItem {
  id_app: string;
  date_update: string;
  inventario_id_app: string;
  produto_id_app: string;
  produto_referencia: string;
  qtdade: number;
  ativo?: string;
}

export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('app_produtos')) {
        const store = db.createObjectStore('app_produtos', { keyPath: 'id_app' });
        store.createIndex('by_referencia', 'referencia');
      }
      if (!db.objectStoreNames.contains('app_inventarios')) {
        db.createObjectStore('app_inventarios', { keyPath: 'id_app' });
      }
      if (!db.objectStoreNames.contains('app_inventarios_produtos')) {
        const store = db.createObjectStore('app_inventarios_produtos', { keyPath: 'id_app' });
        store.createIndex('by_inventario', 'inventario_id_app');
      }
    },
  });
}

export const dbService = {
  async getProducts() {
    const db = await initDB();
    return db.getAll('app_produtos');
  },
  async saveProduct(product: Product) {
    const db = await initDB();
    return db.put('app_produtos', product);
  },
  async getInventories() {
    const db = await initDB();
    const all = await db.getAll('app_inventarios');
    // Filtra por ativo='S' e status='A' (Aberto) conforme solicitado para ocultar os fechados
    return all.filter((i: any) => i.ativo !== 'N' && i.status !== 'F');
  },
  async getInventoriesRaw() {
    const db = await initDB();
    return db.getAll('app_inventarios');
  },
  async saveInventory(inventory: Inventory) {
    const db = await initDB();
    if (!inventory.ativo) inventory.ativo = 'S';
    if (!inventory.status) inventory.status = 'A';
    return db.put('app_inventarios', inventory);
  },
  async getInventoryItems(inventoryId: string) {
    const db = await initDB();
    const all = await db.getAllFromIndex('app_inventarios_produtos', 'by_inventario', inventoryId);
    return all.filter((i: any) => i.ativo !== 'N');
  },
  async getInventoryItemsRaw(inventoryId: string) {
    const db = await initDB();
    return db.getAllFromIndex('app_inventarios_produtos', 'by_inventario', inventoryId);
  },
  async saveInventoryItem(item: InventoryItem) {
    const db = await initDB();
    if (!item.ativo) item.ativo = 'S';
    return db.put('app_inventarios_produtos', item);
  },
  async deleteInventoryItem(idApp: string) {
    const db = await initDB();
    const item = await db.get('app_inventarios_produtos', idApp);
    if (item) {
      item.ativo = 'N';
      item.date_update = new Date().toISOString();
      return db.put('app_inventarios_produtos', item);
    }
  },
  async findProductByReference(ref: string) {
    const db = await initDB();
    return db.getFromIndex('app_produtos', 'by_referencia', ref);
  },
  async clearAll() {
    const db = await initDB();
    const tx = db.transaction(['app_produtos', 'app_inventarios', 'app_inventarios_produtos'], 'readwrite');
    await tx.objectStore('app_produtos').clear();
    await tx.objectStore('app_inventarios').clear();
    await tx.objectStore('app_inventarios_produtos').clear();
    await tx.done;
  }
};
