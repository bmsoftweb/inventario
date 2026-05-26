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
  ArrowLeft,
  Barcode,
  Save,
  CheckCircle,
  Database,
  XCircle,
  Clock,
  ChevronRight,
  Trash2
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

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ title, message, onConfirm });
  };

  // Database state
  const [products, setProducts] = useState<Product[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(false);
  
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

  // Main Render
  return (
    <main className="w-full min-h-screen bg-slate-50 relative flex flex-col overflow-hidden text-slate-900 border-none">
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
          {currentScreen === 'sincronizar' && <SincronizarScreen onBack={() => setCurrentScreen('menu')} onSyncSuccess={loadData} addToast={addToast} />}
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
                <Trash2 className="w-8 h-8 text-slate-400" />
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
                  className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-200"
                >
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
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
    <div className="flex flex-col h-full bg-slate-50">
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
                  <div className="flex flex-wrap gap-2 mt-2">
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
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

const InventoriesScreen = ({ inventories, loadData, onBack, onSelectInventory, addToast, showConfirm }: InventoriesScreenProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);

  const handleCreate = async () => {
    try {
      const now = new Date().toISOString();
      const newInv: Inventory = {
        id_app: generateAppId(),
        data: newDate,
        date_update: now
      };
      await dbService.saveInventory(newInv);
      setIsCreating(false);
      loadData();
      addToast('Inventário criado com sucesso!', 'success');
    } catch (e: any) {
      addToast('Erro ao criar inventário', 'error', e.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Inventários" onBack={onBack} />
      
      <div className="bg-white border-b border-slate-200">
        <button 
          onClick={() => setIsCreating(true)}
          className="w-full bg-blue-600 text-white py-4 font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 active:bg-blue-700 transition-all"
        >
          <Plus className="w-5 h-5" /> Novo Inventário
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {inventories.map((inv: Inventory) => (
            <div key={inv.id_app} className="bg-white p-5 border-b border-slate-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight uppercase leading-none">Inventário {formatDate(inv.data)}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold tracking-widest">
                      <Clock className="w-3 h-3" />
                      Atu: {formatDateTime(inv.date_update)}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => onSelectInventory(inv)}
                  className="flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded font-bold active:bg-slate-800 transition-colors"
                >
                  <Type className="w-4 h-4 text-blue-400" /> 
                  <span className="text-[11px] uppercase tracking-widest">Digitar</span>
                </button>
                <button 
                  onClick={() => {/* Edit logic */}}
                  className="flex items-center justify-center gap-2 bg-slate-50 text-slate-500 py-3 rounded font-bold active:bg-slate-100 transition-colors border border-slate-200"
                >
                  <Edit className="w-4 h-4" /> 
                  <span className="text-[11px] uppercase tracking-widest">Editar</span>
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
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

const DigitarScreen = ({ products, selectedInventory, onBack, addToast, showConfirm }: DigitarScreenProps) => {
  const [scanActive, setScanActive] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [foundedProduct, setFoundedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('0,00');
  const [items, setItems] = useState<InventoryItem[]>([]);

  const handleSearch = useCallback(async (code: string) => {
    const found = products.find((p: Product) => p.referencia === code);
    if (found) {
      setFoundedProduct(found);
      setQuantity('1,00'); // Default to 1.00 when found
    } else {
      addToast('Produto não localizado.', 'error');
    }
  }, [products, addToast]);

  useEffect(() => {
    if (selectedInventory) {
      dbService.getInventoryItems(selectedInventory.id_app).then(setItems);
    }
  }, [selectedInventory]);

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const isScanningRef = React.useRef<boolean>(false);

  // Fetch cameras list when scanner is active
  useEffect(() => {
    if (!scanActive) {
      return;
    }

    let active = true;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!active) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
          
          // Check if our currently selected camera is still in the device list
          const hasSelected = devices.some(d => d.id === selectedCameraId);
          if (!hasSelected) {
            // Try to find a back camera
            const backCamera = devices.find(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('traseira') || 
              d.label.toLowerCase().includes('traseiro') || 
              d.label.toLowerCase().includes('environment') ||
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('0')
            );
            setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
          }
        } else {
          addToast("Nenhuma câmera encontrada.", "error");
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error("Erro ao listar câmeras:", err);
        addToast("Não foi possível acessar a lista de câmeras.", "error", err.message || String(err));
      });

    return () => {
      active = false;
    };
  }, [scanActive, addToast, selectedCameraId]);

  // Start scanner when scanActive and selectedCameraId are ready
  useEffect(() => {
    if (!scanActive || !selectedCameraId) {
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

        await html5QrCode.start(
          selectedCameraId,
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
          addToast("Erro ao iniciar câmera selecionada.", "error", err.message || String(err));
          setScanActive(false);
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
  }, [scanActive, selectedCameraId, handleSearch, addToast]);

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
    <div className="flex flex-col h-full bg-slate-50">
      <Header title={`Contagem: ${formatDate(selectedInventory.data)}`} onBack={onBack} />
      
      <div className="flex flex-col overflow-y-auto">
        <div className="flex flex-col">
          <div className="bg-white px-4 py-4 border-b border-slate-200">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Referência do Produto</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" 
                placeholder="REF..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
              <button 
                onClick={() => handleSearch(barcode)}
                className="bg-slate-900 text-white p-3 rounded active:bg-slate-800 transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setScanActive(true)}
                className="bg-blue-600 text-white p-3 rounded active:bg-blue-700 transition-colors"
              >
                <Barcode className="w-5 h-5" />
              </button>
            </div>
          </div>

          {scanActive && (
            <div className="p-4 bg-slate-100 flex flex-col gap-3">
              {cameras.length > 1 && (
                <div className="flex flex-col bg-white p-3 rounded-2xl border border-slate-200">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                    Selecionar Câmera
                  </label>
                  <select
                    className="w-full text-xs font-bold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                  >
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
                    <p className="text-blue-200 text-xs mt-1 font-bold tracking-widest uppercase">Ref: {foundedProduct.referencia}</p>
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

          <div className="mt-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h4 className="font-black text-slate-800 uppercase tracking-widest text-[10px] flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-blue-500" /> Itens Lançados
              </h4>
              <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">
                Total: {items.length}
              </span>
            </div>
            <div className="flex flex-col">
              {items.map((it: InventoryItem) => (
                <div key={it.id_app} className="bg-white p-4 border-b border-slate-100 flex justify-between items-center">
                   <div className="flex items-center gap-4">
                     <div className="w-8 h-8 rounded bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-blue-600 text-xs">
                        {it.qtdade}
                     </div>
                     <div>
                       <span className="font-bold text-slate-800 uppercase text-sm tracking-tight">{it.produto_referencia}</span>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{formatDateTime(it.date_update)}</p>
                     </div>
                   </div>
                   <button 
                     onClick={() => handleDeleteItem(it.id_app)}
                     className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all"
                   >
                      <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              ))}
              {items.length === 0 && !foundedProduct && (
                <div className="bg-slate-100/50 border border-dashed border-slate-200 py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                  Sem lançamentos
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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
      if (saved) return JSON.parse(saved);
    }
    return {
      host: '',
      port: '3306',
      user: '',
      password: '',
      database: ''
    };
  });
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
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Sincronizar" onBack={onBack} />
      <div className="flex flex-col overflow-y-auto">
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
              <Input label="Usuário" value={config.user} onChange={v => setConfig({...config, user: v})} />
              <Input label="Senha" type="password" value={config.password} onChange={v => setConfig({...config, password: v})} />
              
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
