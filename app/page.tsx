'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  ClipboardList, 
  RefreshCcw, 
  LogOut, 
  Search, 
  Plus, 
  Edit, 
  Type, 
  X,
  ArrowLeft,
  Barcode,
  Save,
  CheckCircle,
  Database,
  XCircle,
  Clock,
  ChevronRight,
  Trash2,
  Keyboard,
  Camera,
  Sparkles,
  Lock,
  Unlock
} from 'lucide-react';
import { dbService, generateAppId, Product, Inventory, InventoryItem } from '@/lib/db';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';

// --- Helpers ---
const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const formatDateTime = (isoString: string) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
  } catch (e) {
    return '';
  }
};

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

const parseBankInput = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits) / 100;
};

const playErrorBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const playSingleBeep = (startTime: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(1500, startTime);
      
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1550, startTime);
      
      gainNode.gain.setValueAtTime(0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + 0.15);
      osc2.stop(startTime + 0.15);
    };

    const now = ctx.currentTime;
    playSingleBeep(now);
    playSingleBeep(now + 0.2);
    playSingleBeep(now + 0.4);
  } catch (error) {
    console.warn("Erro ao reproduzir áudio:", error);
  }
};

// --- Types ---
type Screen = 'menu' | 'produtos' | 'inventarios' | 'sincronizar' | 'digitar';

interface Toast {
  id: string;
  message: string;
  detail?: string;
  type: 'success' | 'error';
}

interface ConfirmOptions {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  confirmColorClassName?: string;
  icon?: React.ReactNode;
}

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('menu');
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  
  // UI State
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmOptions | null>(null);

  const addToast = (message: string, type: 'success' | 'error', detail?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, detail, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText?: string,
    confirmColorClassName?: string,
    icon?: React.ReactNode
  ) => {
    setConfirmModal({ title, message, onConfirm, confirmText, confirmColorClassName, icon });
  };

  // Database state
  const [products, setProducts] = useState<Product[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Direct sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Load initial data
  useEffect(() => {
    loadData();
  }, [currentScreen]);

  async function loadData() {
    setLoading(true);
    const p = await dbService.getProducts();
    const i = await dbService.getInventories();
    setProducts(p);
    setInventories(i);
    setLoading(false);
  }

  const handleDirectSync = async () => {
    setSyncLoading(true);
    setSyncMessage('Preparando dados para sincronização...');
    try {
      // 1. Obter configuração do MySQL
      let config = { host: '', port: '3306', database: '' };
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('mysql_config');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            config = {
              host: parsed.host || '',
              port: parsed.port || '3306',
              database: parsed.database || ''
            };
          } catch (e) {}
        }
      }

      // Se host ou database vazio, tenta carregar defaults do backend
      if (!config.host || !config.database) {
        try {
          const resDefault = await fetch('/api/sync');
          const dataDefault = await resDefault.json();
          config = {
            host: config.host || dataDefault.host || '',
            port: config.port || dataDefault.port || '3306',
            database: config.database || dataDefault.database || ''
          };
        } catch (err) {
          console.warn('Erro ao carregar configurações padrão na sincronização direta:', err);
        }
      }

      // 2. Coletar dados locais
      setSyncMessage('Coletando dados locais...');
      const localProducts = await dbService.getProducts();
      const localInventories = await dbService.getInventoriesRaw();
      const allItems: InventoryItem[] = [];
      for (const inv of localInventories) {
        const items = await dbService.getInventoryItemsRaw(inv.id_app);
        allItems.push(...items);
      }

      // 3. Enviar para API de Sincronização
      setSyncMessage('Sincronizando com o servidor...');
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          action: 'sync',
          data: {
            localProducts,
            localInventories,
            localItems: allItems
          }
        })
      });

      const result = await res.json();
      if (result.success) {
        setSyncMessage('Atualizando banco de dados local...');
        await dbService.clearAll();
        for (const p of result.data.products) await dbService.saveProduct(p);
        for (const i of result.data.inventories) await dbService.saveInventory(i);
        for (const it of result.data.items) await dbService.saveInventoryItem(it);
        
        await loadData();
        addToast('Sincronização OK', 'success', result.message || 'Sincronização realizada com sucesso!');
      } else {
        addToast('Erro ao sincronizar', 'error', result.error);
      }
    } catch (e: any) {
      addToast('Falha na sincronização', 'error', e.message);
    } finally {
      setSyncLoading(false);
      setSyncMessage('');
    }
  };

  // Main Render
  return (
    <main className="w-full h-screen h-[100dvh] bg-slate-50 relative flex flex-col overflow-hidden text-slate-900 border-none">
      <AnimatePresence mode="wait">
        <motion.div
           key={currentScreen}
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           exit={{ opacity: 0, x: -20 }}
           transition={{ duration: 0.25, ease: "easeOut" }}
           className="flex-1 h-screen overflow-hidden"
        >
          {currentScreen === 'menu' && <MenuScreen onNavigate={setCurrentScreen} />}
          {currentScreen === 'produtos' && (
            <ProductsScreen 
              products={products} 
              searchQuery={searchQuery} 
              setSearchQuery={setSearchQuery} 
              onBack={() => setCurrentScreen('menu')} 
              addToast={addToast}
            />
          )}
          {currentScreen === 'inventarios' && (
            <InventoriesScreen 
              inventories={inventories} 
              loadData={loadData} 
              onBack={() => setCurrentScreen('menu')}
              addToast={addToast}
              showConfirm={showConfirm}
              onSelectInventory={(inv: Inventory) => {
                setSelectedInventory(inv);
                setCurrentScreen('digitar');
              }}
              onSync={handleDirectSync}
            />
          )}
          {currentScreen === 'digitar' && selectedInventory && (
            <DigitarScreen 
              products={products} 
              selectedInventory={selectedInventory} 
              onBack={() => setCurrentScreen('inventarios')} 
              addToast={addToast}
              showConfirm={showConfirm}
            />
          )}
          {currentScreen === 'sincronizar' && <SincronizarScreen onBack={() => setCurrentScreen('inventarios')} onSyncSuccess={loadData} addToast={addToast} />}
        </motion.div>
      </AnimatePresence>

      {/* Global Toast Overlay */}
      <div className="fixed top-4 right-4 left-4 z-[9999] pointer-events-none flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div 
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-4 rounded-xl shadow-2xl flex flex-col gap-1 pointer-events-auto border ${
                t.type === 'success' ? 'bg-white border-green-100' : 'bg-white border-red-100'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                <p className="text-sm font-bold text-slate-800 uppercase tracking-tight">{t.message}</p>
              </div>
              {t.detail && (
                <p className="text-[10px] text-slate-400 break-all leading-tight ml-7 uppercase tracking-widest">{t.detail}</p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Global Confirm Modal */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-3xl p-8 shadow-2xl flex flex-col text-center"
            >
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                {confirmModal.icon || <Trash2 className="w-8 h-8 text-slate-400" />}
              </div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight mb-2">{confirmModal.title}</h3>
              <p className="text-sm text-slate-500 font-bold mb-8 leading-relaxed uppercase tracking-wider text-[11px]">{confirmModal.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-4 text-slate-400 font-black uppercase tracking-widest text-[10px]"
                >
                  Não
                </button>
                <button 
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className={`flex-1 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all ${
                    confirmModal.confirmColorClassName || 'bg-red-500 shadow-red-200 hover:bg-red-600'
                  }`}
                >
                  {confirmModal.confirmText || 'Sim, Excluir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Sync Overlay */}
      <AnimatePresence>
        {syncLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[20000] flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="w-20 h-20 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-center mb-6 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-transparent animate-pulse" />
              <RefreshCcw className="w-10 h-10 text-blue-400 animate-spin" />
            </div>
            <h3 className="font-black text-white uppercase tracking-wider text-sm mb-2">Sincronizando Dados</h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest max-w-xs animate-pulse leading-relaxed">
              {syncMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// --- Screens Components ---

const MenuScreen = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => (
  <div className="flex flex-col h-full bg-slate-50">
    <div className="h-[100px] flex items-center justify-between px-6 bg-slate-900 text-white shadow-xl sticky top-0 z-10">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 border-2 border-blue-500 rounded flex items-center justify-center font-black text-blue-500 text-xs">V</div>
        <h1 className="text-lg font-black tracking-tight uppercase">Inventário</h1>
      </div>
      
      <div className="flex items-center space-x-2 bg-white/5 p-2 rounded">
        <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
      </div>
    </div>
    
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col">
        <MenuButton 
          icon={<Package className="w-5 h-5" />} 
          label="Produtos" 
          onClick={() => onNavigate('produtos')}
          color="text-blue-600"
        />
        <MenuButton 
          icon={<ClipboardList className="w-5 h-5" />} 
          label="Inventários" 
          onClick={() => onNavigate('inventarios')}
          color="text-blue-600"
        />
        <MenuButton 
          icon={<RefreshCcw className="w-5 h-5" />} 
          label="Sincronizar" 
          onClick={() => onNavigate('sincronizar')}
          color="text-blue-600"
        />
        <MenuButton 
          icon={<LogOut className="w-5 h-5" />} 
          label="Sair do Aplicativo" 
          onClick={() => window.location.reload()}
          color="text-red-500"
        />
      </div>
    </div>

    <div className="py-2 bg-white border-t border-slate-100 text-center">
      <p className="text-[10px] text-slate-400 tracking-tighter uppercase opacity-50">v1.2.0 • ID: 2026031915455823677025266</p>
    </div>
  </div>
);

interface ProductsScreenProps {
  products: Product[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onBack: () => void;
  addToast: (msg: string, type: 'success' | 'error', detail?: string) => void;
}

const ProductsScreen = ({ products, searchQuery, setSearchQuery, onBack }: ProductsScreenProps) => {
  const filteredProducts = products.filter((p: Product) => {
    const desc = (p.descricao || '').toLowerCase();
    const ref = (p.referencia || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return desc.includes(query) || ref.includes(query);
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <Header title="Produtos" onBack={onBack} />
      <div className="bg-white border-b border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Filtrar por descrição ou ref..." 
            className="w-full pl-9 pr-4 py-3 bg-slate-50 border-none text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {filteredProducts.map((p: Product) => (
            <div key={p.id_app} className="bg-white p-5 border-b border-slate-100 group active:bg-slate-50 transition-colors">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 text-sm leading-tight uppercase tracking-tight">{p.descricao}</h3>
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    {p.id_bm_produtosprincipal !== undefined && (
                      <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Id: {p.id_bm_produtosprincipal}</span>
                    )}
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ref: {p.referencia}</span>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Marca: {p.marca}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4">
                <Package className="w-8 h-8" />
              </div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum produto encontrado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface InventoriesScreenProps {
  inventories: Inventory[];
  loadData: () => void;
  onBack: () => void;
  onSelectInventory: (inv: Inventory) => void;
  addToast: (msg: string, type: 'success' | 'error', detail?: string) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText?: string,
    confirmColorClassName?: string,
    icon?: React.ReactNode
  ) => void;
  onSync: () => void;
}

const InventoriesScreen = ({ inventories, loadData, onBack, onSelectInventory, addToast, showConfirm, onSync }: InventoriesScreenProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);

  const handleCreate = async () => {
    try {
      const now = new Date().toISOString();
      const newInv: Inventory = {
        id_app: generateAppId(),
        data: newDate,
        date_update: now,
        datahora_abertura: now
      };
      await dbService.saveInventory(newInv);
      setIsCreating(false);
      loadData();
      addToast('Inventário criado com sucesso!', 'success');
    } catch (e: any) {
      addToast('Erro ao criar inventário', 'error', e.message);
    }
  };

  const handleToggleClose = async (inv: Inventory) => {
    const isClosed = !!inv.datahora_fechamento;
    const actionWord = isClosed ? 'reabrir' : 'fechar';
    const confirmButtonText = isClosed ? 'Sim, Reabrir' : 'Sim, Fechar';
    const confirmColor = isClosed 
      ? 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700' 
      : 'bg-red-500 shadow-red-200 hover:bg-red-600';
    const confirmIcon = isClosed 
      ? <Unlock className="w-8 h-8 text-emerald-500" />
      : <Lock className="w-8 h-8 text-red-500" />;
    
    showConfirm(
      `${isClosed ? 'Reabrir' : 'Fechar'} Inventário`,
      `Tem certeza que deseja ${actionWord} o inventário de ${formatDate(inv.data)}?`,
      async () => {
        try {
          const now = new Date().toISOString();
          const nextClosed = isClosed ? null : now;
          const updated: Inventory = {
            ...inv,
            datahora_fechamento: nextClosed,
            ativo: nextClosed ? 'N' : 'S',
            date_update: now
          };
          await dbService.saveInventory(updated);
          addToast(`Inventário ${isClosed ? 'reaberto' : 'fechado'} com sucesso!`, 'success');
          loadData();
        } catch (e: any) {
          addToast(`Erro ao ${actionWord} inventário`, 'error', e.message);
        }
      },
      confirmButtonText,
      confirmColor,
      confirmIcon
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <Header title="Inventários" onBack={onBack} />
      
      <div className="bg-white border-b border-slate-200 flex flex-col">
        <button 
          onClick={() => setIsCreating(true)}
          className="w-full bg-blue-600 text-white py-4 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 active:bg-blue-700 transition-all border-b border-slate-100"
        >
          <Plus className="w-5 h-5" /> Novo Inventário
        </button>
        <button 
          onClick={onSync}
          className="w-full bg-slate-900 text-white py-4 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 active:bg-slate-800 transition-all"
        >
          <RefreshCcw className="w-5 h-5 text-blue-400" /> Sincronizar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {inventories.map((inv: Inventory) => (
            <div key={inv.id_app} className="bg-white p-5 border-b border-slate-100 animate-fade-in">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight uppercase leading-none">
                      Inventário {formatDate(inv.data)}
                    </h3>
                    {inv.datahora_fechamento ? (
                      <span className="bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-red-100 flex items-center gap-1 shrink-0">
                        <Lock className="w-2.5 h-2.5" /> Fechado
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1 shrink-0">
                        <Unlock className="w-2.5 h-2.5" /> Aberto
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold tracking-widest">
                      <Clock className="w-3 h-3 text-slate-300" />
                      Abertura: {inv.datahora_abertura ? formatDateTime(inv.datahora_abertura) : "Não informada"}
                    </div>
                    {inv.datahora_fechamento && (
                      <div className="flex items-center gap-1.5 text-red-400 text-[10px] uppercase font-bold tracking-widest">
                        <Lock className="w-3 h-3 text-red-300" />
                        Fechamento: {formatDateTime(inv.datahora_fechamento)}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold tracking-widest">
                      <Clock className="w-3 h-3 text-slate-300" />
                      Atu: {formatDateTime(inv.date_update)}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    if (inv.datahora_fechamento) {
                      addToast('Este inventário está fechado e não pode mais ser digitado.', 'error');
                      return;
                    }
                    onSelectInventory(inv);
                  }}
                  className={`flex items-center justify-center gap-2 py-3 rounded font-bold transition-all ${
                    inv.datahora_fechamento 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                      : 'bg-slate-900 text-white active:bg-slate-800'
                  }`}
                >
                  <Type className="w-4 h-4 text-blue-400 flex-shrink-0" /> 
                  <span className="text-[11px] uppercase tracking-widest">Digitar</span>
                </button>
                <button 
                  onClick={() => handleToggleClose(inv)}
                  className={`flex items-center justify-center gap-2 py-3 rounded font-bold transition-all border ${
                    inv.datahora_fechamento
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200 active:bg-emerald-100'
                      : 'bg-red-50 text-red-600 border-red-200 active:bg-red-100'
                  }`}
                >
                  {inv.datahora_fechamento ? (
                    <>
                      <Unlock className="w-4 h-4 text-emerald-500 flex-shrink-0" /> 
                      <span className="text-[11px] uppercase tracking-widest">Reabrir</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-red-500 flex-shrink-0" /> 
                      <span className="text-[11px] uppercase tracking-widest">Fechar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
          {inventories.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4">
                <ClipboardList className="w-8 h-8" />
              </div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sem inventários ativos</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal-like Overlay for Creating */}
      <AnimatePresence>
          {isCreating && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-50 flex items-end sm:items-center justify-center"
          >
            <motion.div 
              initial={{ y: 50 }} animate={{ y: 0 }} exit={{ y: 50 }}
              className="bg-white w-full max-w-md p-6 shadow-2xl rounded-3xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black uppercase tracking-tight text-slate-900">Novo Inventário</h2>
              </div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Data do Inventário</label>
              <input 
                type="date" 
                autoFocus
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 mb-6 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all text-slate-800"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
              <div className="flex gap-4">
                <button onClick={() => setIsCreating(false)} className="flex-1 py-3 font-bold text-slate-400 uppercase tracking-widest text-sm">Cancelar</button>
                <button onClick={handleCreate} className="flex-1 bg-blue-600 text-white py-3 font-bold uppercase tracking-widest text-sm shadow active:bg-blue-700">Criar Agora</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface DigitarScreenProps {
  products: Product[];
  selectedInventory: Inventory;
  onBack: () => void;
  addToast: (msg: string, type: 'success' | 'error', detail?: string) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText?: string,
    confirmColorClassName?: string,
    icon?: React.ReactNode
  ) => void;
}

const DigitarScreen = ({ products, selectedInventory, onBack, addToast, showConfirm }: DigitarScreenProps) => {
  const [scanActive, setScanActive] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [foundedProduct, setFoundedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('0,00');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [digitarQtdMode, setDigitarQtdMode] = useState<boolean>(false);

  // --- Captura Conjunto States ---
  const [capturaConjuntoOpen, setCapturaConjuntoOpen] = useState(false);
  const [capturaProductType, setCapturaProductType] = useState('');
  const [capturaSelectedProduct, setCapturaSelectedProduct] = useState<Product | null>(null);
  const [capturaImageBase64, setCapturaImageBase64] = useState<string>('');
  const [capturaMimeType, setCapturaMimeType] = useState<string>('');
  const [capturaLoading, setCapturaLoading] = useState(false);
  const [capturaCountResult, setCapturaCountResult] = useState<number | null>(null);
  const [capturaReasoning, setCapturaReasoning] = useState<string | null>(null);
  const [capturaFinalQty, setCapturaFinalQty] = useState<string>('0,00');

  const handleCapturaQtyChange = (val: string) => {
    const numeric = parseBankInput(val);
    setCapturaFinalQty(formatCurrency(numeric));
  };

  const handleAiCount = async () => {
    if (!capturaImageBase64 || !capturaProductType) return;

    setCapturaLoading(true);
    setCapturaCountResult(null);
    setCapturaReasoning(null);

    try {
      const response = await fetch("/api/gemini/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: capturaImageBase64,
          mimeType: capturaMimeType || "image/jpeg",
          productDescription: capturaProductType
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Erro de servidor ao processar imagem");
      }

      const data = await response.json();
      setCapturaCountResult(data.count);
      setCapturaReasoning(data.reasoning);
      setCapturaFinalQty(formatCurrency(data.count));

    } catch (err: any) {
      console.error(err);
      addToast(err.message || 'Erro ao contar produtos com a IA.', 'error');
    } finally {
      setCapturaLoading(false);
    }
  };

  const handleConfirmCapturaCount = async () => {
    if (!capturaSelectedProduct || !selectedInventory || !capturaFinalQty) return;

    try {
      const numericQtd = parseBankInput(capturaFinalQty);
      if (numericQtd <= 0) {
        addToast('Quantidade deve ser maior que zero.', 'error');
        return;
      }

      const newItem: InventoryItem = {
        id_app: generateAppId(),
        inventario_id_app: selectedInventory.id_app,
        produto_id_app: capturaSelectedProduct.id_app,
        produto_referencia: capturaSelectedProduct.referencia,
        qtdade: numericQtd,
        date_update: new Date().toISOString()
      };

      await dbService.saveInventoryItem(newItem);
      const updated = await dbService.getInventoryItems(selectedInventory.id_app);
      setItems(updated);

      // Reset and close
      setCapturaConjuntoOpen(false);
      setCapturaSelectedProduct(null);
      setCapturaProductType('');
      setCapturaImageBase64('');
      setCapturaCountResult(null);
      setCapturaReasoning(null);
      setCapturaFinalQty('0,00');

      addToast(`Contagem de "${capturaSelectedProduct.descricao}" salva com sucesso!`, 'success');
    } catch (err: any) {
      addToast('Erro ao gravar contagem', 'error', err.message || String(err));
    }
  };

  const handleSearch = useCallback(async (code: string) => {
    if (!code) return;
    const trimmedCode = code.trim();
    
    // 1. Procure o produto pelo campo "referencia"
    let found = products.find((p: Product) => {
      return p.referencia && p.referencia.toString().trim() === trimmedCode;
    });

    // 2. Se não achar, procure pelo campo "id_bm_produtosprincipal"
    if (!found) {
      found = products.find((p: Product) => {
        return p.id_bm_produtosprincipal !== undefined && 
               p.id_bm_produtosprincipal !== null && 
               p.id_bm_produtosprincipal.toString().trim() === trimmedCode;
      });
    }

    if (found) {
      if (digitarQtdMode) {
        setFoundedProduct(found);
        setQuantity('1,00'); // Default to 1.00 when found
      } else {
        try {
          const newItem: InventoryItem = {
            id_app: generateAppId(),
            inventario_id_app: selectedInventory.id_app,
            produto_id_app: found.id_app,
            produto_referencia: found.referencia,
            qtdade: 1,
            date_update: new Date().toISOString()
          };
          await dbService.saveInventoryItem(newItem);
          const updated = await dbService.getInventoryItems(selectedInventory.id_app);
          setItems(updated);
          addToast(`Item "${found.descricao}" adicionado (Qtd: 1)`, 'success');
          setBarcode('');
          setFoundedProduct(null);
        } catch (err: any) {
          addToast('Erro ao salvar item', 'error', err.message || String(err));
        }
      }
    } else {
      // 3. Emitir som estridente e mensagem de erro
      playErrorBeep();
      addToast(`Produto não localizado para o código: "${code}"`, 'error');
    }
  }, [products, digitarQtdMode, selectedInventory, addToast]);

  useEffect(() => {
    if (selectedInventory) {
      dbService.getInventoryItems(selectedInventory.id_app).then(setItems);
    }
  }, [selectedInventory]);

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [camerasLoaded, setCamerasLoaded] = useState<boolean>(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('environment');

  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const isScanningRef = React.useRef<boolean>(false);

  // Fetch cameras list when scanner is active
  useEffect(() => {
    if (!scanActive) {
      const t = setTimeout(() => {
        setCamerasLoaded(false);
        setCameras([]);
      }, 0);
      return () => clearTimeout(t);
    }

    let active = true;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!active) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
        }
        setCamerasLoaded(true);
      })
      .catch((err) => {
        console.warn("Erro ao listar câmeras:", err);
        if (active) {
          setCamerasLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [scanActive]);

  // Start scanner when scanActive, selectedCameraId, and camerasLoaded are ready
  useEffect(() => {
    if (!scanActive || !selectedCameraId || !camerasLoaded) {
      return;
    }

    let active = true;
    let html5QrCode: Html5Qrcode | null = null;

    const startCamera = async () => {
      try {
        const el = document.getElementById("reader");
        if (!el) {
          if (active) {
            setTimeout(startCamera, 50);
          }
          return;
        }

        html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        const cameraConfig = selectedCameraId === 'environment'
          ? { facingMode: "environment" }
          : selectedCameraId;

        await html5QrCode.start(
          cameraConfig,
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
          },
          (decodedText) => {
            if (active) {
              setBarcode(decodedText);
              handleSearch(decodedText);
              setScanActive(false);
            }
          },
          () => {
            // Ignore parsing/scanning frame errors
          }
        );

        if (active) {
          isScanningRef.current = true;
        } else {
          html5QrCode.stop().catch(() => {});
        }
      } catch (err: any) {
        if (active) {
          console.error("Erro ao iniciar câmera:", err);
          const errMsg = err.message || String(err);
          let message = "Erro ao iniciar câmera selecionada.";
          if (errMsg.toUpperCase().includes("NOTREADABLE") || errMsg.toUpperCase().includes("SOURCE")) {
            message = "A câmera está em uso ou ocupada por outro app. Escolha 'Câmera Traseira Padrão' ou feche outras abas.";
          }
          addToast(message, "error", errMsg);
          
          // Automatic fallback to standard Environment camera if a specific camera id fails
          if (selectedCameraId !== 'environment') {
            setSelectedCameraId('environment');
          }
        }
      }
    };

    startCamera();

    return () => {
      active = false;
      if (html5QrCode && isScanningRef.current) {
        isScanningRef.current = false;
        html5QrCode.stop().catch((err) => {
          console.warn("Erro ao parar câmera:", err);
        });
      }
    };
  }, [scanActive, selectedCameraId, camerasLoaded, handleSearch, addToast]);

  const handleSaveItem = async () => {
    if (!foundedProduct || !selectedInventory || !quantity) return;
    
    try {
      const numericQtd = parseBankInput(quantity);
      if (numericQtd <= 0) {
        addToast('Quantidade deve ser maior que zero.', 'error');
        return;
      }

      const newItem: InventoryItem = {
        id_app: generateAppId(),
        inventario_id_app: selectedInventory.id_app,
        produto_id_app: foundedProduct.id_app,
        produto_referencia: foundedProduct.referencia,
        qtdade: numericQtd,
        date_update: new Date().toISOString()
      };
      
      await dbService.saveInventoryItem(newItem);
      const updated = await dbService.getInventoryItems(selectedInventory.id_app);
      setItems(updated);
      
      // Reset
      setFoundedProduct(null);
      setBarcode('');
      setQuantity('0,00');
      addToast('Lançamento salvo!', 'success');
    } catch (e: any) {
      addToast('Erro ao salvar item', 'error', e.message);
    }
  };

  const handleDeleteItem = async (idApp: string) => {
    showConfirm('Excluir Lançamento', 'Tem certeza que deseja excluir este lançamento?', async () => {
      try {
        await dbService.deleteInventoryItem(idApp);
        const updated = await dbService.getInventoryItems(selectedInventory.id_app);
        setItems(updated);
        addToast('Lançamento excluído!', 'success');
      } catch (e: any) {
        addToast('Erro ao excluir item', 'error', e.message);
      }
    });
  };

  const handleQuantityChange = (val: string) => {
    const numeric = parseBankInput(val);
    setQuantity(formatCurrency(numeric));
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <Header title={`Contagem: ${formatDate(selectedInventory.data)}`} onBack={onBack} />
      
      {/* Painel Superior Fixo: Campos de busca, scanner e produto ativo */}
      <div className="flex flex-col shrink-0 bg-white">
        <div className="bg-white px-4 py-4 border-b border-slate-200">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Referência do Produto</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" 
              placeholder="REF..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch(barcode);
                }
              }}
            />
            <button 
              type="button"
              onClick={() => handleSearch(barcode)}
              className="bg-slate-900 text-white p-3 rounded active:bg-slate-800 transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
            <button 
              type="button"
              onClick={() => setScanActive(true)}
              className="bg-blue-600 text-white p-3 rounded active:bg-blue-700 transition-colors"
              title="Escanear Código de Barras"
            >
              <Barcode className="w-5 h-5" />
            </button>
            <button 
              type="button"
              onClick={() => setCapturaConjuntoOpen(true)}
              className="bg-emerald-600 text-white p-3 rounded active:bg-emerald-700 transition-colors"
              title="Captura Conjunto"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Lançamento por Código:</span>
            <button
              type="button"
              onClick={() => setDigitarQtdMode(!digitarQtdMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all duration-200 border ${
                digitarQtdMode
                  ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm'
                  : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>{digitarQtdMode ? "Digitar Quantidade" : "Auto Lançar Qtd 1"}</span>
            </button>
          </div>
        </div>

        {scanActive && (
          <div className="p-4 bg-slate-100 flex flex-col gap-3">
            {!camerasLoaded ? (
              <div className="flex flex-col items-center justify-center py-8 bg-white rounded-3xl border border-slate-200 gap-3">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Acessando câmeras...</p>
              </div>
            ) : (
              <>
                {cameras.length > 0 && (
                  <div className="flex flex-col bg-white p-3 rounded-2xl border border-slate-200">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Selecionar Câmera
                    </label>
                    <select
                      className="w-full text-xs font-bold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                    >
                      <option value="environment">Câmera Traseira Padrão (Recomendada)</option>
                      {cameras.map((cam) => (
                        <option key={cam.id} value={cam.id}>
                          {cam.label || `Câmera (${cam.id.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                   <div id="reader" className="w-full overflow-hidden bg-slate-900 border-2 border-blue-500 rounded-3xl"></div>
                </motion.div>
              </>
            )}
            <button
              type="button"
              onClick={() => setScanActive(false)}
              className="w-full py-3.5 bg-red-500 text-white font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-100"
            >
              Fechar Câmera
            </button>
          </div>
        )}

        {foundedProduct && (
          <div className="p-4 bg-blue-600 text-white border-b border-blue-700">
            <motion.div 
              initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            >
               <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Identificado</p>
                  <h3 className="text-lg font-black uppercase tracking-tight leading-tight">{foundedProduct.descricao}</h3>
                  <p className="text-blue-200 text-xs mt-1 font-bold tracking-widest uppercase flex flex-wrap gap-2 items-center">
                    {foundedProduct.id_bm_produtosprincipal !== undefined && (
                      <span className="bg-blue-700/80 text-[10px] text-white px-1.5 py-0.5 rounded border border-blue-500 font-bold uppercase tracking-widest">Id: {foundedProduct.id_bm_produtosprincipal}</span>
                    )}
                    <span>Ref: {foundedProduct.referencia}</span>
                  </p>
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/20 flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-blue-100 mb-2">Quantidade</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    autoFocus
                    className="w-full bg-white text-slate-900 rounded p-4 text-2xl font-black border-none focus:ring-2 focus:ring-blue-400 transition-all outline-none"
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                  />
                </div>
                <button 
                  onClick={handleSaveItem}
                  className="bg-slate-900 text-white p-4 rounded active:bg-slate-800 transition-all"
                >
                  <Save className="w-6 h-6 text-blue-400" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Painel Inferior: Lista de Itens Lançados (Esta parte rola individualmente) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
          <h4 className="font-black text-slate-800 uppercase tracking-widest text-[10px] flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-500" /> Itens Lançados
          </h4>
          <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">
            Total: {items.length}
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="flex flex-col">
            {items.map((it: InventoryItem) => {
              const prod = products.find(p => p.id_app === it.produto_id_app || p.referencia === it.produto_referencia);
              const descricao = prod ? prod.descricao : '';
              return (
                <div key={it.id_app} className="bg-white p-4 border-b border-slate-100 flex justify-between items-center">
                   <div className="flex items-center gap-4 min-w-0">
                     <div className="w-8 h-8 rounded bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-blue-600 text-xs shrink-0">
                        {it.qtdade}
                     </div>
                     <div className="min-w-0">
                       <div className="flex flex-wrap items-baseline gap-x-2">
                         <span className="font-bold text-slate-800 uppercase text-sm tracking-tight">{it.produto_referencia}</span>
                         {descricao && (
                           <span className="text-xs font-semibold text-slate-500 uppercase truncate">
                             - {descricao}
                           </span>
                         )}
                       </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          {prod && prod.id_bm_produtosprincipal !== undefined && (
                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Id: {prod.id_bm_produtosprincipal}</span>
                          )}
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{formatDateTime(it.date_update)}</span>
                        </div>
                     </div>
                   </div>
                   <button 
                     onClick={() => handleDeleteItem(it.id_app)}
                     className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all shrink-0"
                   >
                      <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              );
            })}
            {items.length === 0 && !foundedProduct && (
              <div className="bg-slate-100/50 border border-dashed border-slate-200 py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                Sem lançamentos
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- Captura Conjunto Modal --- */}
      <AnimatePresence>
        {capturaConjuntoOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ y: 50, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              exit={{ y: 50, opacity: 0 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 border border-slate-100 my-auto"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" /> Captura Conjunto
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Contagem múltipla inteligente com IA</p>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setCapturaConjuntoOpen(false);
                    setCapturaSelectedProduct(null);
                    setCapturaProductType('');
                    setCapturaImageBase64('');
                    setCapturaCountResult(null);
                    setCapturaReasoning(null);
                    setCapturaFinalQty('0,00');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 active:scale-95 transition-all rounded-full bg-slate-50 border border-slate-100 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Product selection */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">1. Selecione o Produto no Estoque</label>
                <select
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
                  value={capturaSelectedProduct ? capturaSelectedProduct.id_app : ''}
                  onChange={(e) => {
                    const found = products.find(p => p.id_app === e.target.value);
                    if (found) {
                      setCapturaSelectedProduct(found);
                      setCapturaProductType(found.descricao);
                    } else {
                      setCapturaSelectedProduct(null);
                      setCapturaProductType('');
                    }
                  }}
                >
                  <option value="">-- Escolha o produto cadastrado --</option>
                  {products.map(p => (
                    <option key={p.id_app} value={p.id_app}>
                      [{p.referencia}] {p.descricao} {p.id_bm_produtosprincipal !== undefined ? `(Id: ${p.id_bm_produtosprincipal})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product description / category prompt */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">2. O que o robô deve contar? (Tipo de Produto)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-805 uppercase"
                  placeholder="Ex: camiseta, caixa, garrafa, etc."
                  value={capturaProductType}
                  onChange={(e) => setCapturaProductType(e.target.value)}
                />
              </div>

              {/* Camera Upload / Capture Container */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">3. Tirar Foto do Conjunto</label>
                <div 
                  className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all relative flex flex-col items-center justify-center min-h-[140px] cursor-pointer" 
                  onClick={() => document.getElementById('camera-file-input')?.click()}
                >
                  <input 
                    type="file" 
                    id="camera-file-input" 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setCapturaMimeType(file.type || 'image/jpeg');
                        const reader = new FileReader();
                        reader.onload = () => {
                          setCapturaImageBase64(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {capturaImageBase64 ? (
                    <div className="relative w-full max-h-[160px] rounded-lg overflow-hidden flex justify-center bg-black">
                      <img src={capturaImageBase64} alt="Suporte Contagem" className="object-contain h-[160px]" />
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCapturaImageBase64('');
                        }}
                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-700 active:scale-90 transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Usar Câmera do Celular</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Toque para tirar foto ou carregar arquivo</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit AI analysis */}
              <button
                type="button"
                disabled={!capturaImageBase64 || !capturaProductType || capturaLoading}
                onClick={handleAiCount}
                className={`w-full py-2.5 rounded text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  !capturaImageBase64 || !capturaProductType || capturaLoading
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]'
                }`}
              >
                {capturaLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Contando Peças...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Contar com Inteligência Artificial</span>
                  </>
                )}
              </button>

              {/* Response of AI evaluation */}
              {capturaCountResult !== null && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 animate-bounce" />
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">IA Contou: {capturaCountResult} unidade(s)</p>
                      {capturaReasoning && (
                        <p className="text-[10px] text-emerald-700 border-t border-emerald-200/50 pt-1 mt-1 font-bold leading-snug uppercase tracking-wide">{capturaReasoning}</p>
                      )}
                      
                      <div className="mt-3 pt-3 border-t border-emerald-200/50">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Confirmar Quantidade Identificada</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full bg-white border border-emerald-300 text-slate-900 rounded px-3 py-2 text-xl font-black outline-none focus:ring-1 focus:ring-emerald-500"
                          value={capturaFinalQty}
                          onChange={(e) => handleCapturaQtyChange(e.target.value)}
                        />
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ajuste o valor acima se o cálculo conter desvios.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Close/Acknowledge buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setCapturaConjuntoOpen(false);
                    setCapturaSelectedProduct(null);
                    setCapturaProductType('');
                    setCapturaImageBase64('');
                    setCapturaCountResult(null);
                    setCapturaReasoning(null);
                    setCapturaFinalQty('0,00');
                  }}
                  className="flex-1 border border-slate-200 text-slate-600 py-3 rounded text-[10px] font-black uppercase tracking-widest active:bg-slate-100 transition-all font-sans"
                >
                  Cancelar
                </button>
                {capturaCountResult !== null && capturaSelectedProduct && (
                  <button
                    type="button"
                    onClick={handleConfirmCapturaCount}
                    className="flex-1 bg-slate-900 text-white hover:bg-slate-800 py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all font-sans"
                  >
                    Confirmar e Gravar
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface SincronizarScreenProps {
  onBack: () => void;
  onSyncSuccess: () => void;
  addToast: (msg: string, type: 'success' | 'error', detail?: string) => void;
}

const SincronizarScreen = ({ onBack, onSyncSuccess, addToast }: SincronizarScreenProps) => {
  const [config, setConfig] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mysql_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            host: parsed.host || '',
            port: parsed.port || '3306',
            database: parsed.database || ''
          };
        } catch (e) {}
      }
    }
    return {
      host: '',
      port: '3306',
      database: ''
    };
  });

  useEffect(() => {
    let active = true;
    fetch('/api/sync')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        setConfig((prev: any) => ({
          host: prev.host || data.host || '',
          port: prev.port || data.port || '3306',
          database: prev.database || data.database || ''
        }));
      })
      .catch(err => {
        console.warn('Erro ao carregar configurações padrão do MySQL:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message?: string }>({ type: 'idle' });

  const handleSaveConfig = () => {
    localStorage.setItem('mysql_config', JSON.stringify(config));
    addToast('Configurações salvas localmente!', 'success');
  };

  const runAction = async (action: 'create_base' | 'sync') => {
    setStatus({ type: 'loading', message: action === 'create_base' ? 'Verificando e corrigindo estruturas...' : 'Sincronizando dados...' });
    try {
      // Local structure check for action create_base
      if (action === 'create_base') {
        const localInventories = await dbService.getInventoriesRaw();
        for (const inv of localInventories) {
          if (inv.ativo === undefined) {
             inv.ativo = 'S';
             await dbService.saveInventory(inv);
          }
        }
        const localProds = await dbService.getProducts();
        for (const p of localProds) {
          const items = await dbService.getInventoryItemsRaw(p.id_app);
          for (const it of items) {
            if (it.ativo === undefined) {
              it.ativo = 'S';
              await dbService.saveInventoryItem(it);
            }
          }
        }
      }

      const localProducts = await dbService.getProducts();
      const localInventories = await dbService.getInventoriesRaw();
      const allItems: InventoryItem[] = [];
      for(const inv of localInventories) {
        const items = await dbService.getInventoryItemsRaw(inv.id_app);
        allItems.push(...items);
      }

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          action,
          data: {
            localProducts,
            localInventories,
            localItems: allItems
          }
        })
      });

      const result = await res.json();
      if (result.success) {
        if (action === 'sync') {
          await dbService.clearAll();
          for(const p of result.data.products) await dbService.saveProduct(p);
          for(const i of result.data.inventories) await dbService.saveInventory(i);
          for(const it of result.data.items) await dbService.saveInventoryItem(it);
          onSyncSuccess();
        }
        setStatus({ type: 'success', message: result.message || 'Operação concluída com sucesso!' });
        addToast(action === 'create_base' ? 'Estrutura OK' : 'Sincronização OK', 'success');
      } else {
        setStatus({ type: 'error', message: result.error });
        addToast('Erro na operação', 'error', result.error);
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message });
      addToast('Falha técnica', 'error', e.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <Header title="Sincronizar" onBack={onBack} />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          <div className="bg-white p-6 border-b border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-tight text-sm">
              <Database className="w-5 h-5 text-blue-500" /> Configuração MySQL
            </h3>
            <div className="flex flex-col gap-4">
              <Input label="Host Remoto" value={config.host} onChange={v => setConfig({...config, host: v})} />
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Input label="Database" value={config.database} onChange={v => setConfig({...config, database: v})} />
                </div>
                <Input label="Port" value={config.port} onChange={v => setConfig({...config, port: v})} />
              </div>
              <button 
                onClick={handleSaveConfig}
                className="mt-2 text-white bg-slate-900 py-3 rounded font-bold uppercase tracking-widest text-[10px] shadow active:bg-slate-800 transition-all"
              >
                Salvar Localmente
              </button>
            </div>
          </div>

          <div className="px-4 py-4 grid grid-cols-1 gap-2">
            <button 
              disabled={status.type === 'loading'}
              onClick={() => runAction('create_base')}
              className="bg-white border border-slate-200 text-slate-700 py-4 rounded font-bold uppercase tracking-widest text-xs flex flex-col items-center gap-1 shadow-sm active:bg-slate-50 transition-colors disabled:opacity-50"
            >
              REESTRUTURAR BASES
              <span className="text-[9px] font-bold opacity-40 lowercase">Verifica estrutura no MySQL e Local</span>
            </button>

            <button 
              disabled={status.type === 'loading'}
              onClick={() => runAction('sync')}
              className="bg-blue-600 text-white py-6 rounded font-bold uppercase tracking-[0.2em] text-sm flex flex-col items-center gap-2 shadow-xl active:bg-blue-700 transition-all disabled:opacity-50"
            >
              <RefreshCcw className={`w-5 h-5 ${status.type === 'loading' ? 'animate-spin' : ''}`} />
              Sincronizar Agora
            </button>
          </div>

          {status.type !== 'idle' && (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={`p-4 rounded flex items-start gap-3 border ${
                status.type === 'loading' ? 'bg-blue-50 text-blue-800 border-blue-100' :
                status.type === 'success' ? 'bg-green-50 text-green-800 border-green-100' :
                'bg-red-50 text-red-800 border-red-100'
              }`}
            >
              <div className="mt-0.5">
                {status.type === 'loading' && <Clock className="w-4 h-4 animate-pulse shrink-0" />}
                {status.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
                {status.type === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">Status</p>
                <p className="text-xs font-bold leading-tight">{status.message}</p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- UI Helpers ---

const MenuButton = ({ icon, label, onClick, color }: { icon: React.ReactNode, label: string, onClick: () => void, color: string }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between h-[80px] px-6 bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors group`}
  >
    <div className="flex items-center gap-5">
      <div className={`w-12 h-12 rounded bg-slate-50 border border-slate-100 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform ${color}`}>
        {icon}
      </div>
      <span className="text-sm font-black text-slate-800 tracking-tight uppercase">{label}</span>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300" />
  </button>
);

const Header = ({ title, onBack }: { title: string, onBack: () => void }) => (
  <div className="h-[70px] bg-white px-6 border-b border-slate-100 flex items-center gap-5 sticky top-0 z-10">
    <button onClick={onBack} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded transition-colors border border-slate-200">
      <ArrowLeft className="w-5 h-5 text-slate-800" />
    </button>
    <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight truncate overflow-ellipsis">{title}</h2>
  </div>
);

const Input = ({ label, value, onChange, type = "text" }: { label: string, value: string, onChange: (v: string) => void, type?: string }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
    <input 
      type={type} 
      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold transition-all text-slate-800"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);
